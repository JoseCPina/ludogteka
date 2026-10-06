// Calcula la matriz TALLA × PELAJE del grupo «Mestizo / sin raza» de UN negocio
// a partir de SUS grupos de raza de referencia, y escribe la tabla lista para
// cargar con cargar-tarifas.mjs. Solo lectura.
//
//   node scripts/estetica/calcular-mestizo.mjs --negocio <slug> [--prod] [--salida scripts/estetica/tablas/<slug>-mestizo.json]
//
// Criterio (9 de octubre de 2026):
//   · pelo LARGO: chico ≈ grupo poodle/maltés; grande ≈ pastor pelo largo;
//     mediano = punto medio entre shih tzu y pastor pelo largo.
//   · pelo MEDIO = un escalón por debajo del largo (× 0.85).
//   · todo redondeado a múltiplos de 10.
//   · maltratado (solo baño estético completo): el mismo recargo proporcional que
//     ya cobran los grupos de referencia (promedio de maltratado / precio).
//   · pelo CORTO no se toca: son los precios que el negocio ya tenía por talla.
//   · rapado: solo medio y largo (a pelo corto no se ofrece).
//   · Todo lo calculado sale marcado «calculado» hasta que el admin lo confirma.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PROD = args.includes("--prod");
const slug = val("--negocio");
if (!slug) throw new Error("Uso: --negocio <slug> [--prod] [--salida archivo]");
const salida = val("--salida") ?? `scripts/estetica/tablas/${slug}-mestizo.json`;
const FACTOR_MEDIO = 0.85;
const TALLAS = ["chico", "mediano", "grande"];
const SERVICIOS = ["estetica_estetico", "estetica_rapado", "estetica_expres"];
const redondea = (n) => Math.round(n / 10) * 10;

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
const H = { apikey: llave, Authorization: `Bearer ${llave}` };
const get = async (ruta) => { const r = await fetch(`${base}/${ruta}`, { headers: H }); if (!r.ok) throw new Error(`${ruta}: ${r.status}`); return r.json(); };

const [neg] = await get(`negocios?slug=eq.${encodeURIComponent(slug)}&select=id,nombre`);
if (!neg) throw new Error(`No existe el negocio «${slug}».`);
const servicios = await get(`servicios?negocio_id=eq.${neg.id}&categoria=eq.estetica&deleted_at=is.null&select=id,clave`);
const grupos = await get(`grupos_raza?negocio_id=eq.${neg.id}&deleted_at=is.null&select=id,clave`);
const tallas = await get("tamanos_categoria?select=id,clave");
const pelajes = await get("tipos_pelaje?select=id,clave");
const hoy = new Date().toISOString().slice(0, 10);
const vig = await get(`tarifas?negocio_id=eq.${neg.id}&deleted_at=is.null&vigencia_desde=lte.${hoy}&select=servicio_id,grupo_raza_id,tamano_id,pelaje_id,precio,precio_pelo_maltratado,no_aplica,vigencia_desde&order=vigencia_desde.desc`);
const gid = (c) => grupos.find((g) => g.clave === c)?.id;
const sid = (c) => servicios.find((s) => s.clave === c)?.id;
const vigente = (servicio, grupo, tamano = null, pelaje = null) =>
  vig.find((t) => t.servicio_id === sid(servicio) && t.grupo_raza_id === gid(grupo) && (t.tamano_id ?? null) === (tamano ? tallas.find((x) => x.clave === tamano)?.id : null) && (t.pelaje_id ?? null) === (pelaje ? pelajes.find((x) => x.clave === pelaje)?.id : null) && !t.no_aplica);
const ref = (servicio, grupo) => { const t = vigente(servicio, grupo); if (!t) throw new Error(`Falta la referencia ${servicio} / ${grupo} en ${slug}.`); return Number(t.precio); };

// Recargo proporcional del pelo maltratado, de los grupos de referencia.
const ratios = ["poodle_maltes", "shihtzu_similares", "pomerania"].map((g) => vigente("estetica_estetico", g)).filter((t) => t?.precio_pelo_maltratado).map((t) => Number(t.precio_pelo_maltratado) / Number(t.precio));
const ratioMalt = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1.15;

const largo = {};
for (const s of SERVICIOS) {
  const p = ref(s, "poodle_maltes"), sh = ref(s, "shihtzu_similares"), pa = ref(s, "pastor_largo");
  largo[s] = { chico: p, mediano: redondea((sh + pa) / 2), grande: pa };
}
const tarifas = [];
const tabla = [];
for (const s of SERVICIOS) {
  for (const t of TALLAS) {
    for (const pel of ["corto", "medio", "largo"]) {
      if (pel === "corto") {
        const actual = vigente(s, "mestizo", t, "corto");
        tabla.push({ servicio: s, talla: t, pelaje: pel, precio: actual ? Number(actual.precio) : null, maltratado: actual?.precio_pelo_maltratado ? Number(actual.precio_pelo_maltratado) : null, calculado: false });
        continue;
      }
      const precio = pel === "largo" ? largo[s][t] : redondea(largo[s][t] * FACTOR_MEDIO);
      const maltratado = s === "estetica_estetico" ? redondea(precio * ratioMalt) : null;
      tarifas.push({ servicio: s, grupo: "mestizo", tamano: t, pelaje: pel, precio, maltratado, calculado: true });
      tabla.push({ servicio: s, talla: t, pelaje: pel, precio, maltratado, calculado: true });
    }
  }
}
const config = {
  _nota: `Matriz «Mestizo / sin raza» de ${neg.nombre} calculada por proporción desde sus grupos de referencia (calcular-mestizo.mjs, 9 de octubre de 2026). Pelo corto no se toca; medio ≈ 0.85 × largo; todo a múltiplos de 10; maltratado con el recargo proporcional de los grupos de referencia (×${ratioMalt.toFixed(3)}). Marcado «calculado» hasta que el admin lo confirme.`,
  grupos: [{ clave: "mestizo", pelajes_permitidos: null, depende_pelaje: true }],
  tarifas,
};
fs.writeFileSync(salida, JSON.stringify(config, null, 1) + "\n");
console.log(`${PROD ? "PRODUCCIÓN" : "desarrollo"} · ${neg.nombre} → ${salida} (${tarifas.length} celdas calculadas, recargo maltratado ×${ratioMalt.toFixed(3)})\n`);
console.log("servicio · talla · pelaje · precio (maltratado) · origen");
for (const x of tabla) console.log(`${x.servicio.replace("estetica_", "").padEnd(8)} ${x.talla.padEnd(8)} ${x.pelaje.padEnd(6)} ${String(x.precio ?? "—").padStart(5)}${x.maltratado ? ` (${x.maltratado})` : ""}  ${x.calculado ? "calculado" : "ya estaba"}`);
