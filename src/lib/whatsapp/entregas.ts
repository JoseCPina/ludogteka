import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Estado de entrega de cada mensaje de WhatsApp que manda PeluDesk. Meta responde «aceptado» (un wamid) en el
 * envío y avisa después, por el webhook, si quedó enviado, entregado, leído o fallido (con un código). Aquí vive
 * el contexto de cada envío y el motivo en palabras claras de cada código.
 */
export type OrigenEnvio = "recordatorio" | "carnet_recordatorio" | "teleconsulta" | "seguimiento" | "soporte" | "bot" | "desconocido";

export type ContextoEnvio = {
  origen: OrigenEnvio;
  negocioId?: string | null;
  refId?: string | null;
  /** «Recordatorio de vacuna de Firulais»: lo que lee el personal en «Necesita atención». */
  etiqueta?: string;
  /** Dónde se resuelve (ruta de la app del negocio). */
  href?: string;
};

export type EstadoMeta = {
  id?: string;
  status?: string;
  timestamp?: string;
  /** Si Meta lo cobra (pricing.billable): un mensaje dentro de una ventana gratis llega con false. */
  pricing?: { billable?: boolean; category?: string; type?: string };
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] };

/** El motivo, sin jerga, de los códigos de error de Meta que ya vimos o que esperamos. */
export function motivoDeError(codigo: number | null | undefined, titulo?: string | null): string {
  switch (codigo) {
    case 131042:
    case 141006:
      return "Meta no deja mandar mensajes desde el número de PeluDesk porque la cuenta de WhatsApp Business tiene un problema con su método de pago. No es culpa del dueño ni de su número: PeluDesk ya fue avisado. Mándalo tú por WhatsApp mientras se resuelve.";
    case 131026:
      return "El número del dueño no pudo recibir el mensaje: no tiene WhatsApp, lo tiene desactualizado o no ha aceptado sus condiciones. Revisa el teléfono en su ficha o llámale.";
    case 131047:
      return "Pasaron más de 24 horas desde que el dueño escribió por última vez y ese tipo de mensaje ya no se puede mandar solo. Mándalo tú por WhatsApp.";
    case 131049:
      return "Meta decidió no entregar el mensaje para no saturar a esa persona. No se puede forzar: mándalo tú por WhatsApp.";
    case 131048:
      return "Meta limitó los mensajes de PeluDesk por exceso de reportes. PeluDesk ya fue avisado; mándalo tú por WhatsApp.";
    case 131053:
      return "Meta no pudo cargar la imagen o el archivo del mensaje.";
    case 131000:
    case 130429:
    case 131056:
      return "Meta tuvo un problema temporal o recibió demasiados mensajes seguidos. Intenta de nuevo en unos minutos.";
    case 132000:
    case 132001:
    case 132005:
    case 132007:
    case 132012:
    case 132015:
    case 132016:
      return "La plantilla del mensaje no coincide con lo que Meta tiene aprobado. PeluDesk ya fue avisado; mándalo tú por WhatsApp.";
    case 133010:
    case 133004:
    case 133005:
      return "El número de PeluDesk no está disponible en este momento. PeluDesk ya fue avisado; mándalo tú por WhatsApp.";
    default:
      return `Meta no pudo entregar el mensaje${titulo ? ` («${titulo}»)` : ""}${codigo ? `, código ${codigo}` : ""}. Mándalo tú por WhatsApp.`;
  }
}

/** Un fallo de la cuenta (no del destinatario): el operador de PeluDesk debe enterarse. */
export function esFalloDeCuenta(codigo: number | null | undefined): boolean {
  return codigo === 131042 || codigo === 141006 || codigo === 131048 || codigo === 133010 || codigo === 133004 || codigo === 133005;
}

/**
 * Anota un mensaje que Meta aceptó. Nunca rompe el envío: si no se pudo anotar, solo queda en el log.
 * Del teléfono solo se guardan los últimos cuatro dígitos.
 */
export async function registrarEnvio(e: { id?: string; tipo: string; telefono: string; contexto?: ContextoEnvio }): Promise<void> {
  if (!e.id) return;
  try {
    const c = e.contexto;
    const { error } = await createSupabaseAdminClient().rpc("wa_entrega_registrar", {
      p_wa_id: e.id,
      p_tipo: e.tipo,
      p_origen: c?.origen ?? "bot",
      p_negocio: c?.negocioId ?? null,
      p_ref: c?.refId ?? null,
      p_etiqueta: c?.etiqueta ?? null,
      p_href: c?.href ?? null,
      p_ult4: e.telefono,
    });
    if (error) console.error("[whatsapp] no se anotó el envío", error.message);
  } catch (err) {
    console.error("[whatsapp] no se anotó el envío", err instanceof Error ? err.message : err);
  }
}

const ESTADOS: Record<string, "enviado" | "entregado" | "leido" | "fallido"> = { sent: "enviado", delivered: "entregado", read: "leido", failed: "fallido" };

/** Guarda un aviso de estado de Meta. Devuelve si hay que avisar al operador (primer fallo de ese tipo en 6 h). */
export async function guardarEstado(s: EstadoMeta): Promise<{ avisar: boolean; origen?: string; etiqueta?: string | null; codigo?: number | null; motivo?: string; negocio?: string | null } | null> {
  const estado = s.status ? ESTADOS[s.status] : undefined;
  if (!s.id || !estado) return null;
  const err = s.errors?.[0];
  const ts = Number(s.timestamp);
  const motivo = estado === "fallido" ? motivoDeError(err?.code, err?.title) : null;
  const { data, error } = await createSupabaseAdminClient().rpc("wa_entrega_estado", {
    p_wa_id: s.id,
    p_estado: estado,
    p_ts: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
    p_codigo: err?.code ?? null,
    p_titulo: err?.title ?? null,
    p_detalle: err?.error_data?.details ?? err?.message ?? null,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);
  const r = data as { avisar?: boolean; origen?: string; etiqueta?: string | null; negocio?: string | null };
  return { avisar: Boolean(r.avisar), origen: r.origen, etiqueta: r.etiqueta, codigo: err?.code ?? null, motivo: motivo ?? undefined, negocio: r.negocio };
}
