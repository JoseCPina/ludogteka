// «Agendar» propone la siguiente hora disponible (QA externa B19): nunca una hora que ya pasó.
//   node --experimental-strip-types scripts/auditoria/proxima-hora.mjs
import { proximaHoraDisponible } from "../../src/lib/estetica/proxima-hora.ts";

let fallos = 0;
const ok = (c, t) => { console.log(`  ${c ? "✔" : "✘"} ${t}`); if (!c) fallos++; };
const ZONA = "America/Mexico_City"; // UTC-6 todo el año desde 2022
const abre = (a, c) => () => ({ abre: true, apertura: a, cierre: c });
// Miércoles 14 de octubre de 2026, 13:05 hora del negocio = 19:05 UTC.
const ahora = (hhmmLocal) => { const [h, m] = hhmmLocal.split(":").map(Number); return new Date(Date.UTC(2026, 9, 14, h + 6, m)).toISOString(); };

console.log("── Siguiente hora disponible de hoy");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-14T14:00", "a las 13:05 propone las 14:00 (no las 10:00)");
ok(proximaHoraDisponible(ahora("13:00"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-14T14:00", "a las 13:00 en punto propone las 14:00");
ok(proximaHoraDisponible(ahora("07:30"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-14T09:00", "antes de abrir propone la apertura");
ok(proximaHoraDisponible(ahora("17:59"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-14T18:00", "la última hora antes del cierre todavía se propone");
console.log("── Si hoy ya no hay, la primera de mañana");
ok(proximaHoraDisponible(ahora("18:30"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-15T09:00", "a las 18:30 propone mañana a las 09:00");
ok(proximaHoraDisponible(ahora("21:00"), ZONA, abre("09:00:00", "19:00:00")) === "2026-10-15T09:00", "ya cerrado: mañana a las 09:00");
const sinSabado = (f) => (f === "2026-10-17" ? { abre: false, apertura: null, cierre: null } : { abre: true, apertura: "09:00", cierre: "19:00" });
ok(proximaHoraDisponible(ahora("20:00"), ZONA, (f) => (f === "2026-10-15" ? { abre: false, apertura: null, cierre: null } : { abre: true, apertura: "10:00", cierre: "14:00" })) === "2026-10-16T10:00", "salta el día que no abre");
ok(proximaHoraDisponible(ahora("12:00"), ZONA, (f) => sinSabado(f)) === "2026-10-14T13:00", "un día normal no se afecta");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, () => null) === "2026-10-14T14:00", "sin horario configurado usa 09:00 a 19:00");
ok(proximaHoraDisponible(ahora("13:05"), ZONA, abre("09:30:00", "19:00:00")) === "2026-10-14T14:00", "con apertura a las 9:30 sigue en horas en punto");
ok(proximaHoraDisponible(ahora("05:00"), ZONA, abre("09:30:00", "19:00:00")) === "2026-10-14T10:00", "apertura 9:30: la primera hora en punto posterior es las 10:00");
// Cambio de día en UTC: 20:30 locales ya es el día siguiente en UTC.
ok(proximaHoraDisponible(ahora("20:30"), ZONA, abre("09:00", "19:00")).startsWith("2026-10-15"), "usa el día del negocio, no el de UTC");
console.log(fallos ? `\nHALLAZGOS: ${fallos}` : "\n✔ Sin hallazgos.");
process.exit(fallos ? 1 : 0);
