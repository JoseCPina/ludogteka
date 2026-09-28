"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";
import { urlPlataforma } from "@/lib/pagos/urls";
import { configWhatsApp, DatosSupabase, TelegramHttp } from "@/lib/whatsapp/infra";

const NO_AUTORIZADO: ResultadoPlataforma = { error: "Solo la administración de PeluDesk." };

/**
 * Apunta el bot de Telegram a https://peludesk.mx/api/telegram/webhook con
 * su secret_token. Lo hace el servidor (que sí llega a Telegram), después de
 * comprobar la sesión de la plataforma.
 */
export async function conectarWebhookTelegram(): Promise<ResultadoPlataforma> {
  if (!(await sesionPlataforma())) return NO_AUTORIZADO;
  const cfg = configWhatsApp();
  if (!cfg.telegramToken) return { error: "Falta TELEGRAM_BOT_TOKEN en las variables de Vercel." };
  const r = await new TelegramHttp(cfg.telegramToken).llamar("setWebhook", {
    url: `${urlPlataforma()}/api/telegram/webhook`,
    secret_token: cfg.telegramSecreto,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: true,
  });
  if (!r.ok) return { error: `Telegram no lo aceptó: ${r.descripcion ?? "sin detalle"}` };
  revalidatePath("/plataforma/whatsapp");
  return { error: null, exito: "Listo: Telegram manda los mensajes del bot a PeluDesk." };
}

/**
 * La bandeja del operador NO es "el primero que escriba /start" (el bot es
 * público): es quien abra este link, con un código de un solo uso. Se
 * guarda en wa_config con la secret key después de comprobar la sesión.
 */
export async function linkVincularTelegram(): Promise<ResultadoPlataforma> {
  if (!(await sesionPlataforma())) return NO_AUTORIZADO;
  const cfg = configWhatsApp();
  if (!cfg.telegramToken) return { error: "Falta TELEGRAM_BOT_TOKEN en las variables de Vercel." };
  const yo = await new TelegramHttp(cfg.telegramToken).llamar("getMe");
  const usuario = (yo.resultado as { username?: string } | null)?.username;
  if (!yo.ok || !usuario) return { error: `No pude leer el bot de Telegram: ${yo.descripcion ?? "sin detalle"}` };
  const codigo = randomBytes(18).toString("base64url");
  await new DatosSupabase().guardarConfig("telegram_codigo_inicio", codigo);
  return { error: null, exito: "Ábrelo en el Telegram donde quieres recibir los mensajes y dale Iniciar.", link: `https://t.me/${usuario}?start=${codigo}`, etiquetaLink: "Link para vincular tu Telegram (un solo uso)" };
}

/**
 * La foto del bot de Telegram = la del WhatsApp de PeluDesk
 * (public/marca/peludesk/perfil-640.jpg). Telegram solo la acepta subida
 * como archivo nuevo, así que el servidor la baja de su propio sitio y la
 * manda multipart. Va aquí porque la red de la nube no llega a Telegram.
 */
export async function ponerFotoBotTelegram(): Promise<ResultadoPlataforma> {
  if (!(await sesionPlataforma())) return NO_AUTORIZADO;
  const cfg = configWhatsApp();
  if (!cfg.telegramToken) return { error: "Falta TELEGRAM_BOT_TOKEN en las variables de Vercel." };
  const r = await new TelegramHttp(cfg.telegramToken).subirFotoPerfil(`${urlPlataforma()}/marca/peludesk/perfil-640.jpg`);
  if (!r.ok) return { error: `Telegram no la aceptó: ${r.descripcion ?? "sin detalle"}. Se puede poner a mano con @BotFather → /setuserpic.` };
  return { error: null, exito: "Listo: el bot de Telegram ya tiene la foto de PeluDesk." };
}
