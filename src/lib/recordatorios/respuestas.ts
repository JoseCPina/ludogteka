import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { leerPayload, type AccionRecordatorio } from "./plantillas";
import { reportarExcedentesPendientes } from "./stripe";

/**
 * Lo que contesta el cliente de un negocio a un recordatorio (lo llama el webhook de WhatsApp ANTES del bot):
 *
 * - Un botón de la plantilla llega con su payload `rec:<id>:<acción>`: «Confirmo» confirma la cita, «Necesito
 *   cambiarla» y «Agendar» le dejan el aviso al negocio en su panel, «Después» solo se anota. Solo cuenta si quien
 *   contesta es el teléfono al que se mandó (lo comprueba la base).
 * - Cualquier otro texto de quien recibió un recordatorio en los últimos 7 días se le pasa a ESE negocio como mensaje
 *   entrante (nunca al bot de ventas: a un cliente de un negocio no se le ofrece PeluDesk); BAJA lo da de baja de los
 *   recordatorios de ese negocio.
 * - Quien no recibió ninguno sigue con el bot de siempre (la clasificación cliente/prospecto no cambia).
 *
 * Los textos que salen son fijos (sin IA).
 */
export type Atencion = { manejado: false } | { manejado: true; respuesta: string | null };

export function textoDeAccion(accion: AccionRecordatorio, negocio: string): string {
  switch (accion) {
    case "confirmo":
      return `¡Gracias! Le avisamos a ${negocio} que confirmas. ¡Te esperan!`;
    case "pide_cambio":
      return `Listo, le avisamos a ${negocio} que necesitas cambiarla. Te escriben para reagendar.`;
    case "agendar":
      return `Le pasamos tu solicitud a ${negocio}. Te escriben para darte día y hora.`;
    case "despues":
      return `Va, sin problema. Cuando quieras agendar, escríbele a ${negocio}.`;
  }
}

export const textoBaja = (negocio: string) => `Listo, ya no te mandaremos recordatorios de ${negocio}. Si cambias de opinión, pídeselo a ${negocio}.`;
export const textoReenviado = (negocio: string) =>
  `Este número solo manda los recordatorios de ${negocio}. Ya le pasamos tu mensaje y te contestan por WhatsApp desde su número.`;

/** Un botón de recordatorio. null si el payload no es de un recordatorio. */
export async function atenderBoton(payload: string | null | undefined, telefono: string): Promise<Atencion> {
  const p = leerPayload(payload);
  if (!p) return { manejado: false };
  const { data, error } = await createSupabaseAdminClient().rpc("recordatorio_responder", { p_id: p.id, p_accion: p.accion, p_telefono: telefono });
  if (error) {
    console.error("[recordatorios] responder", error.message);
    // Es la respuesta a un recordatorio aunque no se pudo guardar: el bot no la atiende.
    return { manejado: true, respuesta: null };
  }
  const r = data as { negocio?: string } | null;
  if (!r?.negocio) return { manejado: true, respuesta: null };
  return { manejado: true, respuesta: textoDeAccion(p.accion, r.negocio) };
}

/** Texto libre de quien recibió un recordatorio hace poco (o BAJA). */
export async function atenderTexto(texto: string, telefono: string, esBaja: boolean): Promise<Atencion> {
  const { data, error } = await createSupabaseAdminClient().rpc("recordatorio_texto_entrante", { p_telefono: telefono, p_texto: texto, p_baja: esBaja });
  if (error) {
    console.error("[recordatorios] texto entrante", error.message);
    return { manejado: false };
  }
  const r = data as { negocio?: string; baja?: boolean; acuse?: boolean } | null;
  if (!r?.negocio) return { manejado: false };
  if (r.baja) return { manejado: true, respuesta: textoBaja(r.negocio) };
  return { manejado: true, respuesta: r.acuse ? textoReenviado(r.negocio) : null };
}

/** El estado de entrega de un recordatorio (del webhook): cuenta el mensaje cobrable y reporta el excedente. */
export async function guardarEntregaRecordatorio(s: {
  id?: string;
  status?: string;
  timestamp?: string;
  pricing?: { billable?: boolean };
  motivo?: string | null;
}): Promise<{ excedente: boolean } | null> {
  const estado = s.status === "sent" ? "enviado" : s.status === "delivered" ? "entregado" : s.status === "read" ? "leido" : s.status === "failed" ? "fallido" : null;
  if (!s.id || !estado) return null;
  const ts = Number(s.timestamp);
  const { data, error } = await createSupabaseAdminClient().rpc("recordatorio_entrega", {
    p_wa_id: s.id,
    p_estado: estado,
    p_cobrable: typeof s.pricing?.billable === "boolean" ? s.pricing.billable : null,
    p_ts: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
    p_motivo: s.motivo ?? null,
  });
  if (error) throw new Error(`recordatorio_entrega: ${error.message}`);
  const r = data as { excedente?: boolean } | null;
  return r ? { excedente: Boolean(r.excedente) } : null;
}

/** Después de un excedente, se reporta a Stripe en ese momento (si falla, la tarea lo reintenta). */
export async function reportarSiHayExcedente(huboExcedente: boolean): Promise<void> {
  if (!huboExcedente) return;
  await reportarExcedentesPendientes().catch((e) => console.error("[recordatorios] stripe", e instanceof Error ? e.message : e));
}
