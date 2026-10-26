// Aviso (no bloqueo) de una cita fuera del horario del negocio, ANTES de guardarla (QA externa B20). La etiqueta
// «Fuera de horario» de la cita ya guardada la pone la base; esto le dice a quien agenda, mientras escribe, que la
// hora o la duración se pasan del horario de ese día de la semana. Se puede guardar igual.

/** Horario de cada día de la semana (0 = domingo): null = ese día no abre. */
export type HorarioSemana = Record<number, { apertura: string; cierre: string } | null>;

/** "HH:MM[:SS]" → minutos desde la medianoche. */
function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 20:30 → «8:30 p.m.», 9:00 → «9:00 a.m.». */
export function horaCorta(min: number): string {
  const total = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
}

export function diaDeLaSemana(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * @param fecha AAAA-MM-DD, @param hora HH:MM (hora del negocio), @param duracionMin duración de la cita.
 * @returns un texto por cada cosa que se sale del horario (vacío si todo cabe o falta algún dato).
 */
export function avisosDeHorario(
  fecha: string,
  hora: string,
  duracionMin: number,
  horario: HorarioSemana | null | undefined
): string[] {
  if (!horario || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{1,2}:\d{2}/.test(hora) || !(duracionMin > 0)) return [];
  const dia = horario[diaDeLaSemana(fecha)];
  if (dia === undefined) return [];
  if (dia === null) return ["Ese día el negocio no abre."];
  const abre = minutos(dia.apertura);
  const cierra = minutos(dia.cierre);
  const inicio = minutos(hora);
  const fin = inicio + duracionMin;
  const avisos: string[] = [];
  if (inicio < abre) avisos.push(`Empieza a las ${horaCorta(inicio)}, antes de la apertura de las ${horaCorta(abre)}`);
  if (inicio >= cierra) avisos.push(`Empieza a las ${horaCorta(inicio)}, después del cierre de las ${horaCorta(cierra)}`);
  else if (fin > cierra) avisos.push(`Termina a las ${horaCorta(fin)}, después del cierre de las ${horaCorta(cierra)}`);
  return avisos;
}

// ── N128 (QA S36): el día elegido está cerrado o ya pasó su cierre. El formulario abre EN ese día (nunca cambia la
// fecha en silencio), con «Fuera de horario: el negocio está cerrado ese día» y la propuesta del siguiente horario
// abierto («Te propongo el lunes 26 a las 09:30»). La misma utilería para Estética, Veterinaria, Hotel y Guardería.

/** El día de hoy del negocio y los minutos de la hora actual (de su zona). */
export type Ahora = { hoy: string; minutos: number };

/** La siguiente fecha u hora abierta que se le propone a quien agenda. `para` = el día elegido para el que se calculó. */
export type PropuestaHorario = { para: string; fecha: string; hora: string | null };

/** Por qué ese día no sirve: cerrado según el horario, o es hoy y ya pasó el cierre. null = el día sirve (o no hay horario). */
export function motivoDiaNoDisponible(fecha: string, horario: HorarioSemana | null | undefined, ahora: Ahora): "cerrado" | "ya_cerro" | null {
  if (!horario || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const dia = horario[diaDeLaSemana(fecha)];
  if (dia === undefined) return null;
  if (dia === null) return "cerrado";
  if (fecha === ahora.hoy && ahora.minutos >= minutos(dia.cierre)) return "ya_cerro";
  return null;
}

function sumarDia(fecha: string, n: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * El siguiente horario abierto desde `fecha` (ese mismo día si todavía le queda tiempo): la apertura, o en hoy la
 * siguiente media hora. Con `conHora` en false propone solo el día (hotel y guardería). null si no abre en 14 días.
 */
export function siguienteHorarioAbierto(fecha: string, horario: HorarioSemana | null | undefined, ahora: Ahora, conHora = true, duracionMin = 0): PropuestaHorario | null {
  if (!horario || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  for (let i = 0; i <= 14; i++) {
    const f = sumarDia(fecha < ahora.hoy ? ahora.hoy : fecha, i);
    const dia = horario[diaDeLaSemana(f)];
    if (!dia) continue;
    let inicio = minutos(dia.apertura);
    if (f === ahora.hoy) inicio = Math.max(inicio, Math.ceil((ahora.minutos + 1) / 30) * 30);
    if (inicio >= minutos(dia.cierre) || inicio + duracionMin > minutos(dia.cierre)) continue;
    return { para: fecha, fecha: f, hora: conHora ? hhmm(inicio) : null };
  }
  return null;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «Te propongo el lunes 26 a las 09:30» (sin hora: «Te propongo el lunes 26»). */
export function textoPropuesta(p: { fecha: string; hora: string | null }): string {
  const dia = Number(p.fecha.slice(8, 10));
  return `Te propongo el ${DIAS[diaDeLaSemana(p.fecha)]} ${dia}${p.hora ? ` a las ${p.hora.slice(0, 5)}` : ""}`;
}
