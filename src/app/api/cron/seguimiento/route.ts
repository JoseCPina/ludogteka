import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { correrSeguimiento } from "@/lib/seguimiento/correr";

/**
 * Seguimiento por WhatsApp a negocios en prueba (vercel.json → crons, cada
 * hora). Manda lo que toca en la ventana del negocio (lunes a sábado, 10:00 a
 * 19:00 en su zona) con plantillas aprobadas por Meta; nunca dos veces.
 * Vercel manda `Authorization: Bearer <CRON_SECRET>`; sin CRON_SECRET no corre.
 * La respuesta es solo el conteo: nada de teléfonos ni textos.
 *
 * Fuera de producción las pruebas pueden fijar el instante (?ahora=ISO) y
 * limitar a unos negocios (?solo=id,id); en producción se ignoran.
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
    const p = request.nextUrl.searchParams;
    const prueba = process.env.VERCEL_ENV !== "production";
    const ahoraPedido = prueba ? p.get("ahora") : null;
    const ahora = ahoraPedido && !Number.isNaN(Date.parse(ahoraPedido)) ? new Date(ahoraPedido) : undefined;
    const solo = prueba && p.get("solo") ? p.get("solo")!.split(",").filter(Boolean) : undefined;
    return NextResponse.json({ ok: true, ...(await correrSeguimiento({ ahora, solo })) });
  } catch (e) {
    console.error("[cron] seguimiento", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
