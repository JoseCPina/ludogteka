// Texto del aviso de cambio simultáneo (QA S19, N99). Sin base:
//   node --experimental-strip-types scripts/auditoria/conflicto-texto.mjs
import { textoConflicto, rangoHorario } from "../../src/lib/concurrencia/tipos.ts";

let fallas = 0;
const igual = (a, b, que) => { if (a === b) console.log(`  ✔ ${que}`); else { fallas++; console.log(`  ✘ ${que}: salió ${JSON.stringify(a)} y debía ${JSON.stringify(b)}`); } };
const Z = "America/Mexico_City";
const hace41 = new Date(Date.now() - 41000).toISOString();

igual(
  textoConflicto({ tabla: "citas_estetica", id: "x", quien: "Prueba QA", cuando: hace41, cambios: { inicio: ["a", "2026-10-21T18:00:00Z"], fin: ["b", "2026-10-21T20:00:00Z"] }, versionActual: null }, "esta cita", Z),
  "Prueba QA cambió esta cita hace 41 s: ahora es el 21 oct de 12:00 a 2:00 p. m. ¿Recargar con sus cambios o guardar los tuyos encima?",
  "fecha y horas nuevas en una frase, con un solo punto",
);
igual(rangoHorario("2026-10-21T17:00:00Z", "2026-10-21T19:00:00Z", Z), "ahora es el 21 oct de 11:00 a. m. a 1:00 p. m.", "de mañana a tarde lleva los dos periodos");
igual(rangoHorario("2026-10-21T17:00:00Z", null, Z), "ahora es el 21 oct a las 11:00 a. m.", "solo la hora de inicio");
const t = textoConflicto({ tabla: "x", id: "x", quien: "Ana", cuando: null, cambios: { notas: ["a", "Llega tarde."] }, versionActual: null }, "esta cita", Z);
igual(/\.\./.test(t), false, "nunca dos puntos seguidos");

console.log(fallas ? `\n${fallas} HALLAZGO(S)` : "\nSin hallazgos.");
process.exit(fallas ? 1 : 0);
