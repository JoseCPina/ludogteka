// Lo común de la recolección de precios del Índice PeluDesk (scripts/mercado/*.mjs): la base (desarrollo por
// .env.local; producción con --prod y la llave de servicio leída al vuelo por el CLI), la corrida en
// precios_mercado_corridas, la inserción sin duplicados (huella), el límite de velocidad por sitio, robots.txt y
// el tope de gasto de IA (300 MXN entre todas las corridas de los últimos 31 días de esa fuente).
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { costoIaMxn, HERRAMIENTA_PRECIOS, limpiarClasificacion, robotsPermite, SISTEMA_CLASIFICAR_PRECIOS, usuarioClasificar } from "../../src/lib/mercado/extraer.ts";
import { precioCreible, servicioMercado } from "../../src/lib/mercado/catalogo.ts";
import { crearIAConUso } from "../../src/lib/mercado/ia.ts";

export const args = process.argv.slice(2);
export const valor = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
export const lista = (k) => valor(k)?.split(",").map((x) => x.trim()).filter(Boolean);
export const prod = args.includes("--prod");
export const TOPE_IA_MXN = Number(valor("--tope-ia") ?? 300);
export const AGENTE = "Mozilla/5.0 (compatible; PeluDeskBot/1.0; +https://peludesk.mx)";

export const env = fs.existsSync(".env.local")
  ? Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }))
  : {};

export async function abrirBase() {
  if (prod) {
    const { servicioSinNegocio } = await import("../lib/prod.mjs");
    return servicioSinNegocio();
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes("sgfolltpvktbsiisfuzq")) throw new Error("Sin --prod esto solo corre contra DESARROLLO.");
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
}

export function abrirIA() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return crearIAConUso({ apiKey, workspace: process.env.ANTHROPIC_WORKSPACE_ID || env.ANTHROPIC_WORKSPACE_ID || null, url: process.env.ANTHROPIC_API_URL || undefined });
}

/** Lee TODO con la API (de 1,000 en 1,000, orden por llave única al final). */
export async function todas(consulta) {
  const salida = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw new Error(error.message);
    salida.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return salida;
}

// ── Corrida ────────────────────────────────────────────────────────────────────────────────────────────────────
export class Corrida {
  constructor(db, fuente) {
    this.db = db;
    this.fuente = fuente;
    this.revisados = 0;
    this.encontrados = 0;
    this.insertados = 0;
    this.errores = 0;
    this.costoIa = 0;
    this.gastoUsd = 0;
    this.detalle = { errores: [], notas: [] };
    this.id = null;
  }
  async empezar() {
    const { data, error } = await this.db.from("precios_mercado_corridas").insert({ fuente: this.fuente, origen: "script" }).select("id").single();
    if (error) throw new Error(`corrida: ${error.message}`);
    this.id = data.id;
    const { data: previas } = await this.db.from("precios_mercado_corridas").select("costo_ia_mxn").eq("fuente", this.fuente).gte("inicio_at", new Date(Date.now() - 31 * 86_400_000).toISOString()).is("deleted_at", null).limit(500);
    this.costoIaPrevio = (previas ?? []).reduce((n, c) => n + Number(c.costo_ia_mxn || 0), 0);
    console.log(`corrida ${this.id} (${this.fuente}) · IA gastada en 31 días: $${this.costoIaPrevio.toFixed(2)} MXN de $${TOPE_IA_MXN}`);
    return this;
  }
  get iaAgotada() {
    return this.costoIaPrevio + this.costoIa >= TOPE_IA_MXN;
  }
  error(texto) {
    this.errores++;
    if (this.detalle.errores.length < 60) this.detalle.errores.push(String(texto).slice(0, 200));
  }
  async guardar(estado = "corriendo", error = null) {
    await this.db.from("precios_mercado_corridas").update({ estado, fin_at: estado === "corriendo" ? null : new Date().toISOString(), revisados: this.revisados, encontrados: this.encontrados, insertados: this.insertados, errores: this.errores, costo_ia_mxn: Math.round(this.costoIa * 100) / 100, gasto_usd: Math.round(this.gastoUsd * 100) / 100, detalle: this.detalle, error }).eq("id", this.id);
  }
  async terminar(error = null) {
    await this.guardar(error ? "fallida" : "terminada", error ? String(error).slice(0, 400) : null);
    console.log(`\n${prod ? "PRODUCCIÓN" : "desarrollo"} · ${this.fuente} · revisados ${this.revisados} · precios encontrados ${this.encontrados} · insertados ${this.insertados} · IA $${this.costoIa.toFixed(2)} MXN · Places $${this.gastoUsd.toFixed(2)} USD · errores ${this.errores}`);
  }
}

// ── Inserción ──────────────────────────────────────────────────────────────────────────────────────────────────
const mes = () => new Date().toISOString().slice(0, 7);
export const huellaDe = (partes) => createHash("sha256").update(partes.join("|")).digest("hex").slice(0, 40);

