import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TicketsBandeja } from "@/lib/whatsapp/soporte";
import { avisarWhatsAppRespuesta, proponerArticulo } from "./notificar";

type Datos = { negocio_id: string; profile_id: string; rol: string; numero: number; asunto: string; sin_documentar?: boolean };

const AVISO: Record<string, string> = {
  whatsapp: "También le llegó por WhatsApp.",
  plantilla: "Por WhatsApp le llegó la plantilla de seguimiento (más de 24 h sin escribir).",
  no_aplica: "Lo ve en la app.",
  fallo: "Lo ve en la app; el WhatsApp no salió.",
};

/**
 * Los tickets desde la bandeja de Telegram: el servidor con service_role
 * (las funciones plataforma_* lo aceptan igual que a la administración).
 * El ticket sale del mensaje al que se respondió, nunca de lo que se escribió.
 */
export function ticketsBandeja(): TicketsBandeja {
  const sb = createSupabaseAdminClient();
  return {
    async porMensaje(messageId) {
      const { data: id } = await sb.rpc("plataforma_ticket_de_telegram", { p_message_id: messageId });
      if (!id) return null;
      const { data } = await sb.rpc("plataforma_ticket", { p_ticket_id: id });
      const t = (data as { ticket?: { numero: number } } | null)?.ticket;
      return t ? { id: id as string, numero: t.numero } : null;
    },
    async responder(ticketId, texto) {
      const { data, error } = await sb.rpc("plataforma_responder_ticket", { p_ticket_id: ticketId, p_texto: texto, p_origen: "telegram" });
      if (error) throw new Error(error.message);
      const d = data as Datos;
      return AVISO[await avisarWhatsAppRespuesta({ ticketId, negocioId: d.negocio_id, profileId: d.profile_id, rol: d.rol, numero: d.numero, asunto: d.asunto, texto })];
    },
    async estado(ticketId, estado) {
      const { data, error } = await sb.rpc("plataforma_estado_ticket", { p_ticket_id: ticketId, p_estado: estado });
      if (error) throw new Error(error.message);
      const d = data as Datos;
      if (estado !== "resuelto") return "";
      const aviso = AVISO[
        await avisarWhatsAppRespuesta({
          ticketId,
          negocioId: d.negocio_id,
          profileId: d.profile_id,
          rol: d.rol,
          numero: d.numero,
          asunto: d.asunto,
          texto: "Lo dimos por resuelto. Si sigue pasando, contéstanos en el ticket y lo reabrimos.",
          resuelto: true,
        })
      ];
      if (!d.sin_documentar) return aviso;
      const { data: det } = await sb.rpc("plataforma_ticket", { p_ticket_id: ticketId });
      const t = det as { ticket: { asunto: string; pantalla: string | null }; mensajes: { autor: string; texto: string }[] };
      await sb.rpc("plataforma_articulo_propuesto", { p_ticket_id: ticketId, p_texto: await proponerArticulo({ asunto: t.ticket.asunto, pantalla: t.ticket.pantalla, mensajes: t.mensajes }) });
      return `${aviso} No estaba documentado: la propuesta del artículo está en /plataforma/soporte/${ticketId}.`;
    },
  };
}
