// Pura (sin base): de «Tratamiento» a un borrador de receta, y la cuenta de la cantidad a surtir.
//   node --experimental-strip-types scripts/auditoria/tratamiento-receta.mjs
import { medicamentosDeTratamiento, horasDeFrecuencia, numeroInicial, calcularCantidad } from "../../src/lib/veterinaria/recetas.ts";
let mal = 0;
const igual = (a, b, t) => { if (JSON.stringify(a) === JSON.stringify(b)) console.log(`  ✔ ${t}`); else { mal++; console.log(`  ✘ ${t}: salió ${JSON.stringify(a)} y debía ${JSON.stringify(b)}`); } };
const m = medicamentosDeTratamiento("Amoxicilina 250 mg, 1 tableta cada 12 horas por 7 días\nMeloxicam 1 ml cada 24 h durante 3 días");
igual(m.length, 2, "dos renglones, dos medicamentos");
igual([m[0].producto, m[0].dosis, m[0].frecuencia_horas, m[0].duracion_dias], ["Amoxicilina", "1 tableta", "12", "7"], "Amoxicilina: nombre, dosis, horas y días");
igual([m[1].producto, m[1].dosis_cantidad, m[1].frecuencia_horas, m[1].duracion_dias], ["Meloxicam", "1", "24", "3"], "Meloxicam");
igual(medicamentosDeTratamiento("Reposo y dieta blanda")[0].producto, "Reposo y dieta blanda", "texto libre: queda como nombre editable");
igual(medicamentosDeTratamiento("").length + medicamentosDeTratamiento(null).length, 0, "vacío: nada");
igual(horasDeFrecuencia("Cada 8 horas"), 8, "cada 8 horas");
igual(horasDeFrecuencia("2 veces al día"), 12, "2 veces al día");
igual(horasDeFrecuencia("una vez al día"), 24, "una vez al día");
igual(horasDeFrecuencia("cuando haga falta"), null, "no se entiende: null (no se inventa)");
igual(numeroInicial("1/2 tableta"), 0.5, "media tableta en fracción");
igual(numeroInicial("media tableta"), 0.5, "media tableta escrita");
igual(calcularCantidad(1, 12, 7), 14, "1 tableta cada 12 h por 7 días = 14");
igual(calcularCantidad(0.5, 8, 5), 8, "media tableta cada 8 h por 5 días = 7.5 → 8");
console.log(mal ? `\n${mal} HALLAZGO(S)` : "\nSin hallazgos.");
process.exit(mal ? 1 : 0);
