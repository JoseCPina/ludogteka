// A petición de un negocio, la administración de PeluDesk da por revisadas
// TODAS sus diferencias de conciliación abiertas (cobro_sin_pago, pago_sin_cobro
// y, si las hubiera, informativas) cuyo pago o cobro ocurrió ANTES de una fecha
// (hora de ese negocio), con el motivo que el negocio pidió y un evento de
// auditoría con quién lo pidió y cada fila (reversible). Usa las funciones
// plataforma_conciliacion_cerrar_hasta / _revertir_cierre: sin SQL suelto, nunca
// toca otro negocio ni lo de esa fecha en adelante.
//
//   node scripts/plataforma/cerrar-conciliacion-hasta.mjs --negocio <slug> --hasta AAAA-MM-DD \
//        --motivo "<texto>" --solicitante "<quién lo pidió>" [--prod]            (solo revisa)
//   … --aplicar [--prod]
//   node scripts/plataforma/cerrar-conciliacion-hasta.mjs --revertir <id-del-evento> --aplicar [--prod]
//
// La llave de producción se lee al vuelo por el CLI de Supabase y nunca se imprime ni se guarda.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PROD = args.includes("--prod");
const APLICAR = args.includes("--aplicar");
const slug = val("--negocio");
const hasta = val("--hasta");
const motivo = val("--motivo");
const solicitante = val("--solicitante");
const revertir = val("--revertir");

const REF = PROD ? "xdsxjhytggpsgrmfuuff" : "sgfolltpvktbsiisfuzq";
let llave;
if (PROD) {
  const keys = JSON.parse(execFileSync("node", ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", REF, "-o", "json"], { encoding: "utf8" }));
  llave = keys.find((k) => k.name === "service_role" && k.type === "legacy")?.api_key;
} else {
  const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  llave = env.SUPABASE_SECRET_KEY;
}
if (!llave) throw new Error("No pude leer la llave de servicio.");
const base = `https://${REF}.supabase.co/rest/v1`;
const H = { apikey: llave, Authorization: `Bearer ${llave}`, "Content-Type": "application/json" };
const get = async (ruta) => { const r = await fetch(`${base}/${ruta}`, { headers: H }); if (!r.ok) throw new Error(`${ruta}: ${r.status} ${(await r.text()).slice(0, 200)}`); return r.json(); };
const rpc = async (fn, cuerpo) => { const r = await fetch(`${base}/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(cuerpo) }); const t = await r.text(); if (!r.ok) throw new Error(`${fn}: ${r.status} ${t.slice(0, 400)}`); return JSON.parse(t); };
const dinero = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const diaEn = (iso, zona) => new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

console.log(PROD ? "PRODUCCIÓN" : "desarrollo");

if (revertir) {
  const [ev] = await get(`plataforma_eventos?id=eq.${revertir}&accion=eq.conciliacion_cerrar_revisadas&select=detalle,negocio_id,motivo`);
  if (!ev) throw new Error("Ese evento no existe o no es un cierre de conciliación.");
  console.log(`Revertir el evento ${revertir} («${ev.motivo}»): ${ev.detalle.filas.length} diferencia(s) se reabren:`);
  for (const f of ev.detalle.filas) console.log(`  · ${f.tipo} · ${f.mp_pago_id ?? f.cobro_id} · ${dinero(f.monto)}`);
  if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }
  console.log("✔ Revertido:", JSON.stringify(await rpc("plataforma_conciliacion_revertir_cierre", { p_evento_id: revertir })));
  process.exit(0);
}

if (!slug || !/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? "") || !motivo || !solicitante) {
  throw new Error("Faltan --negocio <slug>, --hasta AAAA-MM-DD, --motivo \"…\" y --solicitante \"…\".");
}
const [neg] = await get(`negocios?slug=eq.${encodeURIComponent(slug)}&select=id,nombre,slug,zona_horaria`);
if (!neg) throw new Error(`No existe el negocio «${slug}».`);
const abiertas = await get(`conciliacion_terminal?negocio_id=eq.${neg.id}&resuelta_at=is.null&deleted_at=is.null&select=id,tipo,monto,ocurrio_at,detectada_at,mp_pago_id,cobro_id,detalle&order=ocurrio_at`);
const cierra = abiertas.filter((a) => diaEn(a.ocurrio_at, neg.zona_horaria) < hasta);
const quedan = abiertas.length - cierra.length;
console.log(`${neg.nombre} (${neg.zona_horaria}): ${abiertas.length} abierta(s); anteriores al ${hasta}: ${cierra.length} · se quedan: ${quedan}`);
for (const a of cierra) console.log(`  · ${diaEn(a.ocurrio_at, neg.zona_horaria)} · ${a.tipo} · ${a.mp_pago_id ? `pago ${a.mp_pago_id}` : `cobro ${a.cobro_id}`} · ${dinero(a.monto)} · origen ${a.detalle?.origen ?? "—"}`);
console.log(`Motivo: «${motivo}» · lo pidió: ${solicitante}`);
if (cierra.length === 0) { console.log("✔ No hay nada que cerrar."); process.exit(0); }
if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }
const r = await rpc("plataforma_conciliacion_cerrar_hasta", { p_negocio_id: neg.id, p_hasta: hasta, p_motivo: motivo, p_solicitante: solicitante });
console.log(`✔ ${r.negocio}: cerradas ${r.cerradas} · evento ${r.evento_id} (para revertir: --revertir ${r.evento_id} --aplicar${PROD ? " --prod" : ""})`);
