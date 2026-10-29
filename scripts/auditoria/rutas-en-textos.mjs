// QA R54 (N145): toda ruta de menú citada en un texto («Administración → Cuentas», «[Configuración → Recordatorios](/…)»)
// existe con ese nombre. Revisa la ayuda (src/lib/ayuda/articulos), los textos de las pantallas (src/app, src/components),
// el bot (src/lib/whatsapp/conocimiento.ts, src/lib/peludesk/respuestas-fijas.ts), los correos y las plantillas
// (src/lib/**/*.ts y *.json), sin los comentarios del código. Sale con 1 si encuentra una ruta falsa.
//
//   node scripts/auditoria/rutas-en-textos.mjs [--todas]
//
// Una cadena es de menú cuando su primer paso es el nombre de una entrada del menú real (SECCIONES_STAFF de
// src/lib/nav/config.ts, más «Inicio»), solo o después de «en», «desde», «a»… Entonces el paso siguiente tiene que ser:
//   - otra entrada del menú de la misma zona («Administración → Módulos y plan»: /admin y /admin/modulos; «Configuración →
//     Recordatorios» no: «Recordatorios» del menú es /recordatorios, las respuestas, no la configuración), o
//   - algo que se TOCA en esa pantalla: un enlace, una pestaña o un mosaico con ese nombre exacto (en los archivos de su
//     ruta, con un `href` o un `onClick` cerca). Un título de sección no es un paso de menú: así salía «Administración →
//     Cuentas», que es un título al fondo de la página del admin;
//   - o un paso genérico («su ficha», «tu ficha», «la cuenta»…).
// «Administración → X» con X en el menú también se marca: el admin no tiene «Administración» en su menú (su inicio es
// /admin y el menú se lo enseña como «Inicio»); X se nombra sola.
// Si la cadena es un enlace ([… → …](/ruta)), la ruta tiene que existir (ZONAS de src/lib/auth/acceso.ts o src/app).
import fs from "node:fs";
import path from "node:path";

const leer = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

// El menú real.
const config = leer("src/lib/nav/config.ts");
const MENU = new Map([...config.matchAll(/etiqueta:\s*"([^"]+)",\s*href:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
const ADMIN_INICIO = "/admin"; // rutaPorRol("admin"): para el admin, «Administración» es «Inicio».
// Las rutas que la app conoce.
const ZONAS = [...leer("src/lib/auth/acceso.ts").matchAll(/prefijo:\s*"([^"]+)"/g)].map((m) => m[1]);
const PASOS_GENERICOS = /^(su|tu|la|el) (ficha|expediente|cuenta|cita|reserva)\b/i;
const ANTES_DEL_MENU = /(^|\s)(en|desde|a|al|por|y|o|entra a|ve a|abre|toca|Entra a|Ve a|Abre|Toca)$/;

function archivos(dir, re = /\.(tsx?|json)$/) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? (e.name === "node_modules" ? [] : archivos(p, re)) : re.test(e.name) ? [p] : [];
  });
}

