import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clasificarPendientes } from "@/lib/mercado/clasificar";

/**
 * Clasificación de los candidatos de precio del Índice PeluDesk (vercel.json → crons, cada hora al minuto 33): los
 * scripts de scripts/mercado dejan cada cantidad con su contexto en precios_mercado_candidatos (la llave de Anthropic
 * solo vive aquí) y esta tarea le pide a la IA de qué servicio es y la pasa a precios_mercado. Hasta 600 por corrida
 * (4 minutos), tope de 300 MXN de IA en 31 días. ?tope=N lo cambia (manual, con el secreto).
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
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ ok: false, error: "Sin ANTHROPIC_API_KEY." }, { status: 500 });
  const tope = Math.min(3000, Math.max(1, Number(request.nextUrl.searchParams.get("tope")) || 600));
  try {
    const r = await clasificarPendientes(createSupabaseAdminClient(), {
      apiKey,
      workspace: process.env.ANTHROPIC_WORKSPACE_ID,
      url: process.env.VERCEL_ENV !== "production" ? process.env.ANTHROPIC_API_URL?.trim() || undefined : undefined,
      tope,
    });
    return NextResponse.json({ ok: r.errores.length === 0 || r.revisados > 0, ...r });
  } catch (e) {
    console.error("[cron] mercado clasificar", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
