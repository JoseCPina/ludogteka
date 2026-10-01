import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { correrResumen } from "@/lib/resumen/correr";

/**
 * Resumen diario de PeluDesk por Telegram (vercel.json → crons, cada hora:
 * manda a la hora configurada en /plataforma/resumen, o en la siguiente si
 * ese día aún no salió; nunca dos veces). Vercel manda `Authorization:
 * Bearer <CRON_SECRET>`; sin CRON_SECRET no corre. La respuesta no trae el
 * contenido del resumen: solo qué pasó.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    // Fuera de producción las pruebas piden un día concreto (?dia=AAAA-MM-DD); en producción se ignora.
    const pedido = request.nextUrl.searchParams.get("dia");
    const dia = process.env.VERCEL_ENV !== "production" && pedido && /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : undefined;
    return NextResponse.json({ ok: true, ...(await correrResumen({ origen: "cron", dia })) });
  } catch (e) {
    console.error("[cron] resumen", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
