import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { correrSincronizacionMeta } from "@/lib/meta-ads/motor";

/**
 * Audiencias de Meta (vercel.json → crons, 13:45 UTC = 7:45 de la Ciudad de México): después de la búsqueda, la
 * limpieza y la lista de las 7:00 (/api/cron/prospectos), sincroniza altas, bajas y cambios de cada audiencia y deja
 * la corrida en meta_audiencias_corridas. Vercel manda `Authorization: Bearer <CRON_SECRET>`; sin él no corre.
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
  const r = await correrSincronizacionMeta("cron");
  return NextResponse.json(r, { status: r.estado === "fallida" ? 500 : 200 });
}
