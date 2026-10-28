"use server";

import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import { avisarWhatsAppRespuesta, proponerArticulo } from "@/lib/soporte/notificar";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

// PeluDesk contesta tickets. Con la sesión de la administración: la base
// comprueba es_admin_plataforma() (plataforma_*).
const NO = { error: "Tu sesión de administración de PeluDesk terminó. Vuelve a entrar." };

type Datos = { negocio_id: string; profile_id: string; rol: string; numero: number; asunto: string; sin_documentar?: boolean };

export async function responderComoPeluDesk(
  ticketId: string,
  texto: string
): Promise<{ error: string | null; aviso?: string; registros?: RegistroFinal[] }> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO.error };
  if (!texto.trim()) return { error: "Escribe la respuesta." };
  const { data, error } = await s.supabase.rpc("plataforma_responder_ticket", { p_ticket_id: ticketId, p_texto: texto.trim(), p_origen: "plataforma" });
  if (error) return { error: error.message };
  const d = data as Datos;
  const wa = await avisarWhatsAppRespuesta({ ticketId, negocioId: d.negocio_id, profileId: d.profile_id, rol: d.rol, numero: d.numero, asunto: d.asunto, texto: texto.trim() });
  revalidatePath(`/plataforma/soporte/${ticketId}`);
  revalidatePath("/plataforma/soporte");
  // El ticket es del negocio: la sesión de la plataforma no lo lee; va lo que la respuesta le cambió.
  return {
    error: null,
    aviso: AVISO_WA[wa],
    registros: await registrosDe(s.supabase, [
      { t: "soporte_tickets", i: ticketId, datos: { id: ticketId, ultimo_de: "plataforma", ultimo_mensaje_at: new Date().toISOString() } },
    ]),
  };
}

const AVISO_WA: Record<string, string> = {
  whatsapp: "Le llegó también por WhatsApp.",
  plantilla: "Pasaron más de 24 h desde que escribió por WhatsApp: le llegó la plantilla de seguimiento.",
  no_aplica: "Lo ve en la app (no es admin o su cuenta no es de teléfono).",
  fallo: "Lo ve en la app; el WhatsApp no salió (revisa los logs).",
};

export async function cambiarEstadoTicket(
  ticketId: string,
  estado: "abierto" | "en_proceso" | "resuelto"
): Promise<{ error: string | null; aviso?: string; registros?: RegistroFinal[] }> {
  const s = await sesionPlataforma();
  if (!s) return { error: NO.error };
  const { data, error } = await s.supabase.rpc("plataforma_estado_ticket", { p_ticket_id: ticketId, p_estado: estado });
  if (error) return { error: error.message };
  const d = data as Datos;
  let aviso: string | undefined;
  if (estado === "resuelto") {
    const wa = await avisarWhatsAppRespuesta({
      ticketId,
      negocioId: d.negocio_id,
      profileId: d.profile_id,
      rol: d.rol,
      numero: d.numero,
      asunto: d.asunto,
      texto: "Lo dimos por resuelto. Si sigue pasando, contéstanos en el ticket y lo reabrimos.",
      resuelto: true,
    });
    aviso = AVISO_WA[wa];
    // Lo que no estaba documentado: la propuesta del artículo nuevo.
    if (d.sin_documentar) await generarPropuesta(ticketId);
  }
  revalidatePath(`/plataforma/soporte/${ticketId}`);
  revalidatePath("/plataforma/soporte");
  return { error: null, aviso, registros: await registrosDe(s.supabase, [{ t: "soporte_tickets", i: ticketId, datos: { id: ticketId, estado } }]) };
}

async function generarPropuesta(ticketId: string) {
  const s = await sesionPlataforma();
  if (!s) return;
  const { data } = await s.supabase.rpc("plataforma_ticket", { p_ticket_id: ticketId });
  const t = data as { ticket: { asunto: string; pantalla: string | null }; mensajes: { autor: string; texto: string }[] } | null;
  if (!t) return;
  const propuesta = await proponerArticulo({ asunto: t.ticket.asunto, pantalla: t.ticket.pantalla, mensajes: t.mensajes });
  await s.supabase.rpc("plataforma_articulo_propuesto", { p_ticket_id: ticketId, p_texto: propuesta });
}

export async function proponerArticuloDeTicket(ticketId: string): Promise<{ error: string | null }> {
  const s = await sesionPlataforma();
  if (!s) return NO;
  await generarPropuesta(ticketId);
  revalidatePath(`/plataforma/soporte/${ticketId}`);
  return { error: null };
}
