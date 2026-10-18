// Vuelve a escribir los mensajes PENDIENTES de «Contactar hoy» (la lista de hoy y los seguimientos que no se han
// mandado) con las reglas vigentes de src/lib/prospectos/mensajes.ts. Lo ya enviado no se toca.
//
//   node scripts/prospectos/regenerar-mensajes.mjs [--prod] [--revisar]
//
// --revisar solo dice cuántos cambiaría y cuáles nombraban un servicio que el negocio no da.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { crearLlamarIA, MODELO_MENSAJES } from "../../src/lib/prospectos/ia.ts";
import { mensajeDePlantilla, redactarLote, serviciosAjenos, serviciosSeguros } from "../../src/lib/prospectos/mensajes.ts";
import { linkDe } from "../../src/lib/prospectos/lista.ts";

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
const sitio = prod ? "https://peludesk.mx" : (env.PELUDESK_SITIO_URL ?? "http://plataforma.localhost:3001");
const llave = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
const ia = llave ? crearLlamarIA({ apiKey: llave, workspace: process.env.ANTHROPIC_WORKSPACE_ID || env.ANTHROPIC_WORKSPACE_ID }) : null;
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
const { data: aj } = await db.from("prospeccion_ajustes").select("firma").eq("id", 1).single();

const { data: filas, error } = await db
  .from("prospectos_contactos")
  .select("id, prospecto_id, canal, tipo, mensaje, fecha, prospectos(id, nombre, giro, ciudad, slug, calificacion, resenas, clasificacion)")
  .eq("estado", "pendiente")
  .gte("fecha", hoy)
  .is("deleted_at", null)
  .order("orden")
  .limit(1000);
if (error) throw new Error(error.message);
const conAjenos = filas.filter((f) => serviciosAjenos(f.mensaje, serviciosSeguros({ giro: f.prospectos.giro, servicios: f.prospectos.clasificacion?.servicios }), f.prospectos.nombre).length);
console.log(`${prod ? "PRODUCCIÓN" : "desarrollo"} · pendientes ${filas.length} (desde ${hoy}) · nombraban un servicio que no da: ${conAjenos.length}`);
for (const f of conAjenos) console.log(`  ${f.prospectos.nombre}: ${serviciosAjenos(f.mensaje, serviciosSeguros({ giro: f.prospectos.giro, servicios: f.prospectos.clasificacion?.servicios }), f.prospectos.nombre).join(", ")}`);
if (args.includes("--revisar")) process.exit(0);

// El mensaje anterior de cada seguimiento (para que no lo repita).
const conSeg = filas.filter((f) => f.tipo !== "primero").map((f) => f.prospecto_id);
const anteriores = new Map();
if (conSeg.length) {
  const { data } = await db.from("prospectos_contactos").select("prospecto_id, mensaje, fecha").in("prospecto_id", conSeg).lt("fecha", hoy).order("fecha", { ascending: false }).limit(1000);
  for (const x of data ?? []) if (!anteriores.has(x.prospecto_id)) anteriores.set(x.prospecto_id, x.mensaje);
}
const para = filas.map((f) => ({
  id: f.prospecto_id,
  nombre: f.prospectos.nombre,
  giro: f.prospectos.giro,
  ciudad: f.prospectos.ciudad,
  canal: f.canal,
  tipo: f.tipo,
  link: linkDe(sitio, f.prospectos.slug),
  calificacion: f.prospectos.calificacion,
  resenas: f.prospectos.resenas,
  mensajeAnterior: anteriores.get(f.prospecto_id) ?? null,
  servicios: f.prospectos.clasificacion?.servicios ?? null,
}));
let porIA = 0;
for (let i = 0; i < para.length; i += 10) {
  const lote = para.slice(i, i + 10);
  let r = new Map();
  if (ia) {
    try {
      r = await redactarLote(lote, ia, aj.firma, MODELO_MENSAJES);
    } catch (e) {
      console.log("  IA: " + (e instanceof Error ? e.message : e));
    }
  }
  for (const p of lote) {
    const fila = filas.find((f) => f.prospecto_id === p.id);
    const texto = r.get(p.id) ?? mensajeDePlantilla(p, aj.firma);
    if (r.has(p.id)) porIA++;
    const { error: e2 } = await db.from("prospectos_contactos").update({ mensaje: texto, redactado_por: r.has(p.id) ? "ia" : "plantilla" }).eq("id", fila.id).eq("estado", "pendiente");
    if (e2) console.log(`  ${p.nombre}: ${e2.message}`);
  }
}
const { data: despues } = await db.from("prospectos_contactos").select("mensaje, prospectos(nombre, giro, clasificacion)").in("id", filas.map((f) => f.id));
const quedan = (despues ?? []).filter((f) => serviciosAjenos(f.mensaje, serviciosSeguros({ giro: f.prospectos.giro, servicios: f.prospectos.clasificacion?.servicios }), f.prospectos.nombre).length);
console.log(`reescritos ${filas.length} (por IA ${porIA}, de plantilla ${filas.length - porIA}) · siguen nombrando un servicio que no da: ${quedan.length}`);
process.exit(quedan.length ? 1 : 0);
