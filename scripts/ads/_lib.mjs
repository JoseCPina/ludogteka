// Utilidades de la API de Marketing de Meta para las campañas de PeluDesk.
// El token es el del usuario del sistema checaito-api (el mismo de
// PELUDESK_META_TOKEN en Vercel, que es «sensitive» y no se puede leer de
// vuelta): se lee de C:\proyectos\checaito\.env.wa (META_TOKEN_CHECAITO) o de
// META_TOKEN en el entorno, y NUNCA se imprime.
import fs from "node:fs";

function leerEnv() {
  if (process.env.META_TOKEN) return { META_TOKEN_CHECAITO: process.env.META_TOKEN };
  const ruta = process.env.CHECAITO_ENV ?? "C:/proyectos/checaito/.env.wa";
  return Object.fromEntries(fs.readFileSync(ruta, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
}
const env = leerEnv();
export const TOKEN = env.META_TOKEN_CHECAITO;
export const APP = env.WA_APP_ID && env.WA_APP_SECRET ? `${env.WA_APP_ID}|${env.WA_APP_SECRET}` : null;
export const API = "v25.0";
export const CUENTA = "act_1352741180271668";
export const PAGINA = "1297753746760177";
export const INSTAGRAM = "17841417621828061";
export const PIXEL = "1127094243008954";

const limpiar = (o) => JSON.parse(JSON.stringify(o).split(TOKEN).join("«token»"));
export async function get(ruta, token = TOKEN) {
  const r = await fetch(`https://graph.facebook.com/${API}/${ruta}${ruta.includes("?") ? "&" : "?"}access_token=${token}`, { signal: AbortSignal.timeout(60000) });
  const cuerpo = await r.json();
  return { ok: r.ok && !cuerpo.error, estado: r.status, cuerpo: limpiar(cuerpo) };
}
export async function post(ruta, campos, token = TOKEN) {
  const cuerpo = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) cuerpo.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  cuerpo.set("access_token", token);
  const r = await fetch(`https://graph.facebook.com/${API}/${ruta}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: cuerpo, signal: AbortSignal.timeout(120000) });
  const j = await r.json();
  return { ok: r.ok && !j.error, estado: r.status, cuerpo: limpiar(j) };
}
export const error = (r) => JSON.stringify(r.cuerpo?.error ?? r.cuerpo).slice(0, 700);
