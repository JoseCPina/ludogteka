import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { mandarAvisosPendientes } from "@/lib/avisos/enviar";

/**
 * Avisos de PeluDesk para su bandeja de Telegram (cola `avisos_operador`,
 * vercel.json → cada 5 minutos). Vercel manda `Authorization: Bearer
 * <CRON_SECRET>`; sin CRON_SECRET no corre. La respuesta no trae el texto de
 * los avisos: solo cuántos salieron.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const dado = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${secreto}`);
  return dado.length === esperado.length && timingSafeEqual(dado, esperado);
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await mandarAvisosPendientes()) });
  } catch (e) {
    console.error("[cron] avisos", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
