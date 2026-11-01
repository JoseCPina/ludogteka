import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { correrRecordatoriosApp } from "@/lib/app/recordatorios";

/**
 * Recordatorios de la app para dueños (vacuna, desparasitación, medicamento), cada 15 minutos (vercel.json): manda
 * los pendientes cuya hora llegó, por push, al centro de avisos y por WhatsApp (src/lib/app/recordatorios.ts).
 * Vercel manda `Authorization: Bearer <CRON_SECRET>`.
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
    const resumen = await correrRecordatoriosApp();
    return NextResponse.json({ ok: true, ...resumen });
  } catch (e) {
    console.error("[app-recordatorios]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
