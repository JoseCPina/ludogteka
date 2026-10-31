import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { metaPlantillasConfigurada, sincronizarPlantillas } from "@/lib/whatsapp/plantillas";

/**
 * Las plantillas de WhatsApp de PeluDesk en Meta (vercel.json → crons, una vez al día): consulta el estado de todas
 * las del catálogo (src/lib/whatsapp/plantillas.ts), manda a revisión las que Meta todavía no tiene y guarda el
 * resultado para /plataforma/plantillas-whatsapp. Corre en Vercel porque WHATSAPP_TOKEN y PELUDESK_WABA_ID solo viven
 * ahí. A mano: `npx vercel crons run /api/cron/plantillas-whatsapp` (desde PowerShell). Vercel manda
 * `Authorization: Bearer <CRON_SECRET>`.
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
  if (!metaPlantillasConfigurada()) return NextResponse.json({ ok: false, error: "Faltan WHATSAPP_TOKEN o PELUDESK_WABA_ID." }, { status: 200 });
  try {
    return NextResponse.json({ ok: true, ...(await sincronizarPlantillas({ enviarFaltantes: true })) });
  } catch (e) {
    console.error("[cron] plantillas-whatsapp", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
