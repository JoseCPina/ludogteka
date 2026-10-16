// ¿Un video tutorial quedó DESACTUALIZADO de verdad? Decide por lo que se ve, no por el código que cambió.
//
//   node scripts/tutoriales/verificar-visual.mjs --marcados [--aplicar]       los videos hoy «por actualizar» (desarrollo)
//   node scripts/tutoriales/verificar-visual.mjs --desde origin/main          los que afectados.mjs propone por el diff de código
//   node scripts/tutoriales/verificar-visual.mjs --videos 01,32,80            esos videos
//   … [--base http://patitasyco.localhost:3001] [--levantar] [--json salida.json] [--subir [--prod]] [--depurar]
//
// Para cada video recorre en el demo (cuentas gemelas del corredor, 1920×1080, la misma resolución de la
// grabación) las pantallas que el video enseña, SOLO LEYENDO: sigue el guion en lo que es navegación (`ir` y
// los clics a un enlace) y se detiene donde habría que escribir o apretar un botón. De cada pantalla toma una
// captura y la compara contra los fotogramas del master grabado (el más parecido dentro de las escenas en que
// esa pantalla sale), con tolerancia: ignora el cursor, el resaltado, la etiqueta del paso y los datos que
// cambian solos (fechas, horas, contadores). Además comprueba que cada botón o texto que el guion nombra en
// una pantalla limpia siga existiendo.
//
// Resultado por video: «cambio» (hay una diferencia real de diseño o de texto; guarda la captura de la
// diferencia en scripts/tutoriales/diferencias/<NN>/ y, con --subir, en el bucket privado tutoriales-masters),
// «igual» o «sin_comparar» (no hubo con qué comparar: no se puede afirmar que sigue igual, así que se trata
// como cambio). Con --aplicar, desmarca los «igual» y deja marcados los demás con el motivo visual.
// Sale con 0 siempre; el JSON dice todo. Lo corre `npm run desplegar` y se puede correr a mano.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { VIDEOS } from "./catalogo.mjs";
import { cargarGuion } from "./lib/guion.mjs";
import { conectar } from "./lib/db.mjs";
import { cookiesDe, CUENTAS } from "./lib/sesion.mjs";
import { SLUG_DEMO } from "./lib/demo.mjs";
import { DIR_SALIDA } from "./lib/estado.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { UMBRALES, fotogramasGris, fotogramaPng, grisDe, distancia, compararBloques, imagenDiferencia } from "./lib/visual.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR_DIF = path.join(AQUI, "diferencias");
const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const BASE = (val("--base") ?? `http://${SLUG_DEMO}.localhost:3001`).replace(/\/$/, "");
const HOST = new URL(BASE).host;
if (!HOST.startsWith(`${SLUG_DEMO}.`)) throw new Error(`Se verifica SOLO en el negocio demo (${SLUG_DEMO}.*), no en ${HOST}.`);
const DEPURAR = flag("--depurar");
const sens = Number(val("--sensibilidad") ?? 1) || 1; // >1 marca con menos diferencia
const U = { tinta: UMBRALES.tinta, brillo: UMBRALES.brillo / sens, mancha: Math.round(UMBRALES.mancha / sens), fraccion: UMBRALES.fraccion / sens };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...x) => console.error(...x); // stdout queda para el JSON (--json -)

const cd = conectar(false);

// ── Qué videos ──
async function elegirVideos() {
  if (val("--videos")) return val("--videos").split(",").map((s) => s.trim().padStart(2, "0"));
  if (flag("--marcados")) {
    const { data, error } = await cd.cliente.from("tutoriales").select("numero, por_actualizar_motivo").not("por_actualizar_desde", "is", null).is("deleted_at", null).order("numero");
    if (error) throw new Error(error.message);
    return (data ?? []).map((x) => x.numero);
  }
  if (val("--desde")) {
    const r = spawnSync(process.execPath, [path.join(AQUI, "afectados.mjs"), val("--desde"), "--json"], { encoding: "utf8" });
    return JSON.parse(r.stdout || "[]").map((x) => x.numero);
  }
  throw new Error("Falta --marcados, --desde <base> o --videos NN,NN");
}

