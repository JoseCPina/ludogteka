import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { correrRespaldos } from "@/lib/whatsapp/flow/servidor";
import { correrSeguimientosVentas } from "@/lib/whatsapp/ventas/servidor";

/**
 * El respaldo del formulario de prueba gratis por WhatsApp (vercel.json → cada 2 minutos): a quien no lo abrió en 10
 * minutos (y no escribió nada desde entonces), la prueba por texto; y las sesiones completadas que nadie terminó de
 * abrir, se abren. Además, los seguimientos del guion de ventas (src/lib/whatsapp/ventas/servidor.ts). Vercel manda `Authorization: Bearer <CRON_SECRET>`; sin CRON_SECRET no corre.
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
    return NextResponse.json({ ok: true, ...(await correrRespaldos()), ...(await correrSeguimientosVentas()) });
  } catch (e) {
    console.error("[cron] whatsapp-flow", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
