// Pruebas puras (sin base) del aviso de «fuera de horario» de una cita. node scripts/auditoria/aviso-horario.mjs
import { avisosDeHorario, horaCorta } from "../../src/lib/estetica/aviso-horario.ts";

let mal = 0;
const comprobar = (c, t) => { console.log(`${c ? "  ✔" : "  ✘"} ${t}`); if (!c) mal++; };
const L = { apertura: "09:00:00", cierre: "19:00:00" };
const H = { 0: null, 1: L, 2: L, 3: L, 4: L, 5: L, 6: { apertura: "10:00", cierre: "14:00" } };
const lunes = "2026-10-19", sabado = "2026-10-24", domingo = "2026-10-25";

comprobar(horaCorta(20 * 60 + 30) === "8:30 p.m." && horaCorta(9 * 60) === "9:00 a.m." && horaCorta(0) === "12:00 a.m." && horaCorta(12 * 60) === "12:00 p.m.", "horaCorta: 8:30 p.m., 9:00 a.m., medianoche y mediodía");
comprobar(avisosDeHorario(lunes, "10:00", 60, H).length === 0, "dentro del horario: sin aviso");
comprobar(avisosDeHorario(lunes, "18:00", 60, H).length === 0, "termina justo al cierre: sin aviso");
const t = avisosDeHorario(lunes, "18:30", 120, H);
comprobar(t.length === 1 && t[0] === "Termina a las 8:30 p.m., después del cierre de las 7:00 p.m.", `termina después del cierre: «${t[0]}»`);
const a = avisosDeHorario(lunes, "08:00", 60, H);
comprobar(a.length === 1 && a[0] === "Empieza a las 8:00 a.m., antes de la apertura de las 9:00 a.m.", `empieza antes de abrir: «${a[0]}»`);
const c = avisosDeHorario(lunes, "20:00", 60, H);
comprobar(c.length === 1 && c[0] === "Empieza a las 8:00 p.m., después del cierre de las 7:00 p.m.", `empieza después del cierre: «${c[0]}»`);
const dos = avisosDeHorario(lunes, "08:00", 12 * 60, H);
comprobar(dos.length === 2, "antes de abrir y termina después del cierre: dos avisos");
comprobar(avisosDeHorario(sabado, "13:00", 60, H).length === 0 && avisosDeHorario(sabado, "13:30", 60, H)[0] === "Termina a las 2:30 p.m., después del cierre de las 2:00 p.m.", "usa el horario del sábado (10 a 14)");
comprobar(avisosDeHorario(domingo, "10:00", 60, H)[0] === "Ese día el negocio no abre.", "día cerrado");
comprobar(avisosDeHorario(lunes, "18:30", 120, null).length === 0 && avisosDeHorario("", "18:30", 120, H).length === 0 && avisosDeHorario(lunes, "", 120, H).length === 0 && avisosDeHorario(lunes, "18:30", 0, H).length === 0, "sin horario capturado o sin datos completos: sin aviso");
console.log(mal ? `\n${mal} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(mal ? 1 : 0);
