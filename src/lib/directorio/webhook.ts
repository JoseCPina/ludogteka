import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * El webhook del bot recibe «RECLAMO ABC123» de quien reclama su ficha del directorio: la base verifica que el código
 * exista, esté pendiente y venga del mismo teléfono que lo pidió (prospecto_reclamo_verificar). Devuelve qué
 * contestarle, o null si el mensaje no es un reclamo (y el bot sigue como siempre). Nunca lanza.
 */
export const PATRON_RECLAMO = /\bRECLAMO\s*[:\-]?\s*([A-Za-z0-9]{6})\b/i;

export type RespuestaReclamo = { texto: string; verificado: boolean; prospectoId?: string };

export async function atenderReclamo(telefono: string, texto: string | null | undefined): Promise<RespuestaReclamo | null> {
  const m = PATRON_RECLAMO.exec(texto ?? "");
  if (!m) return null;
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("prospecto_reclamo_verificar", { p_telefono: telefono, p_codigo: m[1].toUpperCase() });
    if (error) throw new Error(error.message);
    const r = data as { ok?: boolean; motivo?: string; nombre?: string; prospecto_id?: string } | null;
    if (!r) return { texto: "No encontramos ese código o ya venció. Vuelve a la ficha de tu negocio en peludesk.mx/directorio y pide uno nuevo.", verificado: false };
    if (!r.ok) {
      return { texto: r.motivo === "otro_telefono" ? "Ese código se pidió con otro número de WhatsApp. Mándalo desde el número que escribiste en la página, o pide uno nuevo con este." : "No pudimos verificar ese código. Pide uno nuevo en la ficha de tu negocio.", verificado: false };
    }
    return { texto: `Listo: verificamos que ${r.nombre} es tuyo. Regresa a la página donde pediste el código: ahí ya puedes abrir tu prueba gratis con tu ficha convertida en tu página web.`, verificado: true, prospectoId: r.prospecto_id };
  } catch (e) {
    console.error("[directorio] reclamo webhook", e instanceof Error ? e.message : e);
    return { texto: "No pudimos verificar tu código en este momento. Intenta de nuevo en un minuto.", verificado: false };
  }
}
