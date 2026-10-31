import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { mandarRecordatorios } from "@/lib/escuela/datos";

/**
 * El recordatorio de la Escuela PeluDesk (vercel.json → crons, cada 15 minutos): a los inscritos de una sesión que
 * empieza en 45 a 75 minutos les llega por el bot la liga, con la plantilla de las herramientas. Un intento por
 * inscrito. Vercel manda `Authorization: Bearer <CRON_SECRET>`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
    return NextResponse.json({ ok: true, ...(await mandarRecordatorios()) });
  } catch (e) {
    console.error("[cron] escuela", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
