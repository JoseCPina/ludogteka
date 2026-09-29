import { NextResponse, type NextRequest } from "next/server";
import { configWhatsApp, construirSoporte, igualSeguro } from "@/lib/whatsapp/infra";
import { ticketsBandeja } from "@/lib/soporte/bandeja";
import { procesarUpdate } from "@/lib/whatsapp/soporte";

/**
 * Webhook del bot de Telegram de PeluDesk: la bandeja del operador del
 * WhatsApp. Solo en el dominio de la plataforma
 * (https://peludesk.mx/api/telegram/webhook).
 *
 * Se valida el secret_token del encabezado (lo único que impide que
 * cualquiera mande updates falsos) y solo cuenta el chat vinculado con el
 * código de un solo uso (scripts/whatsapp/telegram.mjs). Siempre 200 una vez
 * validado: un 500 hace que Telegram reintente el mismo update y duplicar un
 * mensaje al cliente es peor que perder un aviso.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!igualSeguro(request.headers.get("x-telegram-bot-api-secret-token"), configWhatsApp().telegramSecreto)) {
    return NextResponse.json({ error: "secret_token inválido" }, { status: 401 });
  }
  const { deps } = construirSoporte();
  deps.tickets = ticketsBandeja();
  try {
    const resultado = await procesarUpdate(await request.json(), deps);
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    console.error("[telegram] error", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false });
  }
}
