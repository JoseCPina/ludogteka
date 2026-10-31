import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PLACES_URL } from "@/lib/prospectos/places";
import { coloniaDe } from "@/lib/directorio/consulta";
import { CIUDADES_MERCADO } from "@/lib/mercado/ciudades";
import { normalizarTexto, type GiroMercado } from "@/lib/mercado/catalogo";

/**
 * El mapa de competencia (/mapa-competencia): una dirección o colonia + un giro → el punto (Places Text Search con
 * solo `location`, en el servidor), los negocios del giro a 1, 2 y 5 km (prospectos_cerca: los prospectos del CRM con
 * ubicación de Google), su calificación promedio, la cobertura del municipio por habitante (población INEGI 2020 de
 * la lista nacional) y las colonias con menos negocios alrededor. Nada de Google llega al navegador; el mapa es una
 * imagen estática servida por /mapa-competencia/imagen.
 */
export type Punto = { lat: number; lng: number; texto: string; ciudad: string | null };
export type NegocioCerca = { id: string; slug: string; nombre: string; ciudad: string; colonia: string | null; calificacion: number | null; resenas: number | null; lat: number; lng: number; distancia_m: number; servicios: string[] };
export type Analisis = {
  punto: Punto;
  giro: GiroMercado;
  anillos: { km: number; n: number; promedio: number | null }[];
  cercanos: NegocioCerca[];
  colonias: { nombre: string; n: number; distancia_m: number }[];
  municipio: { nombre: string; poblacion: number; negocios: number; por10k: number } | null;
  resumen: string;
};

const urlPlaces = () => (process.env.VERCEL_ENV !== "production" ? process.env.PLACES_API_URL?.trim() || PLACES_URL : PLACES_URL);

/** Ubica una dirección o colonia escrita por la persona (Text Search, campo location; SKU Essentials). */
export async function ubicar(texto: string, ciudad: string | null): Promise<Punto | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) return null;
  const consulta = [texto.trim(), ciudad?.trim(), "México"].filter(Boolean).join(", ");
  try {
    const r = await fetch(`${urlPlaces()}/places:searchText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.location,places.formattedAddress" },
      body: JSON.stringify({ textQuery: consulta, languageCode: "es", regionCode: "MX", pageSize: 1 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { places?: { location?: { latitude?: number; longitude?: number }; formattedAddress?: string }[] };
    const p = j.places?.[0];
    if (typeof p?.location?.latitude !== "number" || typeof p.location.longitude !== "number") return null;
    return { lat: p.location.latitude, lng: p.location.longitude, texto: p.formattedAddress ?? consulta, ciudad };
  } catch (e) {
    console.error("[mapa] ubicar", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function analizar(punto: Punto, giro: GiroMercado): Promise<Analisis> {
  const { data, error } = await createSupabaseAdminClient().rpc("prospectos_cerca", { p_lat: punto.lat, p_lng: punto.lng, p_radio_m: 5000, p_giro: giro });
  if (error) console.error("[mapa] cerca", error.message);
  const cercanos: NegocioCerca[] = ((data ?? []) as Record<string, unknown>[]).map((x) => ({
    id: String(x.id), slug: String(x.slug), nombre: String(x.nombre), ciudad: String(x.ciudad ?? ""), colonia: coloniaDe(x.direccion as string | null),
    calificacion: x.calificacion != null ? Number(x.calificacion) : null, resenas: x.resenas != null ? Number(x.resenas) : null,
    lat: Number(x.lat), lng: Number(x.lng), distancia_m: Number(x.distancia_m), servicios: Array.isArray(x.servicios) ? (x.servicios as string[]) : [],
  }));
  const anillo = (km: number) => {
    const dentro = cercanos.filter((c) => c.distancia_m <= km * 1000);
    const con = dentro.filter((c) => c.calificacion != null);
    return { km, n: dentro.length, promedio: con.length ? Math.round((con.reduce((n, c) => n + (c.calificacion ?? 0), 0) / con.length) * 10) / 10 : null };
  };
  const anillos = [1, 2, 5].map(anillo);
  // Colonias alrededor (hasta 5 km) con cuántos negocios tiene cada una: las de menos, al frente.
  const mapa = new Map<string, { nombre: string; n: number; distancia_m: number }>();
  for (const c of cercanos) {
    if (!c.colonia) continue;
    const k = normalizarTexto(c.colonia);
    const v = mapa.get(k) ?? { nombre: c.colonia, n: 0, distancia_m: c.distancia_m };
    v.n++;
    v.distancia_m = Math.min(v.distancia_m, c.distancia_m);
    mapa.set(k, v);
  }
  const colonias = [...mapa.values()].sort((a, b) => a.n - b.n || a.distancia_m - b.distancia_m);
  // El municipio: población INEGI y cuántos negocios del giro tiene el CRM en esa ciudad.
  const ciudadNombre = punto.ciudad ?? cercanos[0]?.ciudad ?? null;
  const m = ciudadNombre ? CIUDADES_MERCADO.find((x) => normalizarTexto(x.nombre) === normalizarTexto(ciudadNombre)) ?? null : null;
  let municipio: Analisis["municipio"] = null;
  if (m) {
    const { count } = await createSupabaseAdminClient().from("prospectos").select("id", { count: "exact", head: true }).is("deleted_at", null).is("principal_id", null).neq("etapa", "descartado").ilike("ciudad", m.nombre).in("giro", [giro, "mixto"]);
    const negocios = count ?? 0;
    municipio = { nombre: m.nombre, poblacion: m.poblacion, negocios, por10k: Math.round((negocios / m.poblacion) * 10000 * 10) / 10 };
  }
  const nombreGiro: Record<GiroMercado, [string, string]> = { estetica: ["estética", "estéticas"], hotel: ["hotel", "hoteles"], guarderia: ["guardería", "guarderías"], veterinaria: ["veterinaria", "veterinarias"] };
  const [sing, plur] = nombreGiro[giro];
  const a2 = anillos[1];
  const menos = colonias.slice(0, 2).map((c) => c.nombre);
  const resumen = `En 2 km hay ${a2.n === 1 ? `1 ${sing}` : `${a2.n} ${plur}`}${a2.promedio ? ` con calificación promedio de ${a2.promedio}` : ""}; en 5 km, ${anillos[2].n}.${menos.length ? ` Las zonas con menos cobertura alrededor son ${menos.join(" y ")}.` : ""}${municipio ? ` ${municipio.nombre} tiene ${municipio.por10k} ${plur} por cada 10 mil habitantes.` : ""}`;
  return { punto, giro, anillos, cercanos, colonias, municipio, resumen };
}

/** La URL de la imagen del mapa (ruta propia: la llave no sale del servidor). */
export function urlImagenMapa(a: Analisis): string {
  const q = new URLSearchParams({ lat: a.punto.lat.toFixed(5), lng: a.punto.lng.toFixed(5), giro: a.giro });
  return `/mapa-competencia/imagen?${q}`;
}
