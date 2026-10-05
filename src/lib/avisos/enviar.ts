import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DatosSupabase, TelegramHttp, configWhatsApp } from "@/lib/whatsapp/infra";
import { escaparHtml } from "@/lib/whatsapp/agente";

/**
 * Los avisos de PeluDesk para su bandeja de Telegram (la misma del bot y del
 * resumen diario). Telegram no se alcanza desde las sesiones de la nube
 * donde se trabaja: quien necesita avisar ENCOLA (plataforma_aviso_encolar,
 * solo service_role) y esta tarea (vercel.json, cada 5 minutos) los manda.
 * Cada aviso sale una vez; si Telegram falla, se reintenta (hasta 6 veces).
 */
export async function mandarAvisosPendientes(): Promise<{ enviados: number; fallidos: number; sinBandeja: boolean }> {
  const admin = createSupabaseAdminClient();
  const { data: avisos, error } = await admin.rpc("avisos_tomar", { p_limite: 10 });
  if (error) throw new Error(error.message);
  const lista = (avisos ?? []) as { id: string; texto: string }[];
  if (!lista.length) return { enviados: 0, fallidos: 0, sinBandeja: false };
  const chat = Number(await new DatosSupabase().config("telegram_chat_operador")) || null;
  const telegram = new TelegramHttp(configWhatsApp().telegramToken);
  let enviados = 0;
  let fallidos = 0;
  for (const a of lista) {
    if (!chat) {
      await admin.rpc("avisos_marcar", { p_id: a.id, p_ok: false, p_error: "No hay bandeja de Telegram vinculada." });
      fallidos++;
      continue;
    }
    const id = await telegram.enviar(chat, escaparHtml(a.texto));
    await admin.rpc("avisos_marcar", { p_id: a.id, p_ok: Boolean(id), p_error: id ? null : "Telegram no aceptó el mensaje." });
    if (id) enviados++;
    else fallidos++;
  }
  return { enviados, fallidos, sinBandeja: !chat };
}
