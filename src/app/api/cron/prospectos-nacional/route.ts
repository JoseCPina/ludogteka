import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { correrNacional, estimarNacional } from "@/lib/prospectos/motor";
import { LISTA_NACIONAL_FUENTE } from "@/lib/prospectos/nacional";

/**
 * Prospección nacional (la llave de Google vive solo en Vercel, así que se dispara desde producción).
 * Protegida con el mismo `Authorization: Bearer <CRON_SECRET>` de las tareas. Vercel NO la programa: la dispara una persona.
 *   ?estimar=1                       → cuánto costaría (llamadas y dólares), sin llamar a Google.
 *   ?tope=N                          → una tanda de hasta N búsquedas (obligatorio, máximo 500); repetirla sigue donde quedó.
 *   &estados=Jalisco,Sonora  &zonas=Guadalajara  &giros=guarderia,hotel   → acotan la lista.
 * La lista de ciudades sale de INEGI (Censo 2020 y Metrópolis de México 2020; src/lib/prospectos/nacional.ts).
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

const lista = (v: string | null) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : undefined);
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const q = request.nextUrl.searchParams;
  const filtros = { estados: lista(q.get("estados")), zonas: lista(q.get("zonas")), giros: lista(q.get("giros")) };
  try {
    if (q.get("estimar")) {
      const topeDiario = Number(q.get("tope_diario")) || undefined;
      const precio = Number(q.get("precio_por_1000")) || undefined;
      return NextResponse.json({ ok: true, lista: LISTA_NACIONAL_FUENTE, ...(await estimarNacional({ ...filtros, topeDiario, precioPor1000Usd: precio })) });
    }
    const tope = Number(q.get("tope"));
    if (!Number.isInteger(tope) || tope < 1 || tope > 500) return NextResponse.json({ error: "Falta «tope» (entero de 1 a 500): cada búsqueda se cobra." }, { status: 400 });
    const r = await correrNacional({ tope, ...filtros, presupuestoMs: 250_000 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron] prospectos nacional", mensaje(e));
    return NextResponse.json({ ok: false, error: mensaje(e) }, { status: 500 });
  }
}
