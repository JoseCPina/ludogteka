// Lo común del recorrido de la «Clínica Demo PeluDesk» en PRODUCCIÓN (negocio interno de pruebas; nunca Ludogteka).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { abrirNavegador } from "../lib/navegador.mjs";
import { BASE_CLINICA, DOMINIO_CLINICA, estado, guardarEstado, servicioEn, sesionDe, comoPersona, servicioSinNegocio } from "../lib/prod.mjs";

export const BASE = BASE_CLINICA;
export const ESCRITORIO = process.argv.includes("--escritorio");
export const VIEWPORT = ESCRITORIO ? { width: 1280, height: 900 } : { width: 390, height: 844 };
const HALLAZGOS = path.join(os.tmpdir(), "clinica-hallazgos.json");

export const hallazgos = [];
export const bien = (t) => console.log(`  ✔ ${t}`);
export const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
export const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
export const seccion = (t) => console.log(`── ${t}`);
export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
export const cuerpo = async (pag) => (await pag.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
export const sinDesborde = async (pag, donde) => {
  const w = await pag.evaluate(() => document.documentElement.scrollWidth);
  comprobar(w <= VIEWPORT.width + 2, `${donde}: sin desborde a ${VIEWPORT.width} px (${w}px)`);
};
export const hoyMx = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const hoyISO = (d = 0) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

export function registrarHallazgos(tramo) {
  let previos = {};
  try { previos = JSON.parse(fs.readFileSync(HALLAZGOS, "utf8")); } catch { /* primera vez */ }
  previos[tramo + (ESCRITORIO ? "-escritorio" : "")] = hallazgos.slice();
  fs.writeFileSync(HALLAZGOS, JSON.stringify(previos, null, 1));
}

/** Todo lo que un tramo necesita: sesiones, clientes de API y navegador. */
export async function contexto() {
  const e = estado();
  if (!e.negocioId) throw new Error("Falta crear la clínica: node scripts/clinica-demo/crear.mjs");
  const S = servicioEn(e.negocioId);
  const sesiones = {};
  const personas = { admin: e.personal.admin, recepcion: e.personal.recepcion, mvz: e.personal.mvz };
  for (const [k, id] of Object.entries(personas)) sesiones[k] = await sesionDe(id);
  const api = Object.fromEntries(Object.entries(sesiones).map(([k, s]) => [k, comoPersona(s.token, e.negocioId)]));
  const AUDIO = path.join(os.tmpdir(), "peludesk-dictado-es.wav");
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
  if (fs.existsSync(AUDIO)) args.push(`--use-file-for-fake-audio-capture=${AUDIO}`);
  const nav = await abrirNavegador(args);
  const abrir = async (rol = null, { viewport = VIEWPORT, permisos = [] } = {}) => {
    const c = await nav.newContext({ viewport, permissions: permisos, acceptDownloads: true });
    if (rol) await c.addCookies(sesiones[rol].cookies);
    const p = await c.newPage();
    p.setDefaultNavigationTimeout(60000);
    p.on("dialog", (d) => d.accept());
    return { c, p };
  };
  return { e, S, sesiones, api, nav, abrir, personas, estado, guardarEstado, servicioSinNegocio };
}

/** Un archivo con ese nombre en la carpeta temporal (para subir en el navegador). */
export const tmp = (nombre) => path.join(os.tmpdir(), nombre);
export const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
