// Formato único de montos (QA S62): todo monto que se ENSEÑA en el panel, el portal y la app del dueño sale de dinero()
// (src/lib/dinero.ts: "$1,500.00", con separador de miles y signo menos tipográfico). Nunca `$${x.toFixed(2)}` ni
// `${x.toFixed(2)}` pegado a un «$» en el texto de una pantalla.
//
//   node scripts/auditoria/montos-formato.mjs            (revisa; sale con 1 si encuentra alguno)
//   node scripts/auditoria/montos-formato.mjs --arreglar (cambia los que encuentre por dinero() y agrega el import)
//
// Lo que no es para mostrar (el valor de un <input>, un JSON, un monto que viaja a la base) no lleva «$» delante y no
// cuenta.
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const CARPETAS = ["src/app/(staff)", "src/app/portal", "src/app/app", "src/components/ui", "src/components/caja", "src/components/cuentas", "src/lib/caja", "src/lib/cobro", "src/lib/cuentas", "src/lib/reservas"];
const ARREGLAR = process.argv.includes("--arreglar");

// `$${expr.toFixed(2)}` dentro de un template literal, o «$» seguido de `{expr.toFixed(2)}` en el texto de JSX.
const EN_PLANTILLA = /\$\$\{((?:[^{}]|\{[^{}]*\})*?)\.toFixed\(2\)\}/g;
const EN_JSX = /(^|[>\s(«"'])\$\{((?:[^{}]|\{[^{}]*\})*?)\.toFixed\(2\)\}/g;

function archivos(dir) {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const salida = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivos(p));
    else if (/\.(tsx?|jsx?)$/.test(e.name)) salida.push(p);
  }
  return salida;
}

// ¿La posición está dentro de un template literal en esa línea? (cuenta los backticks antes de ella)
const enBackticks = (linea, i) => (linea.slice(0, i).match(/`/g) ?? []).length % 2 === 1;

const hallazgos = [];
for (const rel of CARPETAS.flatMap(archivos)) {
  const abs = path.join(RAIZ, rel);
  const original = fs.readFileSync(abs, "utf8");
  let cambiado = false;
  const lineas = original.split("\n").map((linea, n) => {
    let l = linea.replace(EN_PLANTILLA, (_m, expr) => {
      hallazgos.push(`${rel}:${n + 1}: $\${${expr}.toFixed(2)}`);
      cambiado = true;
      return `\${dinero(${expr})}`;
    });
    l = l.replace(EN_JSX, (m, antes, expr, i) => {
      if (enBackticks(l, i + antes.length)) return m; // `${x.toFixed(2)}` de un texto sin «$»: no es un monto con signo
      hallazgos.push(`${rel}:${n + 1}: $` + `{${expr}.toFixed(2)}`);
      cambiado = true;
      return `${antes}{dinero(${expr})}`;
    });
    return l;
  });
  if (cambiado && ARREGLAR) {
    let s = lineas.join("\n");
    const local = /\nconst dinero = \([^)]*\)[^\n]*\n/;
    if (local.test(s)) s = s.replace(local, "\n"); // un formateador local se quita: manda el de la app
    if (!/import \{[^}]*\bdinero\b[^}]*\} from "@\/lib\/dinero"/.test(s)) {
      const ls = s.split("\n");
      let i = 0;
      while (i < ls.length && /^["']use (client|server)["'];?\s*$/.test(ls[i])) i++;
      ls.splice(i, 0, 'import { dinero } from "@/lib/dinero";');
      s = ls.join("\n");
    }
    fs.writeFileSync(abs, s);
  }
}
// Formateadores locales de pesos en el panel (deben usar dinero()).
for (const rel of CARPETAS.flatMap(archivos)) {
  const s = fs.readFileSync(path.join(RAIZ, rel), "utf8");
  const m = /\nconst dinero = \(/.exec(s);
  if (m) hallazgos.push(`${rel}: formateador local «const dinero»`);
}

if (hallazgos.length) {
  console.log(`${ARREGLAR ? "Arreglados" : "Montos con formato propio"} (${hallazgos.length}):`);
  for (const h of hallazgos.slice(0, 80)) console.log(`  ${ARREGLAR ? "·" : "✘"} ${h}`);
  process.exit(ARREGLAR ? 0 : 1);
}
console.log("✔ Todo monto que se enseña sale de dinero().");