/** Inserta filas de precios_mercado sin duplicar (huella por fuente, origen, servicio, talla, precio y mes). */
export async function insertarPrecios(db, corrida, filas) {
  const listas = filas.map((f) => ({
    giro: f.giro,
    servicio: f.servicio,
    talla: f.talla ?? null,
    precio: Math.round(Number(f.precio) * 100) / 100,
    ciudad: f.ciudad ?? null,
    estado: f.estado ?? null,
    fuente: f.fuente,
    url: f.url?.slice(0, 500) ?? null,
    prospecto_id: f.prospecto_id ?? null,
    detalle: f.detalle?.slice(0, 400) ?? null,
    valido: precioCreible(f.servicio, Number(f.precio)),
    huella: huellaDe([f.fuente, f.origen ?? f.url ?? f.prospecto_id ?? "", f.servicio, f.talla ?? "-", String(f.precio), mes()]),
  }));
  for (let i = 0; i < listas.length; i += 200) {
    const lote = listas.slice(i, i + 200);
    const { data, error } = await db.from("precios_mercado").upsert(lote, { onConflict: "huella", ignoreDuplicates: true }).select("id");
    if (error) {
      corrida.error(`insertar: ${error.message}`);
      continue;
    }
    corrida.insertados += (data ?? []).length;
  }
}

// ── IA ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Clasifica candidatos en lotes de 30; respeta el tope de gasto. Devuelve [{...candidato, servicio, talla}] solo los que sí son de un servicio. */
export async function clasificarCandidatos(ia, corrida, candidatos) {
  const salida = [];
  if (!ia) {
    corrida.detalle.notas.push("sin ANTHROPIC_API_KEY: no se clasificó nada");
    return salida;
  }
  for (let i = 0; i < candidatos.length; i += 30) {
    if (corrida.iaAgotada) {
      corrida.detalle.notas.push(`tope de IA alcanzado ($${TOPE_IA_MXN} MXN): quedaron ${candidatos.length - i} candidatos sin clasificar`);
      break;
    }
    const lote = candidatos.slice(i, i + 30);
    try {
      const r = await ia(SISTEMA_CLASIFICAR_PRECIOS, usuarioClasificar(lote), HERRAMIENTA_PRECIOS, 3000);
      corrida.costoIa += costoIaMxn(r.tokensIn, r.tokensOut);
      const porId = new Map(lote.map((c) => [c.id, c]));
      for (const c of limpiarClasificacion(r.entrada, lote)) {
        if (!c.servicio) continue;
        const o = porId.get(c.id);
        salida.push({ ...o, servicio: c.servicio, talla: c.talla, giro: servicioMercado(c.servicio).giro });
      }
    } catch (e) {
      corrida.error(`IA: ${e.message}`);
    }
  }
  return salida;
}

// ── Red: velocidad por sitio y robots ──────────────────────────────────────────────────────────────────────────
const ultimaPorHost = new Map();
const robotsPorHost = new Map();

async function esperarTurno(host, msEntre = 1200) {
  const ultima = ultimaPorHost.get(host) ?? 0;
  const falta = ultima + msEntre - Date.now();
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
  ultimaPorHost.set(host, Date.now());
}

export async function robotsDe(origen) {
  const host = new URL(origen).host;
  if (robotsPorHost.has(host)) return robotsPorHost.get(host);
  let texto = null;
  try {
    const r = await fetch(`${new URL(origen).origin}/robots.txt`, { headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(6000), redirect: "follow" });
    if (r.ok && /text/i.test(r.headers.get("content-type") ?? "text")) texto = (await r.text()).slice(0, 200_000);
  } catch {
    texto = null;
  }
  robotsPorHost.set(host, texto);
  return texto;
}

/** Baja una página respetando robots.txt y 1.2 s entre peticiones al mismo sitio. Devuelve null si no se puede. */
export async function bajarPagina(url, { topeMs = 10_000, maxBytes = 1_500_000 } = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { html: null, motivo: "url inválida" };
  }
  if (!/^https?:$/.test(u.protocol)) return { html: null, motivo: "no es http" };
  const robots = await robotsDe(u.origin);
  if (!robotsPermite(robots, u.pathname + u.search)) return { html: null, motivo: "robots.txt lo prohíbe" };
  await esperarTurno(u.host);
  try {
    const r = await fetch(u.href, { headers: { "User-Agent": AGENTE, Accept: "text/html,application/xhtml+xml", "Accept-Language": "es-MX,es;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(topeMs) });
    if (!r.ok) return { html: null, motivo: `HTTP ${r.status}` };
    const tipo = r.headers.get("content-type") ?? "";
    if (tipo && !/html|text/i.test(tipo)) return { html: null, motivo: "no es una página" };
    return { html: (await r.text()).slice(0, maxBytes), motivo: null, url: r.url };
  } catch (e) {
    return { html: null, motivo: e.name === "TimeoutError" ? "tiempo agotado" : e.message?.slice(0, 80) ?? "error de red" };
  }
}

/** Corre `trabajo` sobre `elementos` con hasta `n` a la vez. */
export async function enParalelo(elementos, n, trabajo) {
  const cola = [...elementos];
  const obreros = Array.from({ length: n }, async () => {
    while (cola.length) await trabajo(cola.shift());
  });
  await Promise.all(obreros);
}
