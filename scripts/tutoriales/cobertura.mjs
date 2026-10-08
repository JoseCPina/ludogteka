// Mapa de cobertura de la serie de tutoriales (docs/TUTORIALES.md).
//
//   node scripts/tutoriales/cobertura.mjs            revisa (sale con 1 si queda un hueco)
//   node scripts/tutoriales/cobertura.mjs --escribir  además regenera docs/TUTORIALES.md
//
// Compara el catálogo contra lo que la app TIENE: cada pantalla, cada entrada
// del menú, cada módulo, cada permiso, cada artículo de ayuda y cada aviso de
// «Necesita atención» tiene que estar en algún video, o excluido con motivo.
import fs from "node:fs";
import { AREAS, VIDEOS, EXCLUIDOS } from "./catalogo.mjs";
import { rutasDePantalla, menuDelPersonal, permisosCatalogo, modulosCatalogo, articulosDeAyuda, avisosNecesitaAtencion } from "./lib/fuentes.mjs";

const huecos = [];
const cubierto = (campo, valor) => VIDEOS.filter((v) => v[campo].includes(valor)).map((v) => v.id);

// 1. Pantallas
const filaRutas = rutasDePantalla().map((r) => {
  const ids = cubierto("rutas", r);
  const excl = EXCLUIDOS.rutas[r];
  if (!ids.length && !excl) huecos.push(`pantalla ${r}: sin video ni exclusión`);
  return { r, ids, excl };
});
// Rutas del catálogo que no existen (error de dedo).
for (const v of VIDEOS) for (const r of v.rutas) if (!filaRutas.some((x) => x.r === r)) huecos.push(`video ${v.id}: la ruta ${r} no existe en la app`);

// 2. Menú
const filaMenu = menuDelPersonal().map((m) => {
  const ids = VIDEOS.filter((v) => v.rutas.some((r) => r === m.href || r.startsWith(m.href + "/")) || v.rutas.includes(m.href)).map((v) => v.id);
  if (!ids.length) huecos.push(`menú «${m.etiqueta}» (${m.href}): sin video`);
  return { ...m, ids };
});

// 3. Módulos
const filaModulos = modulosCatalogo().map((m) => {
  const ids = cubierto("modulos", m);
  if (!ids.length) huecos.push(`módulo ${m}: sin video`);
  return { m, ids };
});

// 4. Permisos
const filaPermisos = permisosCatalogo().map((p) => {
  const ids = cubierto("permisos", p.clave);
  if (!ids.length && !EXCLUIDOS.permisos[p.clave]) huecos.push(`permiso ${p.clave}: sin video`);
  return { ...p, ids };
});

// 5. Artículos de ayuda
const filaArt = articulosDeAyuda().map((a) => {
  const ids = cubierto("articulos", a.slug);
  if (!ids.length) huecos.push(`artículo de ayuda ${a.slug}: sin video`);
  return { ...a, ids };
});
for (const v of VIDEOS) for (const s of v.articulos) if (!filaArt.some((a) => a.slug === s)) huecos.push(`video ${v.id}: el artículo ${s} no existe`);

// 6. Avisos de «Necesita atención»
const filaAvisos = avisosNecesitaAtencion().map((c) => {
  const ids = cubierto("avisos", c);
  if (!ids.length && !EXCLUIDOS.avisos[c]) huecos.push(`aviso «${c}» de Necesita atención: sin video`);
  return { c, ids };
});

// 7. El catálogo en sí
const slugs = new Set();
for (const v of VIDEOS) {
  if (slugs.has(v.slug)) huecos.push(`slug repetido: ${v.slug}`);
  slugs.add(v.slug);
  if (v.titulo.length > 70) huecos.push(`video ${v.id}: el título pasa de 70 caracteres`);
  if (!AREAS.some((a) => a.clave === v.area)) huecos.push(`video ${v.id}: área desconocida`);
}

