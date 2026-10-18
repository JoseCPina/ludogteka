// Calidad de la base de prospectos (src/lib/prospectos/calidad.ts), con el MISMO código que la tarea diaria:
// ciudad de la dirección, clasificación con IA (giro real y descarte «no es del giro») y sucursales.
//
//   node scripts/prospectos/calidad.mjs [--prod] [--sin-ia] [--lista]
//
// --lista además arma la lista «Contactar hoy». La IA usa ANTHROPIC_API_KEY (entorno o .env.local). Producción:
// la llave de servicio se lee al vuelo por el CLI (nunca se imprime).
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { procesarCalidad } from "../../src/lib/prospectos/calidad.ts";
import { clasificarLote, giroDeServicios } from "../../src/lib/prospectos/clasificar.ts";
import { crearLlamarIA, MODELO_CLASIFICAR, MODELO_MENSAJES } from "../../src/lib/prospectos/ia.ts";
import { revisarWeb } from "../../src/lib/prospectos/web.ts";
import { armarLista } from "../../src/lib/prospectos/lista.ts";
import { mensajeDePlantilla, redactarLote } from "../../src/lib/prospectos/mensajes.ts";

const args = process.argv.slice(2);
const prod = args.includes("--prod");
const env = fs.existsSync(".env.local")
  ? Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }))
  : {};
let db;
if (prod) {
  const { servicioSinNegocio } = await import("../lib/prod.mjs");
  db = servicioSinNegocio();
} else db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const llave = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
const ia = !args.includes("--sin-ia") && llave ? crearLlamarIA({ apiKey: llave, workspace: process.env.ANTHROPIC_WORKSPACE_ID || env.ANTHROPIC_WORKSPACE_ID }) : null;

const r = await procesarCalidad({
  db,
  clasificar: ia ? (lote) => clasificarLote(lote, ia, MODELO_CLASIFICAR) : null,
  resumenWeb: async (w) => (await revisarWeb(w, 6000)).resumen ?? null,
  giroDeServicios,
  presupuestoMs: 6 * 60 * 60 * 1000,
  avisar: (t) => console.log("  " + t),
});
console.log(`\n${prod ? "PRODUCCIÓN" : "desarrollo"} · ciudades corregidas ${r.ciudades} · clasificados ${r.clasificados} · descartados ${r.descartados} · giro cambiado ${r.giroCambiado} · sucursales ${r.sucursales} · hoteles para personas ${r.hotelesPersonas} · guarderías infantiles ${r.guarderiasInfantiles} · gobierno, refugio o escuela ${r.gobiernoRefugioEscuela}`);
for (const e of r.errores) console.log("  error: " + e);

if (args.includes("--lista")) {
  const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  const { data: aj } = await db.from("prospeccion_ajustes").select("firma, whatsapp_ventas").eq("id", 1).single();
  const sitio = prod ? "https://peludesk.mx" : (env.PELUDESK_SITIO_URL ?? "http://plataforma.localhost:3001");
  const l = await armarLista({
    db, fecha, sitio,
    redactar: ia ? (lote) => redactarLote(lote, ia, aj.firma, MODELO_MENSAJES, aj.whatsapp_ventas) : async () => new Map(),
    plantilla: (p) => mensajeDePlantilla(p, aj.firma, aj.whatsapp_ventas),
  });
  console.log(`lista ${fecha}: WhatsApp ${l.whatsapp} · Instagram ${l.instagram} · seguimientos ${l.seguimientos} · pausados ${l.pausados} · por IA ${l.porIA} · retirados ${l.retirados}`);
}
process.exit(r.errores.length ? 1 : 0);
