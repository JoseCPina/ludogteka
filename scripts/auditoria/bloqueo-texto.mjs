// Pura (sin base): el texto de un bloqueo según el permiso de «Excepciones al reservar».
//   node --experimental-strip-types scripts/auditoria/bloqueo-texto.mjs
import { textoDelBloqueo } from "../../src/lib/reservas/bloqueos.ts";
let mal = 0;
const ok = (c, t) => { if (c) console.log(`  ✔ ${t}`); else { mal++; console.log(`  ✘ ${t}`); } };
const SAN = "Falta Bordetella vigente de Nina. Un admin, o quien tenga el permiso «Excepciones al reservar», puede autorizar una excepción con motivo.";
const COM = "Este perro no tiene evaluación previa de comportamiento. Márcala en su expediente, o un admin puede autorizar una excepción con motivo.";
const sin = (t) => textoDelBloqueo(t, false);
ok(textoDelBloqueo(SAN, true) === SAN && textoDelBloqueo(COM, true) === COM, "con el permiso el texto queda tal cual (ahí sale la casilla)");
ok(sin(SAN).startsWith("Falta Bordetella vigente de Nina.") && !/puede autorizar/.test(sin(SAN)), "sin el permiso: dice qué falta y no ofrece autorizar");
ok(/No se puede reservar/.test(sin(SAN)) && /pídesela a un admin o a quien tenga el permiso/.test(sin(SAN)), "y dice que no se puede reservar y a quién pedírselo");
ok(sin(COM).startsWith("Este perro no tiene evaluación previa de comportamiento. Márcala en su expediente.") && !/puede autorizar/.test(sin(COM)), "comportamiento: conserva «Márcala en su expediente» y quita la oferta");
ok(textoDelBloqueo("Este perro está en celo.", false) === "Este perro está en celo.", "un bloqueo sin excepción no se toca");
console.log(mal ? `\n${mal} HALLAZGO(S)` : "\nSin hallazgos.");
process.exit(mal ? 1 : 0);
