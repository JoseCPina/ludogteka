// Recorrido de punta a punta de la «Clínica Demo PeluDesk» en PRODUCCIÓN, con navegador real.
//   node scripts/clinica-demo/recorrido.mjs 0 1 2          (los tramos en ese orden)
//   node scripts/clinica-demo/recorrido.mjs 3 --escritorio  (mismo tramo a 1280 px)
// Cada tramo vive en tramos/NN-*.mjs. El estado (ids) queda en la carpeta temporal.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contexto, hallazgos, registrarHallazgos } from "./comun.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const pedidos = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map((a) => a.padStart(2, "0"));
if (!pedidos.length) throw new Error("Di qué tramos correr, por ejemplo: 0 1");
const archivos = fs.readdirSync(path.join(AQUI, "tramos")).filter((f) => f.endsWith(".mjs")).sort();
const c = await contexto();
try {
  for (const n of pedidos) {
    const archivo = archivos.find((f) => f.startsWith(`${n}-`));
    if (!archivo) throw new Error(`No existe el tramo ${n}`);
    console.log(`\n══ Tramo ${n} (${archivo})`);
    const antes = hallazgos.length;
    try {
      const m = await import(`./tramos/${archivo}`);
      await m.tramo(c);
    } catch (e) {
      hallazgos.push(`el tramo ${n} se detuvo: ${e.message}`);
      console.log(`  ✘ el tramo ${n} se detuvo: ${e.message}`);
    }
    registrarHallazgos(n);
    console.log(`   → ${hallazgos.length - antes} hallazgo(s) en el tramo ${n}`);
  }
} finally {
  await c.nav.close();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s):\n${hallazgos.map((h) => `   - ${h}`).join("\n")}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
