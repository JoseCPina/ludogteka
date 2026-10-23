// «Agendar» propone la siguiente media hora disponible (QA externa B19, N116): nunca una hora que ya pasó.
// Con el reloj simulado y la cadena completa: scripts/auditoria/fecha-cita-hoy.mjs.
//   node --experimental-strip-types scripts/auditoria/proxima-hora.mjs
import { proximaHoraDisponible } from "../../src/lib/estetica/proxima-hora.ts";

let fallos = 0;
const ok = (c, t) => { console.log(`  ${c ? "✔" : "✘"} ${t}`); if (!c) fallos++; };
const ZONA = "America/Mexico_City"; // UTC-6 todo el año desde 2022
const abre = (a, c) => () => ({ abre: true, apertura: a, cierre: c });
// Miércoles 14 de octubre de 2026, 13:05 hora del negocio = 19:05 UTC.
const ahora = (hhmmLocal) => { const [h, m] = hhmmLocal.split(":").map(Number); return new Date(Date.UTC(2026, 9, 14, h + 6, m)).toISOString(); };

console.log("── Siguiente hora disponible de hoy");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-14T13:30", "a las 13:05 propone las 13:30 (no las 10:00)");
ok(proximaHoraDisponible(ahora("13:00"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-14T13:30", "a las 13:00 en punto propone las 13:30");
ok(proximaHoraDisponible(ahora("07:30"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-14T09:00", "antes de abrir propone la apertura");
ok(proximaHoraDisponible(ahora("17:59"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-14T18:00", "a las 17:59 propone las 18:00");
ok(proximaHoraDisponible(ahora("18:00"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-14T18:30", "a las 18:00 todavía cabe la de las 18:30 (N116: proponía mañana)");
console.log("── Si hoy ya no hay, la primera de mañana");
ok(proximaHoraDisponible(ahora("18:30"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-15T09:00", "a las 18:30 propone mañana a las 09:00");
ok(proximaHoraDisponible(ahora("21:00"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-15T09:00", "ya cerrado: mañana a las 09:00");
const sinSabado = (f) => (f === "2026-10-17" ? { abre: false, apertura: null, cierre: null } : { abre: true, apertura: "09:00", cierre: "19:00" });
ok(proximaHoraDisponible(ahora("20:00"), ZONA, (f) => (f === "2026-10-15" ? { abre: false, apertura: null, cierre: null } : { abre: true, apertura: "10:00", cierre: "14:00" })) === "2026-10-16T10:00", "salta el día que no abre");
ok(proximaHoraDisponible(ahora("12:00"), ZONA, (f) => sinSabado(f)) === "2026-10-14T12:30", "un día normal no se afecta");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, () => null) === "2026-10-14T13:30", "sin horario configurado usa 09:00 a 19:00");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:30:00", "19:00:00")) === "2026-10-14T13:30", "con apertura a las 9:30 sigue en medias horas");
ok(proximaHoraDisponible(ahora("05:00"), ZONA, abre("09:30:00", "19:00:00")) === "2026-10-14T09:30", "apertura 9:30: antes de abrir propone las 9:30");
ok(proximaHoraDisponible(ahora("05:00"), ZONA, abre("09:15:00", "19:00:00")) === "2026-10-14T09:30", "apertura 9:15: la primera media hora posterior es las 9:30");
console.log("── Con un día ya escogido");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:00", "19:00"), 14, "2026-10-20") === "2026-10-20T09:00", "un día futuro escogido abre a la primera hora");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:00", "19:00"), 14, "2026-10-14") === "2026-10-14T13:30", "el mismo día de hoy sigue pidiendo la siguiente media hora");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:00", "19:00"), 14, "2026-10-01") === "2026-10-14T13:30", "un día pasado cuenta como hoy");
// Cambio de día en UTC: 18:30 y 21:30 locales ya son el día siguiente en UTC.
ok(proximaHoraDisponible(ahora("18:30"), ZONA, abre("09:00", "22:00")) === "2026-10-14T19:00", "18:30 con cierre a las 22:00: hoy a las 19:00 (día del negocio, no el de UTC)");
ok(proximaHoraDisponible(ahora("21:30"), ZONA, abre("09:00", "23:00")) === "2026-10-14T22:00", "21:30 con cierre a las 23:00: hoy a las 22:00");
console.log("── Salta las horas ya ocupadas de quien atiende (QA S27)");
const cita = (de, a, dia = 14) => ({ inicio: new Date(Date.UTC(2026, 9, dia, Number(de.slice(0, 2)) + 6, Number(de.slice(3)))).toISOString(), fin: new Date(Date.UTC(2026, 9, dia, Number(a.slice(0, 2)) + 6, Number(a.slice(3)))).toISOString() });
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:00", "19:00"), 14, undefined, [cita("13:30", "14:30")]) === "2026-10-14T14:30", "13:30 ocupada hasta las 14:30: propone las 14:30");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:00", "19:00"), 14, undefined, [cita("14:00", "15:00")], 60) === "2026-10-14T15:00", "servicio de 60 min no cabe a las 13:30 antes de una cita a las 14:00");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:00", "19:00"), 14, undefined, [cita("14:00", "15:00")], 30) === "2026-10-14T13:30", "de 30 min sí cabe a las 13:30");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:00", "19:00"), 14, undefined, [cita("13:30", "19:00")]) === "2026-10-15T09:00", "tarde llena: mañana a la apertura");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:00", "19:00"), 14, "2026-10-26", [cita("09:00", "10:00", 26)]) === "2026-10-26T10:00", "día pedido con la primera hora ocupada: la siguiente libre");
console.log(fallos ? `\nHALLAZGOS: ${fallos}` : "\n✔ Sin hallazgos.");
process.exit(fallos ? 1 : 0);
