// Uso: node scripts/diseno/contraste.mjs
// Verifica con la fórmula de luminancia relativa de WCAG 2.1 cada
// combinación de texto sobre fondo del sistema de PeluDesk
// (src/app/globals.css). Sale con 1 si alguna no llega a su mínimo:
// 4.5:1 texto normal (AA), 3:1 texto grande / íconos / bordes de control.
import fs from "node:fs";

const css = fs.readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
const tokens = Object.fromEntries([...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const c = (n) => {
  if (n === "blanco") return "#ffffff";
  if (!tokens[n]) throw new Error(`token desconocido: ${n}`);
  return tokens[n];
};

// [texto, fondo, mínimo, dónde se usa]
const PARES = [
  // Texto de lectura sobre las superficies
  ...["n-0", "n-50", "n-100"].flatMap((f) => [
    ["n-900", f, 4.5, "texto principal"],
    ["n-700", f, 4.5, "labels, texto enfatizado"],
    ["n-600", f, 4.5, "texto secundario"],
    ["n-500", f, 3, "texto grande, íconos, borde de input"],
    ["morado", f, 4.5, "links, títulos de marca"],
    ["menta-oscuro", f, 4.5, "texto de éxito"],
    ["coral-oscuro", f, 4.5, "texto de error"],
    ["ambar-oscuro", f, 4.5, "texto de advertencia"],
  ]),
  // Botones sólidos
  ["blanco", "morado", 4.5, "botón primario"],
  ["blanco", "morado-oscuro", 4.5, "botón primario (hover)"],
  ["morado", "menta", 4.5, "botón secundario (menta con texto morado, como el kit)"],
  ["morado", "menta-hover", 4.5, "botón secundario (hover)"],
  ["blanco", "coral-oscuro", 4.5, "botón destructivo"],
  ["blanco", "menta-oscuro", 4.5, "botón de éxito"],
  ["n-900", "n-0", 4.5, "botón fantasma"],
  // Chips de estado y alertas (fondo suave + texto oscuro de la familia)
  ["menta-oscuro", "menta-suave", 4.5, "chip/alerta de éxito"],
  ["coral-oscuro", "coral-suave", 4.5, "chip/alerta de error"],
  ["ambar-oscuro", "ambar-suave", 4.5, "chip/alerta de advertencia"],
  ["morado", "morado-suave", 4.5, "chip/alerta de información"],
  ["n-700", "n-100", 4.5, "chip neutro"],
  // Texto de alertas: el cuerpo en neutro sobre el fondo suave
  ["n-700", "menta-suave", 4.5, "cuerpo de alerta de éxito"],
  ["n-700", "coral-suave", 4.5, "cuerpo de alerta de error"],
  ["n-700", "ambar-suave", 4.5, "cuerpo de alerta de advertencia"],
  ["n-700", "morado-suave", 4.5, "cuerpo de alerta de información"],
  // Contraste no textual (3:1): bordes de control y foco
  ["borde", "n-0", 3, "borde de input/select (sobre blanco)"],
  ["borde", "n-50", 3, "borde de input/select (sobre crema)"],
  ["blanco", "coral-hondo", 4.5, "botón destructivo (hover)"],
  ["blanco", "ambar-oscuro", 3, "símbolo blanco del ícono de alerta de advertencia"],
  ["blanco", "coral-oscuro", 3, "símbolo blanco del ícono de alerta de error"],
  ["blanco", "menta-oscuro", 3, "símbolo blanco del ícono de alerta de éxito"],
  ["blanco", "morado", 3, "símbolo blanco del ícono de alerta de información"],
  ["morado", "n-0", 3, "anillo de foco"],
  ["morado", "n-50", 3, "anillo de foco sobre crema"],
  // Los tonos base de la marca: NO llevan texto encima (se documenta que fallan)
];
const PROHIBIDOS = [
  ["blanco", "menta", "texto blanco sobre menta"],
  ["blanco", "coral", "texto blanco sobre coral"],
  ["blanco", "ambar", "texto blanco sobre ámbar"],
  ["menta", "n-0", "menta como color de texto"],
  ["coral", "n-0", "coral como color de texto"],
];

let fallas = 0;
console.log("Combinaciones permitidas:");
for (const [t, f, min, uso] of PARES) {
  const r = ratio(c(t), c(f));
  const ok = r >= min;
  if (!ok) fallas++;
  console.log(`  ${ok ? "✔" : "✘"} ${t.padEnd(13)} sobre ${f.padEnd(13)} ${r.toFixed(2).padStart(5)}:1 (mín ${min}) — ${uso}`);
}
console.log("\nPor qué existen las variantes oscuras (combinaciones prohibidas):");
for (const [t, f, uso] of PROHIBIDOS) console.log(`  · ${uso.padEnd(28)} ${ratio(c(t), c(f)).toFixed(2)}:1 — falla AA`);
console.log(fallas ? `\nFALLAS: ${fallas}` : "\nTODO PASA AA");
process.exit(fallas ? 1 : 0);
