import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { correrBusqueda, correrCalidad, correrLista } from "@/lib/prospectos/motor";

/**
 * Prospección diaria (vercel.json → crons, 13:00 UTC = 7:00 de la Ciudad de México, que no cambia de horario):
 * 1) busca en Google Places los giros y ciudades de /plataforma/prospectos hasta el tope del día (correr.ts);
 * 2) calidad: ciudad de la dirección, clasificación con IA de lo nuevo y sucursales (calidad.ts);
 * 3) arma la lista «Contactar hoy» con sus mensajes (lista.ts).
 * Un paso que falla no detiene a los siguientes. Vercel manda `Authorization: Bearer <CRON_SECRET>`; sin
 * CRON_SECRET no corre. Fuera de producción PLACES_API_URL / ANTHROPIC_API_URL apuntan a dobles.
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

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const salida: Record<string, unknown> = {};
  try {
    const r = await correrBusqueda({ origen: "cron", presupuestoMs: 160_000 });
    Object.assign(salida, r);
  } catch (e) {
    console.error("[cron] prospectos búsqueda", mensaje(e));
    salida.errorBusqueda = mensaje(e);
  }
  try {
    salida.calidad = await correrCalidad(70_000);
  } catch (e) {
    console.error("[cron] prospectos calidad", mensaje(e));
    salida.errorCalidad = mensaje(e);
  }
  try {
    salida.lista = await correrLista();
  } catch (e) {
    console.error("[cron] prospectos lista", mensaje(e));
    salida.errorLista = mensaje(e);
  }
  const ok = !salida.errorBusqueda && !salida.errorCalidad && !salida.errorLista;
  return NextResponse.json({ ok, ...salida }, { status: ok ? 200 : 500 });
}
