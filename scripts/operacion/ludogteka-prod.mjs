// Acceso a PRODUCCIÓN acotado a Ludogteka para OPERACIONES puntuales pedidas por el dueño (docs/OPERACIONES-PRODUCCION.md).
// Es la excepción a `scripts/lib/prod.mjs` (que rechaza Ludogteka): solo lo usan los scripts de `scripts/operacion/`,
// cada uno con `--revisar` (no escribe) y `--aplicar`, respaldo de lo que toca y reversa. La llave se lee al vuelo por el CLI
// de Supabase y nunca se imprime ni se guarda. Exige LUDOGTEKA_OPERACION=1 para escribir.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const REF_PROD = "xdsxjhytggpsgrmfuuff";
export const LUDOGTEKA_ID = "10000000-0000-4000-8000-000000000001";
export const ZONA = "America/Mexico_City";
const base = `https://${REF_PROD}.supabase.co/rest/v1`;

let llave;
function llaveServicio() {
  if (llave) return llave;
  const lista = JSON.parse(execFileSync("node", ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", REF_PROD, "-o", "json"], { encoding: "utf8", env: process.env }));
  llave = lista.find((k) => k.name === "service_role" && (k.type ?? "legacy") === "legacy")?.api_key;
  if (!llave) throw new Error("No pude leer la llave de servicio de producción por el CLI.");
  return llave;
}
const H = () => ({ apikey: llaveServicio(), Authorization: `Bearer ${llaveServicio()}`, "Content-Type": "application/json", "x-negocio-id": LUDOGTEKA_ID });

/** GET de la API con paginación (ordena con una llave única al final). */
export async function leer(ruta, { todas = false } = {}) {
  const sep = ruta.includes("?") ? "&" : "?";
  if (!todas) {
    const r = await fetch(`${base}/${ruta}`, { headers: H() });
    if (!r.ok) throw new Error(`${ruta}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r.json();
  }
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${base}/${ruta}${sep}offset=${desde}&limit=1000`, { headers: H() });
    if (!r.ok) throw new Error(`${ruta}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    const pagina = await r.json();
    filas.push(...pagina);
    if (pagina.length < 1000) return filas;
  }
}
export async function rpc(fn, cuerpo = {}, { comoPersona } = {}) {
  const h = H();
  if (comoPersona) h.Authorization = `Bearer ${comoPersona}`;
  const r = await fetch(`${base}/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(cuerpo) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${t.slice(0, 500)}`);
  return t ? JSON.parse(t) : null;
}
/** PATCH acotado a Ludogteka: exige LUDOGTEKA_OPERACION=1 y un filtro. */
export async function escribir(tabla, filtro, cambios, { metodo = "PATCH" } = {}) {
  if (process.env.LUDOGTEKA_OPERACION !== "1") throw new Error("Escribir en Ludogteka exige LUDOGTEKA_OPERACION=1.");
  if (!filtro) throw new Error("escribir() exige un filtro.");
  const r = await fetch(`${base}/${tabla}?${filtro}&negocio_id=eq.${LUDOGTEKA_ID}`, { method: metodo, headers: { ...H(), Prefer: "return=representation" }, body: JSON.stringify(cambios) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${metodo} ${tabla}: ${r.status} ${t.slice(0, 500)}`);
  return JSON.parse(t);
}
export async function insertar(tabla, filas) {
  if (process.env.LUDOGTEKA_OPERACION !== "1") throw new Error("Escribir en Ludogteka exige LUDOGTEKA_OPERACION=1.");
  const r = await fetch(`${base}/${tabla}`, { method: "POST", headers: { ...H(), Prefer: "return=representation" }, body: JSON.stringify(filas) });
  const t = await r.text();
  if (!r.ok) throw new Error(`POST ${tabla}: ${r.status} ${t.slice(0, 500)}`);
  return JSON.parse(t);
}
/** Respaldo JSON de las filas que se van a tocar, en la carpeta temporal (fuera del repo). Devuelve la ruta. */
export function respaldar(nombre, datos) {
  const dir = path.join(os.tmpdir(), "peludesk-operacion");
  fs.mkdirSync(dir, { recursive: true });
  const ruta = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${nombre}.json`);
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 1));
  return ruta;
}
export const dinero = (n) => `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const diaMx = (iso) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : null);
export const horaMx = (iso) => (iso ? new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : null);
