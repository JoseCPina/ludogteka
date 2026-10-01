import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ejecutarRetencion } from "@/lib/reporte/retencion";

/**
 * Borrado diario de fotos, videos y tarjetas vencidos (vercel.json → crons).
 * Vercel manda `Authorization: Bearer <CRON_SECRET>`; sin CRON_SECRET no corre.
 * La lógica vive en src/lib/reporte/retencion.ts.
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
    const resultado = await ejecutarRetencion(createSupabaseAdminClient());
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    console.error("[cron] retención de archivos de reportes", e);
    return NextResponse.json({ ok: false, error: "No se pudo completar la retención." }, { status: 500 });
  }
}