// ── Servidor ──
// Node no resuelve `<slug>.localhost`: se pega a 127.0.0.1 con el Host puesto (como el corredor).
function servidorArriba() {
  return new Promise((resolve) => {
    http.get({ host: "127.0.0.1", port: new URL(BASE).port || 3001, path: "/login", headers: { host: HOST }, timeout: 8000 }, (r) => { r.resume(); resolve(r.statusCode < 500); }).on("error", () => resolve(false)).on("timeout", function () { this.destroy(); resolve(false); });
  });
}
let servidor = null;
async function asegurarServidor() {
  if (await servidorArriba()) return;
  if (!flag("--levantar")) throw new Error(`El servidor no responde en ${BASE}. Compila y levántalo (npm run build && npm run start -- -p 3001) o usa --levantar.`);
  const puerto = new URL(BASE).port || "3001";
  if (!fs.existsSync(".next/BUILD_ID")) {
    log("Compilando la app (npm run build)…");
    const b = spawnSync("npm", ["run", "build"], { stdio: ["ignore", "ignore", "inherit"], shell: true });
    if (b.status !== 0) throw new Error("npm run build falló.");
  }
  log(`Levantando la app en el ${puerto}…`);
  servidor = spawn("npm", ["run", "start", "--", "-p", puerto], { stdio: "ignore", shell: true, detached: process.platform !== "win32" });
  for (let i = 0; i < 60; i++) { await espera(1500); if (await servidorArriba()) return; }
  throw new Error("La app no levantó.");
}
const detener = () => {
  if (!servidor) return;
  try { if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(servidor.pid), "/T", "/F"], { stdio: "ignore" }); else process.kill(-servidor.pid); } catch { /* ya no está */ }
  servidor = null;
};
process.on("exit", detener);

// ── El master y sus tiempos ──
async function obtenerMaster(v) {
  const dir = path.join(DIR_SALIDA, v.id);
  const local = path.join(dir, "master-1080p.mp4");
  if (fs.existsSync(local)) return local;
  const rutaStorage = `${v.id}-${v.slug}/master-1080p.mp4`;
  const { data, error } = await cd.cliente.storage.from("tutoriales-masters").download(rutaStorage);
  if (error || !data) return null;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(local, Buffer.from(await data.arrayBuffer()));
  return local;
}
async function obtenerTiempos(v) {
  const t = path.join(DIR_SALIDA, v.id, "tiempos.json");
  if (fs.existsSync(t)) { const j = JSON.parse(fs.readFileSync(t, "utf8")).tiempos; return { escenas: j.escenas.map((e) => ({ ini: e.ini, fin: e.fin })), resumenIni: j.resumen?.ini ?? null }; }
  const { data: tj } = await cd.cliente.storage.from("tutoriales-masters").download(`${v.id}-${v.slug}/tiempos.json`);
  if (tj) { const j = JSON.parse(await tj.text()).tiempos; return { escenas: j.escenas.map((e) => ({ ini: e.ini, fin: e.fin })), resumenIni: j.resumen?.ini ?? null }; }
  // Respaldo: los capítulos de youtube.txt (al segundo): Introducción, una por escena, Resumen.
  let texto = null;
  const loc = path.join(DIR_SALIDA, v.id, "youtube.txt");
  if (fs.existsSync(loc)) texto = fs.readFileSync(loc, "utf8");
  else { const { data } = await cd.cliente.storage.from("tutoriales-masters").download(`${v.id}-${v.slug}/youtube.txt`); if (data) texto = await data.text(); }
  if (!texto) return null;
  const caps = [...(texto.match(/Capítulos\n([\s\S]*?)\n\n/)?.[1] ?? "").matchAll(/^(\d+):(\d{2})\s+(.+)$/gm)].map((m) => ({ t: Number(m[1]) * 60 + Number(m[2]), nombre: m[3] }));
  if (caps.length < 3) return null;
  const escenas = caps.slice(1, -1).map((c, i, a) => ({ ini: c.t, fin: (a[i + 1]?.t ?? caps.at(-1).t) - 0.3 }));
  return { escenas, resumenIni: caps.at(-1).t };
}