// Sin comentarios: lo que se ve es el texto, no lo que se le explica al programador.
function sinComentarios(t) {
  return t
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

function carpetaDeRuta(href) {
  const limpia = href.split(/[?#]/)[0];
  for (const grupo of ["(staff)", "portal", "plataforma", ""]) {
    const d = path.join("src", "app", grupo, ...limpia.split("/").filter(Boolean));
    if (fs.existsSync(d)) return d;
  }
  return null;
}
const rutaExiste = (href) => {
  const r = href.split(/[?#]/)[0];
  return Boolean(carpetaDeRuta(r)) || ZONAS.some((z) => r === z || r.startsWith(`${z}/`)) || r.startsWith("/ayuda");
};

// ¿Se toca algo llamado `paso` en la pantalla de `href`? (un enlace, una pestaña o un mosaico, con `href` u `onClick` cerca)
const cacheTexto = new Map();
function seTocaEn(href, paso) {
  const dir = carpetaDeRuta(href);
  if (!dir) return false;
  if (!cacheTexto.has(dir)) cacheTexto.set(dir, archivos(dir).map((f) => sinComentarios(leer(f))).join("\n"));
  const t = cacheTexto.get(dir);
  const esc = paso.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // El texto de un enlace puede ir entre saltos de línea (<Link …>\n  Turno\n</Link>).
  const re = new RegExp(`(["'«]|>\\s*|\\b(?:etiqueta|titulo|texto|nombre|label):\\s*["'])${esc}(["'»]|\\s*<|\\s*\\(|\\s*·)`, "g");
  for (const m of t.matchAll(re)) {
    const cerca = t.slice(Math.max(0, m.index - 300), m.index + 300);
    if (/\bhref\b|pestana|pestaña|\btab\b|onClick|router\.push/.test(cerca)) return true;
  }
  return false;
}

// Un paso: entre ** **, « », [ ](ruta) o <strong> </strong>; sin envoltura, hasta la puntuación (y se prueban sus prefijos).
const ENVOLTURAS = [["**", "**"], ["«", "»"], ["<strong>", "</strong>"], ["[", "]"]];
function pasoDerecho(t, i) {
  while (t[i] === " ") i += 1;
  for (const [a, b] of ENVOLTURAS) {
    if (t.startsWith(a, i)) {
      const j = t.indexOf(b, i + a.length);
      if (j < 0 || j - i > 80) return null;
      const enlace = a === "[" ? (t.slice(j + 1).match(/^\(([^)\s]+)\)/) ?? [])[1] ?? null : null;
      return { opciones: [t.slice(i + a.length, j).trim()], enlace };
    }
  }
  const resto = t.slice(i, i + 80).split(/[.,;:)(\n"'`<→\]»]/)[0].trim();
  const palabras = resto.split(/\s+/).filter(Boolean);
  return { opciones: palabras.map((_, k) => palabras.slice(0, k + 1).join(" ")).reverse(), enlace: null };
}
function pasoIzquierdo(t, i) {
  let k = i;
  while (t[k - 1] === " ") k -= 1;
  for (const [a, b] of ENVOLTURAS) {
    if (a === "[") continue;
    if (t.slice(0, k).endsWith(b)) {
      const j = t.lastIndexOf(a, k - b.length - 1);
      if (j >= 0 && k - j < 80) return { texto: t.slice(j + a.length, k - b.length).trim(), antes: t.slice(Math.max(0, j - 20), j).trim() };
    }
  }
  const atras = t.slice(Math.max(0, k - 80), k);
  const trozo = atras.split(/[.,;:)(\n"'`>«»[]/).pop();
  return { texto: trozo.trim(), antes: "" };
}

const FUENTES = [
  ...archivos("src/lib/ayuda/articulos"),
  ...archivos("src/app"),
  ...archivos("src/components"),
  ...archivos("src/lib").filter((f) => !f.includes(path.join("src", "lib", "ayuda", "articulos"))),
];
const NOMBRES = [...MENU.keys(), "Inicio"];
const hallazgos = [];
let revisadas = 0;
const MOSTRAR_TODAS = process.argv.includes("--todas");

for (const f of [...new Set(FUENTES)]) {
  const crudo = leer(f);
  if (!crudo.includes("→")) continue;
  const t = sinComentarios(crudo);
  for (let i = t.indexOf("→"); i >= 0; i = t.indexOf("→", i + 1)) {
    const izq = pasoIzquierdo(t, i);
    // El nombre del menú empieza el paso: «Ajustes de Veterinaria» no es «Veterinaria».
    const nombre = NOMBRES.filter((n) => izq.texto === n || (izq.texto.endsWith(` ${n}`) && ANTES_DEL_MENU.test(izq.texto.slice(0, -n.length).trim())))
      .sort((a, b) => b.length - a.length)[0];
    if (!nombre) continue;
    const der = pasoDerecho(t, i + 1);
    if (!der || !der.opciones.length || /^\$\{|^…/.test(der.opciones.at(-1))) continue;
    // [Menú → Paso](/ruta): el enlace cierra el paso derecho.
    const enlace = der.enlace ?? (t.slice(i, i + 120).match(/\]\(([^)\s]+)\)/) ?? [])[1] ?? null;
    revisadas += 1;
    const href = nombre === "Inicio" ? ADMIN_INICIO : MENU.get(nombre);
    const donde = `${f.replace(/\\/g, "/")}:~${t.slice(0, i).split("\n").length}`;
    const opciones = der.opciones.map((o) => o.replace(/^(la|el) (pestaña|sección|mosaico) /i, ""));
    const mismaZona = (o) => MENU.get(o).split("/")[1] === href.split("/")[1];
    const valida = opciones.find((o) => (MENU.has(o) && mismaZona(o)) || PASOS_GENERICOS.test(o) || seTocaEn(href, o));
    let problema = null;
    if (enlace && enlace.startsWith("/") && !rutaExiste(enlace)) problema = `el enlace ${enlace} no existe`;
    else if (nombre === "Administración" && valida && MENU.has(valida))
      problema = `«Administración» no está en el menú del admin (para él es «Inicio»); «${valida}» es una entrada del menú: nómbrala sola`;
    else if (!valida) problema = `en ${nombre} (${href}) no hay nada que se toque llamado «${opciones.at(-1)}» (no está en el menú ni es un enlace, pestaña o mosaico de esa pantalla)`;
    if (problema) hallazgos.push(`${donde} «${nombre} → ${opciones[0]}»: ${problema}`);
    else if (MOSTRAR_TODAS) console.log(`  ✔ ${donde} «${nombre} → ${valida}»`);
  }
}

console.log(`Rutas de menú citadas en textos: ${revisadas} (menú real: ${MENU.size} entradas)`);
for (const h of hallazgos) console.log(`  ✘ ${h}`);
console.log(hallazgos.length ? `${hallazgos.length} ruta(s) que no existen con ese nombre.` : "  ✔ Todas existen con ese nombre.");
process.exit(hallazgos.length ? 1 : 0);
