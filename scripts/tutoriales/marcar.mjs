// Marca videos tutoriales como «por actualizar» (estado persistente con motivo y
// fecha) en desarrollo y, con --prod, en producción.
//
//   node scripts/tutoriales/marcar.mjs --json '[{"numero":"04","motivo":"cambió /estetica"}]' [--prod]
//   node scripts/tutoriales/marcar.mjs --archivo marcas.json [--prod]
//   node scripts/tutoriales/marcar.mjs --limpiar 04 [--prod]     (a mano; regrabar con éxito ya lo limpia)
//
// Lo llama `npm run desplegar` después de publicar, con lo que dijo
// afectados.mjs --json (calculado ANTES de fusionar: después el diff está vacío).
// La llave de producción se lee al vuelo del CLI y nunca se imprime.
import fs from "node:fs";
import { conectar } from "./lib/db.mjs";

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PROD = args.includes("--prod");

let marcas = [];
if (val("--json")) marcas = JSON.parse(val("--json"));
else if (val("--archivo")) marcas = JSON.parse(fs.readFileSync(val("--archivo"), "utf8"));
const limpiar = val("--limpiar");

for (const prod of PROD ? [false, true] : [false]) {
  const c = conectar(prod).cliente;
  if (limpiar) {
    const { error } = await c.from("tutoriales").update({ por_actualizar_motivo: null, por_actualizar_desde: null }).eq("numero", limpiar);
    console.log(`${prod ? "producción" : "desarrollo"}: ${error ? "error: " + error.message : `video ${limpiar} limpiado`}`);
    continue;
  }
  if (!marcas.length) { console.log("Nada que marcar."); break; }
  const { data, error } = await c.rpc("plataforma_tutoriales_marcar", { p_marcas: marcas });
  console.log(`${prod ? "producción" : "desarrollo"}: ${error ? "error: " + error.message : `${data} video(s) marcados «por actualizar»`}`);
}