// ── La pantalla viva ──
const INICIALIZAR = () => {
  const ocultar = () => {
    if (!document.body) return;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (/ludogteka/i.test(n.textContent) && n.parentElement && !["SCRIPT", "STYLE", "NOSCRIPT"].includes(n.parentElement.tagName) && !n.parentElement.dataset.pdOculto) { n.parentElement.dataset.pdOculto = "1"; n.parentElement.style.visibility = "hidden"; }
    }
  };
  // El dueño del portal entra con la cuenta del visitante (solo lectura), que lleva el aviso de «Negocio de demostración»; la
  // grabación usa esa cuenta ya desbloqueada y no lo trae: se quita para que no recorra toda la pantalla hacia abajo.
  const sinAviso = () => { for (const d of document.querySelectorAll("div, section, header")) if (!d.dataset.pdAviso && d.children.length < 6 && /^Negocio de demostración/.test((d.textContent ?? "").trim()) && (d.textContent ?? "").length < 220) { d.dataset.pdAviso = "1"; d.style.display = "none"; } };
  new MutationObserver(() => { ocultar(); sinAviso(); }).observe(document, { childList: true, subtree: true, characterData: true });
  document.addEventListener("DOMContentLoaded", () => { ocultar(); sinAviso(); });
  setInterval(() => { ocultar(); sinAviso(); }, 400);
};
const ESTILO = "nextjs-portal{display:none!important}input[type=file]{visibility:hidden!important}*{caret-color:transparent!important}html{scrollbar-width:none}::-webkit-scrollbar{display:none}";

async function asentar(page) {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.addStyleTag({ content: ESTILO }).catch(() => {});
  // Una pantalla con `loading.tsx` muestra un esqueleto un rato aunque la red ya esté quieta: se espera a que se vaya.
  await page.waitForFunction(() => !document.querySelector(".animate-pulse, [aria-busy='true']"), null, { timeout: 15000 }).catch(() => {});
  await espera(900);
}

/** ¿Hay en pantalla algo con ese nombre? Misma búsqueda que el grabador (botón, enlace, pestaña… campo, texto). */
async function existe(page, objetivo, ms = 2500) {
  if (typeof objetivo !== "string") return true;
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (objetivo.startsWith("css:")) { if (await page.locator(objetivo.slice(4)).first().isVisible().catch(() => false)) return true; }
    else {
      for (const rol of ["button", "link", "tab", "menuitem", "checkbox", "radio", "switch", "option"]) {
        const l = page.getByRole(rol, { name: objetivo, exact: false });
        const n = await l.count();
        for (let i = 0; i < n; i++) if (await l.nth(i).isVisible().catch(() => false)) return true;
      }
      for (const l of [page.getByLabel(objetivo, { exact: false }), page.getByPlaceholder(objetivo, { exact: false }), page.getByText(objetivo, { exact: false })]) {
        const n = await l.count();
        for (let i = 0; i < n; i++) if (await l.nth(i).isVisible().catch(() => false)) return true;
      }
    }
    await espera(300);
  }
  return false;
}
/** El enlace (a[href] del mismo sitio) que corresponde a ese texto, o null. Solo se sigue un enlace: nunca se aprieta un botón. */
async function enlaceDe(page, objetivo) {
  if (typeof objetivo !== "string") return null;
  if (objetivo.startsWith("css:")) {
    // Un selector que apunta a un <a href> (o a algo dentro de uno) también es un enlace.
    const e = page.locator(objetivo.slice(4)).locator("xpath=ancestor-or-self::a[@href][1]").first();
    return (await e.count()) && (await e.isVisible().catch(() => false)) ? e : null;
  }
  const l = page.getByRole("link", { name: objetivo, exact: false });
  const n = await l.count();
  for (let i = 0; i < n; i++) if (await l.nth(i).isVisible().catch(() => false)) return l.nth(i);
  const t = page.getByText(objetivo, { exact: false }).locator("xpath=ancestor-or-self::a[@href][1]");
  const m = await t.count();
  for (let i = 0; i < m; i++) if (await t.nth(i).isVisible().catch(() => false)) return t.nth(i);
  return null;
}