if (process.argv.includes("--escribir")) {
  const ids = (l) => (l.length ? l.join(", ") : "—");
  const md = [];
  md.push("# Serie de videos tutoriales de PeluDesk — mapa de cobertura", "");
  md.push("Generado por `node scripts/tutoriales/cobertura.mjs --escribir` a partir de `scripts/tutoriales/catalogo.mjs` y de lo que la app tiene hoy (código). No se edita a mano: se cambia el catálogo.", "");
  md.push(`**${VIDEOS.length} videos** (el 00 es el avance) en ${AREAS.length} áreas. Cada pantalla, entrada del menú, módulo, permiso, artículo de ayuda y aviso de «Necesita atención» aparece en al menos un video o está excluido con su motivo.`, "");
  md.push("## Catálogo", "", "| Id | Área | Título | Cuenta | Duración objetivo | Módulos | Permisos |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const v of VIDEOS) md.push(`| ${v.id} | ${AREAS.find((a) => a.clave === v.area).nombre} | ${v.titulo} | ${v.rol} | ${Math.round(v.duracion / 60 * 10) / 10} min | ${v.modulos.join(", ") || "—"} | ${v.permisos.join(", ") || "—"} |`);
  md.push("", "## Pantallas → videos", "", "| Pantalla | Videos | Exclusión |", "| --- | --- | --- |");
  for (const f of filaRutas) md.push(`| \`${f.r}\` | ${ids(f.ids)} | ${f.excl ?? ""} |`);
  md.push("", "## Menú del personal → videos", "", "| Entrada | Ruta | Videos |", "| --- | --- | --- |");
  for (const f of filaMenu) md.push(`| ${f.etiqueta} | \`${f.href}\` | ${ids(f.ids)} |`);
  md.push("", "## Módulos → videos", "", "| Módulo | Videos |", "| --- | --- |");
  for (const f of filaModulos) md.push(`| ${f.m} | ${ids(f.ids)} |`);
  md.push("", "## Permisos delegables → videos", "", "| Permiso | Videos |", "| --- | --- |");
  for (const f of filaPermisos) md.push(`| ${f.etiqueta} (\`${f.clave}\`) | ${ids(f.ids)} |`);
  md.push("", "## Artículos de ayuda → videos", "", "| Artículo | Videos |", "| --- | --- |");
  for (const f of filaArt) md.push(`| ${f.slug} | ${ids(f.ids)} |`);
  md.push("", "## Avisos de «Necesita atención» → videos", "", "| Aviso | Videos |", "| --- | --- |");
  for (const f of filaAvisos) md.push(`| ${f.c} | ${ids(f.ids)} |`);
  md.push("", "## Cambios que afectan a la grabación", "");
  md.push("- **12 de octubre de 2026 — la conciliación solo considera pagos de origen PeluDesk.** Cambian Administración → Cobro con terminal (línea de «solo concilia lo que cobra desde aquí» y el interruptor «Mostrar también otros pagos de mi cuenta de Mercado Pago») y Caja → Conciliación (sección «Otros pagos de tu cuenta (informativo)», solo si el admin la enciende). Videos que enseñan esas pantallas o los artículos tocados (`cobrar-con-terminal`, `corregir-un-cobro-con-terminal-mal-marcado`, `que-hacer-con-necesita-atencion`, conexión de Mercado Pago): **01, 04, 05, 07, 08, 33, 34, 38, 50 y 59**. No se regrabaron: `npm run desplegar` los deja «por actualizar» en `/plataforma/tutoriales` y se regraban en el siguiente lote.");
  md.push("", "## Excluidos", "");
  for (const [r, m] of Object.entries(EXCLUIDOS.rutas)) md.push(`- Pantalla \`${r}\`: ${m}`);
  for (const [r, m] of Object.entries(EXCLUIDOS.avisos)) md.push(`- Aviso ${r}: ${m}`);
  for (const [r, m] of Object.entries(EXCLUIDOS.permisos)) md.push(`- Permiso ${r}: ${m}`);
  md.push("", "Fuera de la serie por diseño (no son del personal del negocio): la administración de la plataforma (`/plataforma`), el sitio público de peludesk.mx y el negocio de demostración.", "");
  fs.writeFileSync("docs/TUTORIALES.md", md.join("\n"));
  console.log("docs/TUTORIALES.md escrito.");
}

console.log(`${VIDEOS.length} videos · ${filaRutas.length} pantallas · ${filaMenu.length} entradas de menú · ${filaModulos.length} módulos · ${filaPermisos.length} permisos · ${filaArt.length} artículos · ${filaAvisos.length} avisos`);
if (huecos.length) {
  console.log(`\n✘ ${huecos.length} hueco(s):`);
  for (const h of huecos) console.log(`  - ${h}`);
  process.exit(1);
}
console.log("✔ Cero huecos.");
