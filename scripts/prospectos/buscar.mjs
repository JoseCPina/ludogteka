// Corre una búsqueda de prospectos desde la computadora, con el MISMO motor que la tarea diaria
// (src/lib/prospectos/correr.ts) y deja su registro en prospeccion_corridas (origen «script»).
//
//   node scripts/prospectos/buscar.mjs [--ciudades "San Luis Potosí,Querétaro"] [--giros guarderia,hotel]
//        [--tope 30] [--sin-web] [--prod]
//
// Desarrollo: lee .env.local. Producción (--prod): la llave de servicio se lee al vuelo por el CLI de Supabase
// (nunca se imprime). La de Google sale de GOOGLE_PLACES_API_KEY (entorno o .env.local). Sin límite de tiempo
// (la tarea de Vercel tiene 5 minutos): sirve para la primera corrida grande.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { correrProspeccion } from "../../src/lib/prospectos/correr.ts";
import { buscarTexto, PLACES_URL } from "../../src/lib/prospectos/places.ts";
import { revisarWeb } from "../../src/lib/prospectos/web.ts";
import { ciudadDeDireccion } from "../../src/lib/prospectos/calidad.ts";

const args = process.argv.slice(2);
const valor = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const lista = (k) => valor(k)?.split(",").map((x) => x.trim()).filter(Boolean);
const prod = args.includes("--prod");

const env = fs.existsSync(".env.local")
  ? Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }))
  : {};

let db;
if (prod) {
  const { servicioSinNegocio } = await import("../lib/prod.mjs");
  db = servicioSinNegocio();
} else {
  db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
}
const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() || env.GOOGLE_PLACES_API_KEY?.trim() || null;
const url = (!prod && (process.env.PLACES_API_URL || valor("--places-url"))) || PLACES_URL;

const r = await correrProspeccion({
  db,
  apiKey,
  buscar: (consulta, pageToken) => buscarTexto({ apiKey, consulta, pageToken, url }),
  revisarWeb: (w) => revisarWeb(w),
  ciudadDe: ciudadDeDireccion,
  origen: "script",
  tope: valor("--tope") ? Number(valor("--tope")) : undefined,
  ciudades: lista("--ciudades"),
  giros: lista("--giros"),
  presupuestoMs: 6 * 60 * 60 * 1000,
  topeWebs: args.includes("--sin-web") ? 0 : 5000,
  avisar: (t) => console.log("  " + t),
});

console.log(`\n${prod ? "PRODUCCIÓN" : "desarrollo"} · corrida ${r.id} · ${r.estado}`);
console.log(`búsquedas ${r.busquedas} · lugares ${r.resultados} · nuevos ${r.nuevos} · duplicados ${r.duplicados} · ya de PeluDesk ${r.clientes} · webs ${r.websRevisadas} · errores ${r.errores}`);
for (const [k, n] of Object.entries(r.porCiudadGiro).sort()) console.log(`  ${k.replace("|", " · ")}: ${n}`);
if (r.error) console.log(`error: ${r.error}`);
process.exit(r.estado === "terminada" ? 0 : 1);