// Un texto que el guion busca solo cuenta como «ya no está» si es vocabulario de la app (aparece en src/): un nombre de
// cliente, de mascota o de una fila del demo cambia con los datos y no dice nada del diseño.
let VOCABULARIO = null;
const sinAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function esDeLaApp(texto) {
  if (/^css:/.test(texto)) return false;
  if (!VOCABULARIO) {
    const acc = [];
    const rec = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else if (/.(tsx?|json)$/.test(e.name)) acc.push(fs.readFileSync(p, "utf8")); } };
    rec("src");
    VOCABULARIO = sinAcentos(acc.join(" "));
  }
  return VOCABULARIO.includes(sinAcentos(texto));
}
// Una pantalla de UN registro (/caja/cobrar/<id>, /portal/perros/<id>) cambia de contenido con los datos del demo (otra cuenta, otro
// perro): se le pide el doble de mancha para marcarla.
const umbralesDe = (url) => (/[0-9a-f]{8}-[0-9a-f]{4}-/.test(url) ? { ...U, mancha: U.mancha * 2, fraccion: U.fraccion * 2 } : U);
const dependeDeDatos = (x) => JSON.stringify(x, (k, y) => (typeof y === "function" ? "{fn}" : y)).includes("{");
const slugRuta = (u) => (new URL(u, "http://x").pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "inicio").slice(0, 50);

