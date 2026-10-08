// Cierra como «Ajeno a PeluDesk» las alertas ya abiertas de «Pago aprobado en
// Mercado Pago, sin cobro en la caja» cuyo pago PeluDesk no originó (otra
// tienda, transferencia, cobro personal…). Usa las funciones de la plataforma
// (plataforma_conciliacion_ajenos / _cerrar_ajenos / _revertir_ajenos): un
// evento de auditoría por negocio con lo que cerró, idempotente (sin nada
// abierto no hace nada) y reversible. Sin SQL suelto.
//
// Con lo que la base sabe, un pago es de PeluDesk si está ligado a una orden
// suya (mp_ordenes) o su referencia es una orden suya; todo lo demás es ajeno.
// Si una alerta cerrada resulta ser de la terminal vinculada, la conciliación
// por hora la vuelve a abrir sola (lee pos_id de la terminal en Mercado Pago).
// No toca los cobros a mano sospechosos («cobro_sin_pago»).
//
//   node scripts/plataforma/cerrar-pagos-ajenos.mjs [--negocio <slug>] [--prod]              (solo revisa)
//   node scripts/plataforma/cerrar-pagos-ajenos.mjs [--negocio <slug>] --aplicar [--prod]
//   node scripts/plataforma/cerrar-pagos-ajenos.mjs --revertir <id-del-evento> --aplicar [--prod]
//
// La llave de producción se lee al vuelo por el CLI de Supabase y nunca se imprime ni se guarda.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PROD = args.includes("--prod");
const APLICAR = args.includes("--aplicar");
const slug = val("--negocio");
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

console.log(PROD ? "PRODUCCIÓN" : "desarrollo");

if (revertir) {
  const [ev] = await get(`plataforma_eventos?id=eq.${revertir}&accion=eq.conciliacion_cerrar_ajenos&select=detalle,negocio_id`);
  if (!ev) throw new Error("Ese evento no existe o no es una limpieza de conciliación.");
  console.log(`Revertir el evento ${revertir}: ${ev.detalle.filas.length} alerta(s) se reabren:`);
  for (const f of ev.detalle.filas) console.log(`  · pago ${f.mp_pago_id} · ${dinero(f.monto)}`);
  if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }
  console.log("✔ Revertido:", JSON.stringify(await rpc("plataforma_conciliacion_revertir_ajenos", { p_evento_id: revertir })));
  process.exit(0);
}

let negocioId = null;
if (slug) {
  const [neg] = await get(`negocios?slug=eq.${encodeURIComponent(slug)}&select=id,nombre,slug`);
  if (!neg) throw new Error(`No existe el negocio «${slug}».`);
  negocioId = neg.id;
}
const lista = await rpc("plataforma_conciliacion_ajenos", { p_negocio_id: negocioId });
if (lista.length === 0) { console.log("✔ No hay alertas de «pago sin cobro» de pagos ajenos."); process.exit(0); }
const porNegocio = new Map();
for (const f of lista) porNegocio.set(f.negocio_nombre, [...(porNegocio.get(f.negocio_nombre) ?? []), f]);
for (const [nombre, filas] of porNegocio) {
  console.log(`${nombre}: ${filas.length} alerta(s), ${dinero(filas.reduce((s, f) => s + Number(f.monto), 0))}`);
  for (const f of filas) console.log(`  · pago ${f.mp_pago_id} · ${dinero(f.monto)} · detectada ${String(f.detectada_at).slice(0, 10)}`);
}
if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }
const r = await rpc("plataforma_conciliacion_cerrar_ajenos", { p_negocio_id: negocioId });
for (const e of r) console.log(`✔ ${e.negocio}: cerradas ${e.cerradas} · evento ${e.evento_id} (para revertir: --revertir ${e.evento_id})`);
