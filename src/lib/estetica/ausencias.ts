// Ausencias aprobadas que tocan la agenda de estética. Las reglas las decide la base
// (ausencia_que_choca / ausencia_cubre); aquí solo se dicen en palabras.
import { formatearFechaCalendario } from "@/lib/formato";

export type AusenciaCorta = {
  tipo: string;
  desde: string;
  hasta: string;
  hora_desde: string | null;
  hora_hasta: string | null;
};

const TIPO: Record<string, string> = {
  vacaciones: "Vacaciones",
  incapacidad: "Incapacidad",
  dia_personal: "Día personal",
  falta_justificada: "Falta justificada",
};

const hhmm = (h: string | null) => (h ?? "").slice(0, 5);

/** «Vacaciones del 20 al 24 de octubre» / «Día personal el 20 de 09:00 a 13:00». */
export function textoAusencia(a: AusenciaCorta): string {
  const tipo = TIPO[a.tipo] ?? a.tipo;
  if (a.hora_desde) return `${tipo} el ${formatearFechaCalendario(a.desde)}, de ${hhmm(a.hora_desde)} a ${hhmm(a.hora_hasta)}`;
  if (a.desde === a.hasta) return `${tipo} el ${formatearFechaCalendario(a.desde)}`;
  return `${tipo} del ${formatearFechaCalendario(a.desde)} al ${formatearFechaCalendario(a.hasta)}`;
}

export type CitaEnAusencia = {
  cita_id: string;
  inicio: string;
  fin: string;
  estado: string;
  perro: string;
  servicio: string;
  empleado_id: string;
  empleado_nombre: string;
  ausencia_id: string;
  ausencia_tipo: string;
  desde: string;
  hasta: string;
  hora_desde: string | null;
  hora_hasta: string | null;
};

export function textoDeCitaEnAusencia(c: CitaEnAusencia): string {
  return textoAusencia({ tipo: c.ausencia_tipo, desde: c.desde, hasta: c.hasta, hora_desde: c.hora_desde, hora_hasta: c.hora_hasta });
}
