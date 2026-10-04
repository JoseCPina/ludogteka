// Agrega una raza al catálogo compartido por la función de la plataforma
// (plataforma_agregar_raza: queda en plataforma_eventos, nunca asigna grupo
// de precio). Para el caso operativo de dar de alta una raza que la
// administración de PeluDesk decide agregar, sin SQL suelto.
//
//   node scripts/razas/agregar-raza.mjs --prod "Calupoh" --variantes "calupo,kalupoh" --talla grande [--pelaje <clave>] [--aplicar]
//
// Sin --aplicar solo dice qué haría (y si ya existe). La llave de producción
// se lee al vuelo por el CLI de Supabase (sesión del Administrador de
// credenciales) y nunca se imprime ni se guarda.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PROD = args.includes("--prod");
const APLICAR = args.includes("--aplicar");
const nombre = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && args[i - 1] !== "--prod" && args[i - 1] !== "--aplicar"));
const variantes = (val("--variantes") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const talla = val("--talla");
const pelaje = val("--pelaje");
if (!nombre) throw new Error('Falta el nombre: node scripts/razas/agregar-raza.mjs --prod "Calupoh" --variantes "calupo,kalupoh" --talla grande');

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

const conflicto = await (await fetch(`${base}/rpc/razas_conflicto`, { method: "POST", headers: H, body: JSON.stringify({ p_texto: nombre }) })).json();
const choque = Array.isArray(conflicto) ? conflicto[0] : conflicto;
console.log(`${PROD ? "PRODUCCIÓN" : "desarrollo"}: «${nombre}» variantes [${variantes.join(", ")}] talla ${talla ?? "—"} pelo ${pelaje ?? "—"}`);
if (choque?.raza_id) {
  console.log(`  Ya existe como «${choque.raza_nombre}» (por «${choque.variante}»). No se agrega nada.`);
  process.exit(0);
}
if (!APLICAR) {
  console.log("  No existe. Sin --aplicar no escribo nada.");
  process.exit(0);
}
const r = await fetch(`${base}/rpc/plataforma_agregar_raza`, {
  method: "POST", headers: H,
  body: JSON.stringify({ p_nombre: nombre, p_variantes: variantes, p_tamano_clave: talla, p_pelaje_clave: pelaje, p_motivo: "Alta directa por la plataforma (caso Calupoh)" }),
});
const cuerpo = await r.text();
if (!r.ok) {
  console.log(`  ✘ ${r.status}: ${cuerpo.slice(0, 300)}`);
  process.exit(1);
}
console.log(`  ✔ Agregada (id ${JSON.parse(cuerpo)}). Ningún negocio recibió grupo de precio.`);
