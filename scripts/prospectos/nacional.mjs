// Prospección nacional desde la computadora, con la lista de src/lib/prospectos/nacional.ts y el MISMO motor que la
// tarea (src/lib/prospectos/correr.ts). Sirve cuando la lista cambió y todavía no está desplegada, o para tandas
// largas sin el tope de 5 minutos de Vercel.
//
//   node scripts/prospectos/nacional.mjs --estimar [--prod] [--precio 35]
//   node scripts/prospectos/nacional.mjs --tope 300 [--prod] [--hasta-usd 150] [--estados Jalisco,Sonora]
//
// Las búsquedas NO revisan webs (topeWebs 0): eso lo hace después scripts/prospectos/calidad.mjs en lotes.
// --hasta-usd detiene la corrida antes de pasar ese gasto estimado en el mes (contando lo gratis).
// La llave de Google sale de GOOGLE_PLACES_API_KEY (entorno o .env.local); la de servicio de producción, del CLI.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { correrProspeccion, leerAjustes } from "../../src/lib/prospectos/correr.ts";
import { buscarTexto, PLACES_URL } from "../../src/lib/prospectos/places.ts";
import { revisarWeb } from "../../src/lib/prospectos/web.ts";
import { ciudadDeDireccion } from "../../src/lib/prospectos/calidad.ts";
import { CIUDADES_NACIONALES, estimarCosto, PRECIO_ENTERPRISE_POR_1000_USD, GRATIS_AL_MES } from "../../src/lib/prospectos/nacional.ts";

const args = process.argv.slice(2);
const valor = (k) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : undefined);
const prod = args.includes("--prod");
const env = fs.existsSync(".env.local")
  ? Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }))
  : {};
let db;
if (prod) {
  const { servicioSinNegocio } = await import("../lib/prod.mjs");
  db = servicioSinNegocio();
} else db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const estados = (valor("--estados") ?? "").split(",").map(norm).filter(Boolean);
// De mayor a menor población: si el dinero alcanza para menos, se buscan primero las ciudades grandes.
const ciudades = CIUDADES_NACIONALES.filter((c) => !estados.length || estados.includes(norm(c.estado))).sort((a, b) => b.poblacion - a.poblacion);
const precio = Number(valor("--precio")) || PRECIO_ENTERPRISE_POR_1000_USD;

async function busquedasDelMes() {
  const inicio = new Date();
  inicio.setUTCDate(1);
  inicio.setUTCHours(0, 0, 0, 0);
  let n = 0;
  for (let d = 0; ; d += 1000) {
    const { data, error } = await db.from("prospeccion_corridas").select("busquedas").gte("inicio_at", inicio.toISOString()).order("id").range(d, d + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) n += r.busquedas ?? 0;
    if ((data ?? []).length < 1000) break;
  }
  return n;
}

const ajustes = await leerAjustes(db);
const consultas = Object.values(ajustes.consultas).reduce((n, l) => n + (l?.length ?? 0), 0);
const usadas = await busquedasDelMes();
const est = estimarCosto({ ciudades: ciudades.length, consultasPorCiudad: consultas, paginasPorConsulta: ajustes.paginas_por_consulta, yaUsadasEsteMes: usadas, precioPor1000Usd: precio });
console.log(`${prod ? "PRODUCCIÓN" : "desarrollo"} · ${ciudades.length} ciudades × ${consultas} consultas × ${ajustes.paginas_por_consulta} páginas · usadas este mes ${usadas} (gratis ${GRATIS_AL_MES})`);
console.log(`máximo ${est.llamadasMaximas} llamadas · cobradas ${est.llamadasCobradas} · $${est.costoUsd} USD a $${precio} por mil`);
if (args.includes("--estimar")) process.exit(0);

const tope = Number(valor("--tope"));
if (!Number.isInteger(tope) || tope < 1) throw new Error("Falta --tope (cada búsqueda se cobra).");
const hastaUsd = Number(valor("--hasta-usd")) || Infinity;
const gastoDe = (n) => (Math.max(0, n - GRATIS_AL_MES) * precio) / 1000;
const permitidas = Number.isFinite(hastaUsd) ? Math.max(0, Math.floor((hastaUsd * 1000) / precio) + GRATIS_AL_MES - usadas) : Infinity;
const topeReal = Math.min(tope, permitidas);
if (topeReal <= 0) {
  console.log(`Ya se llegó al gasto de $${hastaUsd} USD este mes: no se busca nada.`);
  process.exit(0);
}
const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() || env.GOOGLE_PLACES_API_KEY?.trim();
const r = await correrProspeccion({
  db,
  apiKey,
  buscar: (consulta, pageToken) => buscarTexto({ apiKey, consulta, pageToken, url: PLACES_URL }),
  revisarWeb: (w) => revisarWeb(w),
  ciudadDe: ciudadDeDireccion,
  origen: "script",
  tope: topeReal,
  ciudades: ciudades.map((c) => c.nombre),
  presupuestoMs: 3 * 60 * 60 * 1000,
  topeWebs: 0,
});
console.log(`corrida ${r.id} · ${r.estado} · búsquedas ${r.busquedas} · lugares ${r.resultados} · nuevos ${r.nuevos} · duplicados ${r.duplicados} · ya de PeluDesk ${r.clientes} · errores ${r.errores}`);
console.log(`gasto estimado del mes: $${gastoDe(usadas + r.busquedas).toFixed(2)} USD`);
if (r.error) console.log(`error: ${r.error}`);
process.exit(r.estado === "terminada" ? 0 : 1);
