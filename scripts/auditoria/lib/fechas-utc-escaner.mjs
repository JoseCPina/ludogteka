// Escáner estático de fechas en UTC (B20, 15 de octubre de 2026).
// Un instante (timestamptz) se muestra o compara SIEMPRE en la zona del
// negocio. Marca, en src/, lo que toma el día de un instante sin zona:
//   - formatearFechaCalendario(<algo _at / inicio / fin / firmado…>)
//   - <instante>.slice(0, 10) / .substring(0, 10) / .split("T")[0]
//   - new Date().toISOString().slice(0, 10) y .toISOString().slice(0, 7)
//   - toLocaleDateString / toLocaleString sin timeZone
//   - new Date().getFullYear()/getMonth()/getDate() para "hoy" o el mes
// Un falso positivo real lleva `// utc-ok: motivo` en su línea o la anterior.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = new URL("../../../src", import.meta.url).pathname;
const INSTANTE = /(_at|\.at|At|\.inicio|\.fin|_antes|_despues)\b/;

const REGLAS = [
  { id: "calendario-con-instante", re: /formatearFechaCalendario\(\s*([^)]*)\)/ },
  { id: "slice-de-instante", re: /(\w[\w.?]*(_at|\.at|At|\.inicio|\.fin)\b[^;\n]*)\.(slice|substring)\(0,\s*10\)/ },
  { id: "toISOString-dia", re: /toISOString\(\)\s*\.(slice|substring)\(0,\s*(10|7)\)/ },
  { id: "split-T", re: /(_at|At|\.inicio)\w*\s*\.split\(["']T["']\)\[0\]/ },
  { id: "locale-sin-zona", re: /(toLocaleDateString|toLocaleTimeString|new Date\([^)]*\)\.toLocaleString)\(\s*["'][\w-]+["']\s*(,\s*\{(?![^}]*timeZone)[^}]*\})?\s*\)/ },
  { id: "hoy-con-Date", re: /new Date\(\)\.(getMonth|getDate)\(\)/ },
];

function* archivos(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* archivos(p);
    else if (/\.(ts|tsx)$/.test(n)) yield p;
  }
}

export function escanear() {
  const hallazgos = [];
  for (const f of archivos(RAIZ)) {
    const lineas = readFileSync(f, "utf8").split("\n");
    lineas.forEach((l, i) => {
      if (/utc-ok:/.test(l) || /utc-ok:/.test(lineas[i - 1] ?? "")) return;
      if (/^\s*(\/\/|\*)/.test(l)) return;
      for (const r of REGLAS) {
        const m = l.match(r.re);
        if (!m) continue;
        if (r.id === "calendario-con-instante" && (!INSTANTE.test(m[1]) || /fechaLocalDeInstante/.test(m[1]))) continue;
        hallazgos.push({ archivo: relative(RAIZ, f), linea: i + 1, regla: r.id, texto: l.trim().slice(0, 140) });
      }
    });
  }
  return hallazgos;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const h = escanear();
  for (const x of h) console.log(`${x.archivo}:${x.linea} [${x.regla}] ${x.texto}`);
  console.log(`\n${h.length} hallazgo(s)`);
  process.exit(h.length ? 1 : 0);
}
