// QA S41 (N143): ningún buscador, etiqueta, placeholder ni texto de las pantallas que ve un negocio con Veterinaria
// dice «perro» fijo: sale de vocabularioMascota({ conVet, especie }) («mascota», «gato» o «perro»).
//
//   node scripts/auditoria/perro-fijo-con-vet.mjs
//
// Revisa las pantallas del personal de Caja, Clientes, Estética, reservar (nueva y serie), Veterinaria e Inventario y
// los componentes compartidos (buscadores, formularios): atributos de texto (label, placeholder, etiqueta, titulo,
// ayuda, vacio, aria-label) y texto de JSX con «perro», «perros», «perrito» o «perritos». Lo que es solo de perros por
// regla (talla, pelaje, guardería y hotel adentro, reportes de guardería, requisitos y evaluación de estancias, el alta
// de un perrito de estética con raza, talla y pelaje) no se revisa. Una línea que de verdad habla de perros lleva
// `perro-ok: motivo`. Sale con 1 si encuentra alguno.
import fs from "node:fs";
import path from "node:path";

const AREAS = [
  "src/app/(staff)/caja",
  "src/app/(staff)/clientes",
  "src/app/(staff)/estetica",
  "src/app/(staff)/reservas/nueva",
  "src/app/(staff)/reservas/series",
  "src/app/(staff)/veterinaria",
  "src/app/(staff)/inventario",
  "src/components/buscador-clientes.tsx",
  "src/components/cuentas",
];
const PALABRA = /\b[Pp]err(o|os|ito|itos)\b/;
const ATRIBUTO = /\b(label|placeholder|etiqueta|titulo|ayuda|vacio|aria-label)=("([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g;
const TEXTO_JSX = />([^<>{}]*)</g;
// Solo de perros por regla: el alta del perrito de estética (raza, talla y pelaje).
const SOLO_PERROS = [/Nombre del perrito/, /perrito de este cliente/, /Registra el perrito/, /Otro perrito de/, /Guardar y agendarle su cita/];

function archivos(p) {
  if (!fs.existsSync(p)) return [];
  if (fs.statSync(p).isFile()) return [p];
  return fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => archivos(path.join(p, e.name)));
}

const hallazgos = [];
for (const f of AREAS.flatMap(archivos).filter((f) => f.endsWith(".tsx"))) {
  const lineas = fs.readFileSync(f, "utf8").split(/\r?\n/);
  lineas.forEach((l, n) => {
    if (/perro-ok:/.test(l) || /^\s*(\/\/|\*|\/\*)/.test(l) || /\{\/\*/.test(l)) return;
    const vistos = [];
    for (const m of l.matchAll(ATRIBUTO)) {
      const t = m[3] ?? m[4] ?? m[5] ?? "";
      if (PALABRA.test(t.replace(/\$\{[^}]*\}/g, ""))) vistos.push(`${m[1]}="${t}"`);
    }
    for (const m of l.matchAll(TEXTO_JSX)) {
      const t = m[1].trim();
      if (t && PALABRA.test(t)) vistos.push(`texto «${t}»`);
    }
    for (const v of vistos) {
      if (SOLO_PERROS.some((r) => r.test(v))) continue;
      hallazgos.push(`${f.replace(/\\/g, "/")}:${n + 1}  ${v.slice(0, 140)}`);
    }
  });
}
for (const h of hallazgos) console.log(`  ✘ ${h}`);
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} texto(s) con «perro» fijo en pantallas que ve un negocio con Veterinaria.` : "✔ Ningún «perro» fijo en esas pantallas.");
process.exit(hallazgos.length ? 1 : 0);
