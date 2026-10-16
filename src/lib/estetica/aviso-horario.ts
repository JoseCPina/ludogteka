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
