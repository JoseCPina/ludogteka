import type { TonoChip } from "@/components/ui/chip";
import { fechaLocalDeInstante } from "@/lib/formato";
import type { AccionRecordatorio, TipoRecordatorio } from "./plantillas";

/**
 * Cómo se ve el recordatorio de una cita en la agenda, la ficha y la bandeja (sin imports de servidor).
 * La respuesta del cliente manda sobre el estado de entrega: «Confirmó por WhatsApp» en verde, «Pide cambio» en ámbar.
 */
export function estadoDeRecordatorio(estado: string, respuesta: AccionRecordatorio | null | undefined): { texto: string; tono: TonoChip } {
  if (respuesta === "confirmo") return { texto: "Confirmó por WhatsApp", tono: "exito" };
  if (respuesta === "pide_cambio") return { texto: "Pide cambio", tono: "proceso" };
  switch (estado) {
    case "programado":
      return { texto: "Recordatorio programado", tono: "neutro" };
    case "pausado":
      return { texto: "Recordatorio en pausa", tono: "proceso" };
    case "enviando":
    case "enviado":
      return { texto: "Recordatorio enviado", tono: "info" };
    case "entregado":
      return { texto: "Recordatorio entregado", tono: "info" };
    case "leido":
      return { texto: "Recordatorio leído", tono: "info" };
    case "fallido":
      return { texto: "El recordatorio no llegó", tono: "pendiente" };
    case "omitido":
      return { texto: "Recordatorio no enviado", tono: "neutro" };
    default:
      return { texto: "Recordatorio cancelado", tono: "neutro" };
  }
}

/** Dónde se ve la cita o la reserva de un recordatorio. */
export function hrefDeRecordatorio(tipo: TipoRecordatorio, refId: string, paraAt: string, zona: string): string {
  switch (tipo) {
    case "estetica":
    case "listo":
      return `/estetica/${refId}`;
    case "veterinaria":
      return `/veterinaria/agenda?vista=dia&fecha=${fechaLocalDeInstante(paraAt, zona)}`;
    case "llegada":
      return `/reservas/${refId}`;
    case "vacuna":
      return "/veterinaria/recordatorios";
  }
}

export type RecordatorioDeCita = { ref_id: string; estado: string; respuesta: AccionRecordatorio | null; tipo: TipoRecordatorio; para_at: string; enviado_at: string | null };

/** El recordatorio más reciente de cada cita (para la agenda): por ref_id. */
export function ultimoPorCita(filas: RecordatorioDeCita[]): Map<string, RecordatorioDeCita> {
  const m = new Map<string, RecordatorioDeCita>();
  for (const f of filas) {
    if (f.tipo === "listo") continue;
    const ya = m.get(f.ref_id);
    if (!ya || (f.enviado_at ?? "") > (ya.enviado_at ?? "")) m.set(f.ref_id, f);
  }
  return m;
}
