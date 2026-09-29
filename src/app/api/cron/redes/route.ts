import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { correrPublicador } from "@/lib/redes/publicador";

/**
 * Publicación de los videos de PeluDesk en redes (vercel.json → crons, cada
 * hora). Toma de redes_publicaciones lo que ya toca y lo publica
 * (src/lib/redes/publicador.ts). Vercel manda `Authorization: Bearer
 * <CRON_SECRET>`; sin CRON_SECRET no corre. La respuesta no trae ni pies ni
 * credenciales: solo cuántas.
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
    return NextResponse.json({ ok: true, ...(await correrPublicador()) });
  } catch (e) {
    console.error("[cron] redes", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
