import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { caducarAlertas } from "@/lib/movil/alertas";

/**
 * Alertas de la calle (Fase 5): cada hora (vercel.json) caducan solas las que nadie actualizó en 72 horas
 * (alertas_calle_caducar). Vercel manda `Authorization: Bearer <CRON_SECRET>`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return NextResponse.json({ ok: true, caducadas: await caducarAlertas() });
  } catch (e) {
    console.error("[cron] alertas", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
