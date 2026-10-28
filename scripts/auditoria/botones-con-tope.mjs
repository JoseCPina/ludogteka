// QA S41: el botón sale de «Guardando…» SIEMPRE, también si la acción truena o no contesta. Eso lo garantiza que toda
// llamada a una acción del servidor desde una pantalla pase por la espera con tope: `useEspera().ejecutar/correr`,
// `FormularioAccion` / `BotonAccion`, `useAccionConTope` (useActionState) o `conTope(...)`.
//
//   node scripts/auditoria/botones-con-tope.mjs
//
// Busca en los componentes de cliente un `await accion(` de una función importada de un archivo de acciones que no
// esté envuelta en ninguna de esas, y el patrón a mano `setX(true)` … `await` … `setX(false)` sin `finally`. Una
// llamada que de verdad no es de un botón (precarga, autoguardado con su propio tope) lleva `tope-ok: motivo`.
// Sale con 1 si encuentra alguna.
import fs from "node:fs";
import path from "node:path";

function archivos(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
}

const hallazgos = [];
for (const f of archivos("src")) {
  const t = fs.readFileSync(f, "utf8");
  if (!/^["']use client["']/.test(t)) continue;
  const lineas = t.split(/\r?\n/);
  const nombres = [...t.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]*(?:actions|acciones)[^"]*)"/g)]
    .flatMap((m) => m[1].split(","))
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("type "))
    .map((s) => s.split(/\s+as\s+/).pop());
  for (const a of nombres) {
    const re = new RegExp(`await\\s+${a}\\(`, "g");
    for (const m of t.matchAll(re)) {
      const n = t.slice(0, m.index).split(/\r?\n/).length;
      const antes = t.slice(Math.max(0, m.index - 120), m.index);
      if (/(ejecutar|correr)\(\s*(async\s*)?\(\)\s*=>\s*(\{[^}]*)?$/.test(antes) || /conTope\(\s*$/.test(antes)) continue;
      // Dentro de un ejecutar/correr/esperarConTope(async () => …) que empieza en la misma línea o unas arriba.
      const bloque = lineas.slice(Math.max(0, n - 40), n).join("\n");
      if (/(ejecutar|correr|esperarConTope|conTope)\(\s*async\s*\(\)\s*=>/.test(bloque)) continue;
      if (/tope-ok:/.test(lineas[n - 1]) || /tope-ok:/.test(lineas[n - 2] ?? "")) continue;
      hallazgos.push(`${f.replace(/\\/g, "/")}:${n}  await ${a}(…) sin espera con tope`);
    }
  }
  lineas.forEach((l, i) => {
    const m = l.match(/\bset([A-Z]\w*)\(true\)/);
    if (!m || !/^(Cargando|Enviando|Guardando|Procesando|Firmando|Subiendo|Ocupado|Espera\w*)$/.test(m[1])) return;
    const siguiente = lineas.slice(i, i + 15).join("\n");
    if (/await/.test(siguiente) && new RegExp(`set${m[1]}\\(false\\)`).test(siguiente) && !/finally/.test(siguiente)) {
      hallazgos.push(`${f.replace(/\\/g, "/")}:${i + 1}  set${m[1]}(true) … await … set${m[1]}(false) sin finally`);
    }
  });
}
for (const h of hallazgos) console.log(`  ✘ ${h}`);
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} espera(s) sin tope.` : "✔ Toda acción desde una pantalla pasa por la espera con tope.");
process.exit(hallazgos.length ? 1 : 0);
