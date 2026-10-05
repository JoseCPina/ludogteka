// Carga (o revierte) las tarifas de estética de UN negocio por la función de
// la plataforma (plataforma_cargar_tarifas_estetica: idempotente, deja la foto
// de lo anterior en plataforma_eventos, nunca toca citas ya agendadas ni
// cobradas). Para el caso operativo de poner una tabla de precios completa sin
// SQL suelto.
//
//   node scripts/estetica/cargar-tarifas.mjs --negocio <slug> --tabla scripts/estetica/tablas/<archivo>.json [--prod] [--aplicar]
//   node scripts/estetica/cargar-tarifas.mjs --negocio <slug> --revertir <id-del-evento> [--prod] [--aplicar]
//
// Sin --aplicar solo dice qué cambiaría. La llave de producción se lee al
// vuelo por el CLI de Supabase y nunca se imprime ni se guarda.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PROD = args.includes("--prod");
const APLICAR = args.includes("--aplicar");
const slug = val("--negocio");
const archivo = val("--tabla");
const revertir = val("--revertir");
if (!slug || (!archivo && !revertir)) throw new Error("Uso: --negocio <slug> (--tabla <json> | --revertir <evento>) [--prod] [--aplicar]");

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

const [neg] = await get(`negocios?slug=eq.${encodeURIComponent(slug)}&select=id,nombre,slug`);
if (!neg) throw new Error(`No existe el negocio «${slug}».`);
console.log(`${PROD ? "PRODUCCIÓN" : "desarrollo"} · negocio ${neg.nombre} (${neg.slug})`);

let config;
if (revertir) {
  const [ev] = await get(`plataforma_eventos?id=eq.${revertir}&accion=eq.cargar_tarifas_estetica&select=detalle`);
  if (!ev || ev.detalle?.negocio_id !== neg.id) throw new Error("Ese evento no existe o es de otro negocio.");
  const antes = ev.detalle.antes ?? [];
  config = {
    // Las reglas de pelaje vuelven a su valor de fábrica (sin restricción).
    servicios: (ev.detalle.config?.servicios ?? []).map((s) => ({ clave: s.clave, pelajes_excluidos: [] })),
    grupos: (ev.detalle.config?.grupos ?? []).map((g) => ({ clave: g.clave, pelajes_permitidos: null })),
    tarifas: antes.map((t) => ({ servicio: t.servicio, grupo: t.grupo, tamano: t.tamano, precio: t.precio, maltratado: t.maltratado, no_aplica: t.no_aplica })),
  };
  console.log(`Revertir el evento ${revertir}: ${config.tarifas.length} tarifas como estaban.`);
} else {
  config = JSON.parse(fs.readFileSync(archivo, "utf8"));
  delete config._nota;
}

// Lo que cambiaría, leído de la base (solo lectura).
const servicios = await get(`servicios?negocio_id=eq.${neg.id}&categoria=eq.estetica&deleted_at=is.null&select=id,clave`);
const grupos = await get(`grupos_raza?negocio_id=eq.${neg.id}&deleted_at=is.null&select=id,clave,nombre`);
const tallas = await get("tamanos_categoria?select=id,clave");
const hoy = new Date().toISOString().slice(0, 10);
const vigentes = await get(`tarifas?negocio_id=eq.${neg.id}&deleted_at=is.null&vigencia_desde=lte.${hoy}&select=servicio_id,grupo_raza_id,tamano_id,precio,precio_pelo_maltratado,no_aplica,vigencia_desde&order=vigencia_desde.desc`);
let cambian = 0, iguales = 0;
for (const t of config.tarifas) {
  const sv = servicios.find((s) => s.clave === t.servicio)?.id;
  const gr = grupos.find((g) => g.clave === t.grupo);
  const tm = t.tamano ? tallas.find((x) => x.clave === t.tamano)?.id : null;
  if (!sv || !gr) { console.log(`  ✘ no existe ${t.servicio} / ${t.grupo}`); process.exit(1); }
  const act = vigentes.find((v) => v.servicio_id === sv && v.grupo_raza_id === gr.id && (v.tamano_id ?? null) === (tm ?? null));
  const na = Boolean(t.no_aplica);
  const mismo = act && act.no_aplica === na && (na || (Number(act.precio) === Number(t.precio) && (act.precio_pelo_maltratado === null ? null : Number(act.precio_pelo_maltratado)) === (t.maltratado ?? null)));
  if (mismo) iguales += 1;
  else {
    cambian += 1;
    console.log(`  ${act ? "cambia " : "nueva  "} ${t.servicio.replace("estetica_", "")} · ${gr.nombre}${t.tamano ? ` · ${t.tamano}` : ""}: ${act ? (act.no_aplica ? "no aplica" : `$${act.precio}${act.precio_pelo_maltratado ? `/$${act.precio_pelo_maltratado}` : ""}`) : "—"} → ${na ? "no aplica" : `$${t.precio}${t.maltratado ? `/$${t.maltratado}` : ""}`}`);
  }
}
console.log(`${cambian} tarifa(s) cambian, ${iguales} ya están igual.`);
if (!APLICAR) { console.log("Sin --aplicar no escribo nada."); process.exit(0); }

const r = await fetch(`${base}/rpc/plataforma_cargar_tarifas_estetica`, {
  method: "POST", headers: H,
  body: JSON.stringify({ p_negocio_id: neg.id, p_config: config, p_motivo: revertir ? `Reversión del evento ${revertir}` : "Tabla de precios de estética del negocio (5 de octubre de 2026)" }),
});
const cuerpo = await r.text();
if (!r.ok) { console.log(`✘ ${r.status}: ${cuerpo.slice(0, 400)}`); process.exit(1); }
console.log(`✔ Aplicado: ${cuerpo}`);
const [ev] = await get("plataforma_eventos?accion=eq.cargar_tarifas_estetica&order=created_at.desc&limit=1&select=id");
console.log(`  Evento ${ev?.id} (para revertir: --revertir ${ev?.id}).`);
