// Revisa y corrige, en UN negocio, las cuentas que quedaron con un saldo de menos
// de un peso (restos de redondeo, p. ej. «Blacky · Baño estético completo, saldo
// $0.30 de $490.00»: el descuento por porcentaje se calculaba a centavos y en
// caja se cobra en pesos). Usa las funciones de la plataforma
// (plataforma_saldos_centavos / plataforma_corregir_saldos_centavos /
// plataforma_revertir_saldos_centavos): la corrección es un descuento «Ajuste por
// redondeo» por el saldo exacto (el cobro y el corte ya hechos no cambian), deja
// un evento en plataforma_eventos con lo que hizo y se revierte cancelando esos
// descuentos. Sin SQL suelto.
//
//   node scripts/plataforma/corregir-saldos-centavos.mjs --negocio <slug> [--prod]                      (solo revisa)
//   node scripts/plataforma/corregir-saldos-centavos.mjs --negocio <slug> --aplicar [--reserva <id>]... [--prod]
//   node scripts/plataforma/corregir-saldos-centavos.mjs --negocio <slug> --revertir <id-del-evento> --aplicar [--prod]
//
// La llave de producción se lee al vuelo por el CLI de Supabase y nunca se imprime ni se guarda.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const todos = (k) => args.map((a, i) => (a === k ? args[i + 1] : null)).filter(Boolean);
const PROD = args.includes("--prod");
const APLICAR = args.includes("--aplicar");
const slug = val("--negocio");
const revertir = val("--revertir");
const reservas = todos("--reserva");
if (!slug) throw new Error("Uso: --negocio <slug> [--aplicar] [--reserva <id>] [--revertir <evento>] [--prod]");

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

const [neg] = await get(`negocios?slug=eq.${encodeURIComponent(slug)}&select=id,nombre,slug`);
if (!neg) throw new Error(`No existe el negocio «${slug}».`);
console.log(`${PROD ? "PRODUCCIÓN" : "desarrollo"} · negocio ${neg.nombre} (${neg.slug})`);

if (revertir) {
  const [ev] = await get(`plataforma_eventos?id=eq.${revertir}&accion=eq.corregir_saldos_centavos&select=detalle`);
  if (!ev || ev.detalle?.negocio_id !== neg.id) throw new Error("Ese evento no existe o es de otro negocio.");
  console.log(`Revertir el evento ${revertir}: ${ev.detalle.cuentas.length} ajuste(s) se cancelan:`);
  for (const c of ev.detalle.cuentas) console.log(`  · ${c.cliente} · ${c.cuenta} · $${Number(c.monto).toFixed(2)}`);
  if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }
  console.log("✔ Revertido:", JSON.stringify(await rpc("plataforma_revertir_saldos_centavos", { p_evento_id: revertir })));
  process.exit(0);
}

const hallados = await rpc("plataforma_saldos_centavos", { p_negocio_id: neg.id });
if (hallados.length === 0) { console.log("✔ Ninguna cuenta con un saldo de menos de un peso."); process.exit(0); }
console.log(`${hallados.length} cuenta(s) con un saldo de menos de un peso:`);
for (const h of hallados) console.log(`  · ${h.reserva_id} · ${h.cliente_nombre} · ${h.descripcion} · saldo $${Number(h.saldo).toFixed(2)} de $${Number(h.total_cuenta).toFixed(2)}`);

const elegidas = reservas.length ? hallados.filter((h) => reservas.includes(h.reserva_id)) : hallados;
if (reservas.length && elegidas.length !== reservas.length) throw new Error("Alguna de las cuentas pedidas no tiene un saldo de menos de un peso.");
if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }

const r = await rpc("plataforma_corregir_saldos_centavos", {
  p_negocio_id: neg.id,
  p_reservas: elegidas.map((h) => h.reserva_id),
  p_motivo: "Saldo de menos de un peso por redondeo del descuento por porcentaje (cobro hecho en pesos enteros)",
});
console.log(`✔ Corregidas ${r.cuentas.length} cuenta(s). Evento ${r.evento_id} (para revertir: --revertir ${r.evento_id}).`);
for (const c of r.cuentas) console.log(`  · ${c.cliente} · ${c.cuenta} · ajuste $${Number(c.monto).toFixed(2)}`);
