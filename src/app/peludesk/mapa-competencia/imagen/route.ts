import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { esGiroMercado } from "@/lib/mercado/catalogo";

/**
 * La imagen del mapa de competencia: la pide el servidor a Google Static Maps (la llave nunca llega al navegador) con
 * el punto de la persona y los negocios del giro a 5 km como marcadores, y la entrega tal cual. Se cachea un día por
 * punto redondeado. Sin llave, 404 (la página enseña los números sin mapa).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  const giro = p.get("giro");
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !esGiroMercado(giro) || !apiKey) return new NextResponse("No encontrada.", { status: 404 });
  const { data } = await createSupabaseAdminClient().rpc("prospectos_cerca", { p_lat: lat, p_lng: lng, p_radio_m: 5000, p_giro: giro });
  const marcadores = ((data ?? []) as { lat: number; lng: number }[]).slice(0, 80).map((x) => `${Number(x.lat).toFixed(5)},${Number(x.lng).toFixed(5)}`).join("|");
  const q = new URLSearchParams({ size: "640x480", scale: "2", maptype: "roadmap", language: "es", region: "MX", key: apiKey });
  q.append("markers", `color:0x4b3f72|label:T|${lat.toFixed(5)},${lng.toFixed(5)}`);
  if (marcadores) q.append("markers", `size:small|color:0x1f6b57|${marcadores}`);
  q.append("path", `color:0x4b3f7280|weight:2|fillcolor:0x4b3f7210|${circulo(lat, lng, 2000)}`);
  const base = process.env.VERCEL_ENV !== "production" ? process.env.STATIC_MAPS_URL?.trim() || "https://maps.googleapis.com/maps/api/staticmap" : "https://maps.googleapis.com/maps/api/staticmap";
  try {
    const r = await fetch(`${base}?${q}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return new NextResponse("No encontrada.", { status: 404 });
    return new NextResponse(await r.arrayBuffer(), { headers: { "Content-Type": r.headers.get("content-type") ?? "image/png", "Cache-Control": "public, max-age=86400, s-maxage=86400" } });
  } catch {
    return new NextResponse("No encontrada.", { status: 404 });
  }
}

/** Un círculo de radio en metros como polilínea de 24 puntos (lat,lng|…). */
function circulo(lat: number, lng: number, radio: number): string {
  const R = 6371000;
  const puntos: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * 2 * Math.PI;
    const dLat = (radio * Math.cos(t)) / R;
    const dLng = (radio * Math.sin(t)) / (R * Math.cos((lat * Math.PI) / 180));
    puntos.push(`${(lat + (dLat * 180) / Math.PI).toFixed(5)},${(lng + (dLng * 180) / Math.PI).toFixed(5)}`);
  }
  return puntos.join("|");
}