/** Recorre el guion solo leyendo. Devuelve las pantallas (con su captura) y los textos que ya no están. */
async function recorrer(ctx, guion) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  const pantallas = [];
  const ausentes = [];
  const notas = [];
  let sucio = false;
  const ausente = (escena, objetivo, page) => { if (esDeLaApp(String(objetivo))) ausentes.push({ escena, texto: String(objetivo), en: new URL(page.url()).pathname }); else notas.push(`«${objetivo}» no se encontró, pero depende de los datos del demo`); };
  const tomar = async (escena, motivo) => {
    const png = await page.screenshot({ type: "png" });
    pantallas.push({ escena, url: new URL(page.url()).pathname, motivo, png });
  };
  const irA = async (ruta, escena, motivo) => {
    const r = await page.goto(BASE + ruta, { waitUntil: "load", timeout: 60000 }).catch((e) => ({ error: e }));
    if (!r || r.error || (r.status && r.status() >= 400) || /\/login|\/sin-acceso/.test(page.url())) { notas.push(`no abrió ${ruta} (${r?.status?.() ?? "error"}, ${new URL(page.url()).pathname})`); return false; }
    await asentar(page);
    await tomar(escena, motivo);
    sucio = false;
    return true;
  };
  if (dependeDeDatos(guion.inicio)) { notas.push("el inicio depende de datos preparados"); await page.close(); return { pantallas, ausentes, notas }; }
  const abrio = await irA(guion.inicio, 1, "inicio");
  if (!abrio) { await page.close(); return { pantallas, ausentes, notas }; }
  let ruta = true;
  for (const [i, escena] of guion.escenas.entries()) {
    for (const paso of escena.pasos ?? []) {
      const [verbo, objetivo] = paso;
      const opciones = typeof paso.at(-1) === "object" && !Array.isArray(paso.at(-1)) ? paso.at(-1) : {};
      if (!ruta) { if (verbo === "ir" && typeof objetivo === "string" && !dependeDeDatos(objetivo)) ruta = await irA(objetivo, i + 1, "ir"); continue; }
      if (verbo === "ir") {
        if (dependeDeDatos(objetivo)) { sucio = true; notas.push(`ir a una ruta con datos (${objetivo})`); } else ruta = await irA(objetivo, i + 1, "ir");
      } else if (verbo === "clic" || verbo === "marcar") {
        if (dependeDeDatos(objetivo)) { sucio = true; continue; }
        if (!sucio && !(await existe(page, objetivo))) { ausente(i + 1, objetivo, page); sucio = true; continue; }
        if (opciones.nav && !sucio) {
          const enlace = await enlaceDe(page, objetivo);
          if (!enlace) { notas.push(`«${objetivo}» no es un enlace: no se sigue`); sucio = true; continue; }
          const antes = page.url();
          await Promise.all([page.waitForURL((u) => u.href !== antes, { timeout: 20000 }).catch(() => {}), enlace.click({ timeout: 8000 }).catch(() => {})]);
          if (page.url() === antes) { notas.push(`«${objetivo}» no cambió de pantalla`); continue; }
          if (/\/login|\/sin-acceso/.test(page.url())) { notas.push(`«${objetivo}» llevó a ${new URL(page.url()).pathname}`); ruta = false; continue; }
          await asentar(page);
          await tomar(i + 1, `clic «${objetivo}»`);
        } else sucio = true;
      } else if (["resaltar", "zoom", "desplazar", "mover"].includes(verbo)) {
        if (!sucio && !dependeDeDatos(objetivo) && !(await existe(page, objetivo))) ausente(i + 1, objetivo, page);
      } else if (["escribir", "rellenar", "elegir", "subir", "tecla", "js"].includes(verbo)) {
        if (!sucio && ["escribir", "rellenar", "elegir"].includes(verbo) && !dependeDeDatos(objetivo) && !(await existe(page, objetivo))) ausente(i + 1, objetivo, page);
        sucio = true;
      }
    }
  }
  await page.close();
  return { pantallas, ausentes, notas };
}

