// El horario de la página web de un negocio (QA S16, N72), sin base ni servidor:
//   node --experimental-strip-types scripts/auditoria/horario-web.mjs
// Un negocio 24 horas se ve igual en el estado de arriba y en la tarjeta de horario, nunca «cierra a las 11:59»,
// y el asistente de cita solo ofrece horas dentro del horario real (también con el corte de mediodía).
import { horarioDeGoogle, estadoAhora, renglonesHorario, horasDelDia, hora12, es24Horas } from "../../src/lib/web-negocio/horario.ts";

let fallas = 0;
const ok = (c, t, d = "") => { console.log(`  ${c ? "✔" : "✘"} ${t}${c || !d ? "" : `\n      ${d}`}`); if (!c) fallas++; };
const LUNES = "2026-10-19";

// 24 horas, como lo manda Google (un periodo sin cierre).
const h24 = horarioDeGoogle([{ open: { day: 0, hour: 0, minute: 0 } }]);
ok(h24.every((d) => es24Horas(d)), "un periodo sin cierre = abierto 24 horas los 7 días");
ok(estadoAhora(h24, LUNES, 23 * 60 + 30).texto === "Abierto 24 horas" && estadoAhora(h24, LUNES, 3 * 60).texto === "Abierto 24 horas", "el estado de arriba dice «Abierto 24 horas» a cualquier hora");
ok(renglonesHorario(h24).every((r) => r.texto === "Abierto 24 horas"), "la tarjeta de horario dice lo mismo");
// 24 horas día por día (00:00 → 00:00 del día siguiente).
const h24b = horarioDeGoogle([0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 0, minute: 0 }, close: { day: (d + 1) % 7, hour: 0, minute: 0 } })));
ok(estadoAhora(h24b, LUNES, 22 * 60).texto === "Abierto 24 horas" && renglonesHorario(h24b).every((r) => r.texto === "Abierto 24 horas"), "24 horas por día (00:00 a 00:00) se ve igual");
const horas = horasDelDia(h24, LUNES, 60);
ok(horas[0] === "00:00" && horas.at(-1) === "23:00" && horas.every((x) => /^([01]\d|2[0-3]):[03]0$/.test(x)), "el asistente ofrece de 00:00 a 23:00 (una cita de una hora termina antes de la medianoche)", horas.slice(-3).join(","));
ok(!JSON.stringify(renglonesHorario(h24)).includes("11:59") && hora12("23:59") === "12:00 a.m.", "nunca sale «11:59»");

// Cierra a comer: 9–14 y 16–20.
const hComida = horarioDeGoogle([{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 14, minute: 0 } }, { open: { day: 1, hour: 16, minute: 0 }, close: { day: 1, hour: 20, minute: 0 } }]);
const hc = horasDelDia(hComida, LUNES, 60);
ok(!hc.some((x) => x >= "13:30" && x < "16:00") && hc.includes("13:00") && hc.includes("16:00") && hc.at(-1) === "19:00", "con corte de mediodía no ofrece horas en el corte ni después del cierre", hc.join(","));
ok(renglonesHorario(hComida).find((r) => r.dia === "Lunes").texto === "9:00 a.m. a 2:00 p.m. y 4:00 p.m. a 8:00 p.m.", "la tarjeta dice los dos tramos");
ok(estadoAhora(hComida, LUNES, 15 * 60).texto === "Cerrado · abre hoy a las 4:00 p.m." && estadoAhora(hComida, LUNES, 10 * 60).texto === "Abierto · cierra a las 2:00 p.m.", "el estado de arriba sigue los tramos");

// Horario normal.
const hNormal = horarioDeGoogle([1, 2, 3, 4, 5].map((d) => ({ open: { day: d, hour: 9, minute: 0 }, close: { day: d, hour: 19, minute: 0 } })));
ok(estadoAhora(hNormal, LUNES, 12 * 60).texto === "Abierto · cierra a las 7:00 p.m." && horasDelDia(hNormal, LUNES, 60).at(-1) === "18:00", "horario normal sin cambios");

console.log(fallas ? `\n✘ ${fallas} falla(s).` : "\n✔ Sin hallazgos.");
process.exit(fallas ? 1 : 0);
