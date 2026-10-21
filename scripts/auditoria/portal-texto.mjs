// Pura (sin base): lo que el dueño ve de una consulta no trae las etiquetas de la plantilla (QA S21, N110).
//   node --experimental-strip-types scripts/auditoria/portal-texto.mjs
import { sinEtiquetasDePlantilla } from "../../src/lib/veterinaria/portal-texto.ts";
let mal = 0;
const igual = (a, b, t) => { if (a === b) console.log(`  ✔ ${t}`); else { mal++; console.log(`  ✘ ${t}: salió ${JSON.stringify(a)} y debía ${JSON.stringify(b)}`); } };
const ET = ["Estudios solicitados", "Seguimiento / próxima revisión", "Recomendaciones al propietario", "Medicamento · dosis · vía · frecuencia · duración"];
igual(sinEtiquetasDePlantilla("Medicamento · dosis · vía · frecuencia · duración: Amoxicilina 250 mg cada 12 h por 7 días", ET), "Amoxicilina 250 mg cada 12 h por 7 días", "la guía del tratamiento se quita y queda el medicamento");
igual(sinEtiquetasDePlantilla("Estudios solicitados:\nSeguimiento / próxima revisión:\nRecomendaciones al propietario:", ET), "", "plan sin capturar: nada (la sección no se muestra)");
igual(sinEtiquetasDePlantilla("Estudios solicitados: Biometría\nRecomendaciones al propietario:", ET), "Biometría", "solo lo capturado, sin etiquetas");
igual(sinEtiquetasDePlantilla("Recomendaciones al propietario:\nDieta blanda tres días", ET), "Dieta blanda tres días", "contenido en el renglón siguiente");
igual(sinEtiquetasDePlantilla("Estudios solicitados: Seguimiento / próxima revisión:", ET), "", "varias etiquetas vacías en un renglón");
igual(sinEtiquetasDePlantilla("Biológico · lote · vía: Rabia, lote 1234, SC", []), "Rabia, lote 1234, SC", "guía con «·» de otra plantilla, aunque no venga en la lista");
igual(sinEtiquetasDePlantilla("Reposo: dos días sin correr", ET), "Reposo: dos días sin correr", "un «algo:» que no es etiqueta de la plantilla se conserva");
igual(sinEtiquetasDePlantilla("recomendaciones  al propietario: hidratar", ET), "hidratar", "sin importar mayúsculas ni espacios");
console.log(mal ? `\n${mal} HALLAZGO(S)` : "\nSin hallazgos.");
process.exit(mal ? 1 : 0);