// ── Un video ──
async function verificar(navegador, v, cookiesPorRol) {
  const res = { id: v.id, titulo: v.titulo, estado: "sin_comparar", pantallas: [], ausentes: [], notas: [] };
  const guion = await cargarGuion(v);
  if (!guion) { res.notas.push("no tiene guion (video sin grabar)"); res.estado = "sin_grabar"; return res; }
  const master = await obtenerMaster(v);
  if (!master) { res.notas.push("no encontré el master grabado"); return res; }
  const tiempos = await obtenerTiempos(v);
  if (!tiempos) { res.notas.push("no encontré los tiempos de las escenas"); return res; }

  const rol = guion.rol ?? v.rol;
  const ctx = await navegador.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: "es-MX", timezoneId: "America/Mexico_City" });
  try {
    if (!guion.sinSesion) { if (!cookiesPorRol[rol]) cookiesPorRol[rol] = await cookiesDe(cd, rol, HOST.split(":")[0], process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fs.readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim()); await ctx.addCookies(cookiesPorRol[rol]); }
    await ctx.addInitScript(INICIALIZAR);
    const rec = await recorrer(ctx, guion);
    res.ausentes = rec.ausentes;
    res.notas.push(...rec.notas);
    if (!rec.pantallas.length) return res;

    const hasta = tiempos.resumenIni ?? tiempos.escenas.at(-1).fin;
    const cuadros = fotogramasGris(master, { desde: 0, hasta });
    const n = tiempos.escenas.length;
    for (const [k, p] of rec.pantallas.entries()) {
      const sig = rec.pantallas[k + 1];
      const ini = tiempos.escenas[Math.min(p.escena, n) - 1].ini;
      const fin = !sig ? tiempos.escenas[n - 1].fin : sig.escena === p.escena ? tiempos.escenas[p.escena - 1].fin : tiempos.escenas[sig.escena - 2].fin + 0.8;
      const candidatos = cuadros.filter((c) => c.t >= ini - 0.2 && c.t <= fin + 0.2);
      if (!candidatos.length) { res.notas.push(`${p.url}: sin fotogramas entre ${ini.toFixed(1)} y ${fin.toFixed(1)} s`); continue; }
      const vivoGrueso = await grisDe(p.png, { w: 480, h: 270, z: true });
      // Los 8 fotogramas más parecidos a primera vista (a ≥ 1 s uno de otro) se comparan a fondo y gana el que menos difiere:
      // dentro de una escena la pantalla aparece con zoom, con resaltado, a medio cargar… y el más parecido de lejos no siempre
      // es el mismo momento.
      const ordenados = candidatos.map((c) => ({ t: c.t, d: distancia(vivoGrueso, c.gris, 480, 270) })).sort((a, b) => a.d - b.d);
      const elegidos = [];
      for (const c of ordenados) { if (elegidos.length >= 8) break; if (elegidos.every((e) => Math.abs(e.t - c.t) >= 1)) elegidos.push(c); }
      const grisVivo = await grisDe(p.png);
      let mejor = null, cmp = null, grabadoPng = null;
      for (const c of elegidos) {
        const png = fotogramaPng(master, c.t);
        const r = compararBloques(await grisDe(png), grisVivo, umbralesDe(p.url));
        const peso = r.manchaMayor * 1000 + r.bloquesDistintos;
        if (!cmp || peso < cmp.peso) { cmp = { ...r, peso }; mejor = c; grabadoPng = png; }
      }
      const fila = { escena: p.escena, url: p.url, como: p.motivo, tiempo: Number(mejor.t.toFixed(1)), distancia: Number(mejor.d.toFixed(3)), cambio: cmp.cambio, manchaMayor: cmp.manchaMayor, bloquesDistintos: cmp.bloquesDistintos, fraccion: cmp.fraccion, imagen: null };
      if (cmp.cambio || flag("--guardar-todo")) {
        const dir = path.join(DIR_DIF, v.id);
        fs.mkdirSync(dir, { recursive: true });
        const archivo = path.join(dir, `${String(k + 1).padStart(2, "0")}-${slugRuta(p.url)}.jpg`);
        fs.writeFileSync(archivo, await imagenDiferencia({ grabadoPng, vivoPng: p.png, manchas: cmp.manchas, titulo: `${p.url} · mancha de ${cmp.manchaMayor} bloques · ${(cmp.fraccion * 100).toFixed(1)} % de la pantalla` }));
        fila.imagen = path.relative(process.cwd(), archivo).replaceAll(path.sep, "/");
      }
      res.pantallas.push(fila);
    }
  } finally {
    await ctx.close();
  }
  if (!res.pantallas.length) { res.estado = "sin_comparar"; return res; }
  const distintas = res.pantallas.filter((p) => p.cambio);
  res.estado = distintas.length || res.ausentes.length ? "cambio" : "igual";
  const partes = [];
  if (distintas.length) partes.push(`cambió lo que se ve en ${[...new Set(distintas.map((p) => p.url))].slice(0, 3).join(", ")}`);
  if (res.ausentes.length) partes.push(`ya no aparece ${res.ausentes.slice(0, 3).map((a) => `«${a.texto}»`).join(", ")}`);
  res.motivo = partes.join("; ");
  return res;
}

