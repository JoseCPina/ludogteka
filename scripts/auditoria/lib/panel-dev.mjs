// Lo que comparten las auditorías de pantalla del panel (ux-jerarquia-dev, ux-respuesta-dev): las cuentas de cada rol
// en Huellitas (los mismos perfiles que permisos-pantalla-dev: estética, recepción, encargada, médico y admin), la
// sesión por enlace mágico, el recorrido desde el inicio de cada rol y el candado de escrituras. SOLO DESARROLLO.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "../sesiones-dev.mjs";
import { designarMedicoTemporal, quitarMedicoTemporal } from "./medico-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");

export const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
export const B = datos.B;
export const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
export const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });

const { data: otraRecepcion } = await SB.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").neq("profile_id", datos.recepcionB).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
export const CUENTAS = { admin: datos.adminB, recepcion: datos.recepcionB, estetica: datos.esteticaB, encargada: otraRecepcion?.profile_id, medico: datos.esteticaAmbos };
export const INICIO = { admin: "/admin", recepcion: "/recepcion", estetica: "/estetica", encargada: "/recepcion", medico: "/veterinaria" };

export const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
export const patronDe = (r) => r.replace(/^\/ayuda\/(videos\/)?(?!tickets$|videos$|pedir-ayuda$)[a-z0-9-]+$/, "/ayuda/$1:articulo").replace(UUID, ":id").replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, "/:fecha").replace(/\/\d+(?=\/|$)/g, "/:n");
export const NO_RECORRER = /^\/(api|portal|login|logout|salir|auth|demo|plataforma|alta|l|r|c|p|v|para|blog|legal|privacidad|terminos|aviso|app)(\/|$)|\/(imprimir|pdf|descargar|exportar|csv)(\/|$)|\.(pdf|csv|xlsx|xml|png|jpg|ics|zip)$|\/xml$/i;

export async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (n) => (trozos.length === 1 ? [[n, valor]] : trozos.map((t, i) => [`${n}.${i}`, t]));
  return galletas(`sb-${REF}-auth-token`).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}

// La encargada: recepción con los permisos de administrar mientras corre (como en permisos-pantalla-dev).
const PERMISOS_ENCARGADA = ["personal", "configuracion_negocio", "tarifas", "reportes_financieros", "nomina", "gastos", "inventario_costos"];
const ESTADO_PERMISOS = path.join(os.tmpdir(), "peludesk-ux-permisos.json");
const ESTADO_MODULOS = path.join(os.tmpdir(), "peludesk-ux-modulos.json");

async function quitarPermisos() {
  if (!fs.existsSync(ESTADO_PERMISOS)) return;
  const ids = JSON.parse(fs.readFileSync(ESTADO_PERMISOS, "utf8"));
  if (ids.length) await SB.from("permisos_staff").update({ deleted_at: new Date().toISOString() }).in("id", ids);
  fs.rmSync(ESTADO_PERMISOS, { force: true });
}
async function restaurarModulos() {
  if (!fs.existsSync(ESTADO_MODULOS)) return;
  const { antes, todos } = JSON.parse(fs.readFileSync(ESTADO_MODULOS, "utf8"));
  const tenia = new Map(antes.map((m) => [m.modulo, m]));
  for (const clave of todos) {
    const m = tenia.get(clave);
    if (m) await SB.from("negocio_modulos").update({ activo: m.activo }).eq("id", m.id);
    else await SB.from("negocio_modulos").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", B).eq("modulo", clave).is("deleted_at", null);
  }
  fs.rmSync(ESTADO_MODULOS, { force: true });
}

/** Prende todos los módulos, da los permisos de la encargada y designa al médico; `dejarComoEstaba` lo regresa todo. */
export async function prepararPerfiles(roles) {
  await dejarComoEstaba();
  const antes = (await SB.from("negocio_modulos").select("id, modulo, activo").eq("negocio_id", B).is("deleted_at", null)).data ?? [];
  const todos = ((await SB.from("modulos").select("clave")).data ?? []).map((m) => m.clave);
  fs.writeFileSync(ESTADO_MODULOS, JSON.stringify({ antes, todos }));
  for (const clave of todos) {
    const m = antes.find((x) => x.modulo === clave);
    if (m) await SB.from("negocio_modulos").update({ activo: true }).eq("id", m.id);
    else await SB.from("negocio_modulos").insert({ negocio_id: B, modulo: clave, activo: true });
  }
  if (roles.includes("encargada") && CUENTAS.encargada) {
    const { data: ya } = await SB.from("permisos_staff").select("permiso").eq("negocio_id", B).eq("profile_id", CUENTAS.encargada).is("revocado_at", null).is("deleted_at", null);
    const faltan = PERMISOS_ENCARGADA.filter((p) => !(ya ?? []).some((x) => x.permiso === p));
    if (faltan.length) {
      const r = await SB.from("permisos_staff").insert(faltan.map((permiso) => ({ negocio_id: B, profile_id: CUENTAS.encargada, permiso }))).select("id");
      if (!r.error) fs.writeFileSync(ESTADO_PERMISOS, JSON.stringify(r.data.map((x) => x.id)));
    }
  }
  if (roles.includes("medico")) await designarMedicoTemporal({ B, adminId: datos.adminB, profileId: CUENTAS.medico });
  for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, async () => { await dejarComoEstaba(); process.exit(130); });
}
export async function dejarComoEstaba() {
  await restaurarModulos();
  await quitarPermisos();
  await quitarMedicoTemporal();
}

/**
 * Corta en el navegador toda escritura (acciones de servidor, llamadas a la base) y las precargas. `retener(req)` puede
 * devolver una promesa para detener una petición un rato antes de cortarla o dejarla pasar.
 */
export async function candadoDeEscrituras(ctx, { alEscribir, retenerNavegacion } = {}) {
  await ctx.route("**/*", async (r) => {
    const req = r.request();
    const h = req.headers();
    if (h["next-router-prefetch"] || h["purpose"] === "prefetch") return r.abort().catch(() => {});
    if (["GET", "HEAD", "OPTIONS"].includes(req.method()) || /\/auth\/v1\/token/.test(req.url())) {
      if (retenerNavegacion && h["rsc"] === "1") await retenerNavegacion(req);
      return r.continue().catch(() => {});
    }
    if (alEscribir) await alEscribir(req);
    return r.abort().catch(() => {});
  });
}

/** Los enlaces internos visibles de la pantalla, para seguir el recorrido. */
export async function enlacesInternos(p) {
  return p.$$eval("a[href]", (as) => as.filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.getAttribute("href"))).catch(() => []);
}
export function encolar(enlaces, cola, vistos) {
  for (const h of enlaces) {
    if (!h?.startsWith("/")) continue;
    const r = h.split("#")[0];
    const sola = r.split("?")[0];
    if (NO_RECORRER.test(sola) || vistos.has(patronDe(sola))) continue;
    vistos.add(patronDe(sola));
    cola.push(r);
  }
}

/** Sello de una auditoría de pantalla que pasó, para el árbol de `src/` de este commit (lo exige `npm run desplegar`). */
export { sellar } from "./sello-pantalla.mjs";
