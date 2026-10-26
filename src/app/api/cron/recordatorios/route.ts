import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { correrRecordatorios } from "@/lib/recordatorios/enviar";

/**
 * Recordatorios automáticos por WhatsApp (vercel.json → crons, cada 15 minutos): programa, manda con la plantilla
 * aprobada y reporta a Stripe el excedente; una vez al día revisa la hoja de tarifas de Meta. Vercel manda
 * `Authorization: Bearer <CRON_SECRET>`; sin CRON_SECRET no corre. La respuesta es solo el conteo: nada de teléfonos
 * ni textos.
 *
 * Fuera de producción las pruebas pueden limitar a unos negocios (?solo=id,id), saltar la consulta de las plantillas
 * (?plantilla=ok) y no tocar Stripe (?stripe=no); en producción se ignoran.
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
    const solo = prueba && p.get("solo") ? p.get("solo")!.split(",").filter(Boolean) : undefined;
    return NextResponse.json({
      ok: true,
      ...(await correrRecordatorios({ solo, saltarPlantilla: prueba && p.get("plantilla") === "ok", sinStripe: prueba && p.get("stripe") === "no" })),
    });
  } catch (e) {
    console.error("[cron] recordatorios", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
