import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { correrRecordatorios } from "@/lib/carnet/recordatorios";

/**
 * Recordatorios de próxima dosis del carnet (vercel.json → crons, cada hora).
 * Manda por WhatsApp, con la plantilla aprobada, las vacunas y desparasitaciones que les toca
 * a las mascotas de los negocios con Veterinaria y el envío automático prendidos; una sola vez
 * por dosis. Vercel manda `Authorization: Bearer <CRON_SECRET>`; sin CRON_SECRET no corre.
 * La respuesta es solo el conteo: nada de teléfonos ni textos.
 *
 * Fuera de producción las pruebas pueden fijar el instante (?ahora=ISO), limitar a unos negocios
 * (?solo=id,id) y saltar la consulta de la plantilla (?plantilla=ok); en producción se ignoran.
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
    return NextResponse.json({ ok: true, ...(await correrRecordatorios({ ahora, solo, saltarPlantilla: prueba && p.get("plantilla") === "ok" })) });
  } catch (e) {
    console.error("[cron] carnet", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