// ── Principal ──
const ids = await elegirVideos();
const lista = VIDEOS.filter((v) => ids.includes(v.id));
log(`Verificación visual de ${lista.length} video(s) en ${BASE}${DEPURAR ? " (depurar)" : ""}`);
await asegurarServidor();
const navegador = await abrirNavegador();
const cookiesPorRol = {};
const resultados = [];
try {
  for (const v of lista) {
    let r;
    try { r = await verificar(navegador, v, cookiesPorRol); } catch (e) { r = { id: v.id, titulo: v.titulo, estado: "sin_comparar", pantallas: [], ausentes: [], notas: [`error: ${e.message}`] }; }
    resultados.push(r);
    const dato = r.pantallas.map((p) => `${p.cambio ? "✘" : "·"}${p.manchaMayor}/${(p.fraccion * 100).toFixed(1)}%`).join(" ");
    log(`  ${r.id} ${r.estado.padEnd(12)} ${r.pantallas.length} pantalla(s) ${dato}${r.ausentes.length ? ` · ausentes: ${r.ausentes.map((a) => a.texto).join(", ")}` : ""}${r.notas.length && DEPURAR ? ` · ${r.notas.join(" | ")}` : ""}`);
  }
} finally {
  await navegador.close();
  detener();
}

// ── Capturas de la diferencia al bucket privado ──
if (flag("--subir")) {
  for (const prod of flag("--prod") ? [false, true] : [false]) {
    let c;
    try { c = prod ? conectar(true) : cd; } catch (e) { log(`(no pude conectar a ${prod ? "producción" : "desarrollo"}: ${e.message})`); continue; }
    for (const r of resultados) for (const p of r.pantallas) {
      if (!p.imagen) continue;
      const v = VIDEOS.find((x) => x.id === r.id);
      const { error } = await c.cliente.storage.from("tutoriales-masters").upload(`${v.id}-${v.slug}/diferencias/${path.basename(p.imagen)}`, fs.readFileSync(p.imagen), { contentType: "image/jpeg", upsert: true });
      if (error) log(`(no pude subir ${p.imagen}: ${error.message})`);
    }
  }
}

// ── Marcas: desmarca lo que se ve igual y deja el motivo visual en lo demás ──
if (flag("--aplicar")) {
  const prods = flag("--prod") ? [false, true] : [false];
  for (const prod of prods) {
    const c = prod ? conectar(true) : cd;
    for (const r of resultados) {
      if (r.estado === "igual") {
        await c.cliente.from("tutoriales").update({ por_actualizar_motivo: null, por_actualizar_desde: null }).eq("numero", r.id);
      } else if (r.estado === "cambio") {
        const img = r.pantallas.find((p) => p.imagen)?.imagen;
        const motivo = `${r.motivo}${img ? ` (captura: ${VIDEOS.find((x) => x.id === r.id).id}-${VIDEOS.find((x) => x.id === r.id).slug}/diferencias/${path.basename(img)})` : ""}`.slice(0, 290);
        await c.cliente.from("tutoriales").update({ por_actualizar_motivo: null, por_actualizar_desde: null }).eq("numero", r.id);
        await c.cliente.rpc("plataforma_tutoriales_marcar", { p_marcas: [{ numero: r.id, motivo }] });
      }
      // «sin_comparar» y «sin_grabar»: no se afirma nada; la marca que tuviera se queda.
    }
    log(`Marcas aplicadas en ${prod ? "producción" : "desarrollo"}.`);
  }
}

fs.mkdirSync(DIR_DIF, { recursive: true });
const informe = { fecha: new Date().toISOString(), base: BASE, umbrales: U, videos: resultados.map(({ png, ...r }) => r) };
fs.writeFileSync(path.join(DIR_DIF, "informe.json"), JSON.stringify(informe, null, 2));
const cuenta = (e) => resultados.filter((r) => r.estado === e).length;
log(`\n${resultados.length} video(s): ${cuenta("cambio")} con cambio visual, ${cuenta("igual")} igual(es), ${cuenta("sin_comparar")} sin poder comparar, ${cuenta("sin_grabar")} sin grabar. Informe: scripts/tutoriales/diferencias/informe.json`);
if (val("--json")) {
  const sal = JSON.stringify(informe.videos.map((r) => ({ numero: r.id, estado: r.estado, motivo: r.motivo ?? r.notas.join("; "), imagen: r.pantallas.find((p) => p.imagen)?.imagen ?? null })));
  if (val("--json") === "-") console.log(sal); else fs.writeFileSync(val("--json"), sal);
}
process.exit(0);
