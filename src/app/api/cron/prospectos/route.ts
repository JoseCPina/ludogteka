import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { correrProspeccion } from "@/lib/prospectos/correr";
import { buscarTexto, PLACES_URL } from "@/lib/prospectos/places";
import { revisarWeb } from "@/lib/prospectos/web";

/**
 * Prospección diaria (vercel.json → crons, 13:00 UTC = 7:00 de la Ciudad de México, que no cambia de horario):
 * busca en Google Places negocios de los giros y ciudades de /plataforma/prospectos hasta el tope de búsquedas
 * del día y los deja en el CRM (src/lib/prospectos/correr.ts). Cada corrida queda en prospeccion_corridas.
 * Vercel manda `Authorization: Bearer <CRON_SECRET>`; sin CRON_SECRET no corre. Fuera de producción
 * PLACES_API_URL apunta a un doble (en producción se ignora).
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
  const url = process.env.VERCEL_ENV !== "production" ? process.env.PLACES_API_URL?.trim() || PLACES_URL : PLACES_URL;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
  try {
    const r = await correrProspeccion({
      db: createSupabaseAdminClient(),
      apiKey,
      buscar: (consulta, pageToken) => buscarTexto({ apiKey: apiKey!, consulta, pageToken, url }),
      revisarWeb: (w) => revisarWeb(w),
      origen: "cron",
      presupuestoMs: 270_000,
    });
    return NextResponse.json({ ok: r.estado === "terminada" || r.estado === "pausada", ...r });
  } catch (e) {
    console.error("[cron] prospectos", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
