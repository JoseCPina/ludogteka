import { geocodificarSimulado } from "./simulado";

// Nunca importar este módulo desde código que corra en el navegador:
// GOOGLE_MAPS_API_KEY es facturable, expuesta en el navegador cualquiera
// la consume contra la cuenta del negocio — mismo criterio que
// src/lib/supabase/admin.ts con la secret key.
// Fuera de producción, GOOGLE_API_URL apunta a un doble de pruebas (recoleccion-dev).
const baseGeocoding = () => (process.env.VERCEL_ENV !== "production" && process.env.GOOGLE_API_URL?.replace(/\/$/, "")) || "https://maps.googleapis.com";

export type ResultadoGeocodificar =
  | { ok: true; lat: number; lng: number; simulado: boolean }
  | { ok: false; error: string };

// Geocoding API sigue vigente (no es una de las legacy retiradas en
// marzo 2025) — https://developers.google.com/maps/documentation/geocoding.
// Se llama UNA vez por dirección nueva; el resultado se guarda en
// clientes.direccion_lat/lng y no se vuelve a pedir mientras el texto no
// cambie (ver distancia-actions.ts).
//
// `ciudad` es la del negocio (negocios.ciudad): se agrega a la dirección
// cuando no la trae, para que "Av. Juárez 120" caiga en SU ciudad y no en
// cualquiera de las cien avenidas Juárez del país. `centro` es el negocio
// (solo para la simulación).
export function direccionConCiudad(direccion: string, ciudad: string | null | undefined): string {
  const d = direccion.trim();
  const c = ciudad?.trim();
  if (!c) return d;
  const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return sinAcentos(d).includes(sinAcentos(c)) ? d : `${d}, ${c}`;
}

export async function geocodificarDireccion(
  direccion: string,
  opciones: { ciudad?: string | null; centro?: { lat: number; lng: number } | null; exacta?: boolean } = {}
): Promise<ResultadoGeocodificar> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const completa = direccionConCiudad(direccion, opciones.ciudad);
  if (!key) {
    const { lat, lng } = geocodificarSimulado(completa, opciones.centro);
    return { ok: true, lat, lng, simulado: true };
  }

  const url = new URL(`${baseGeocoding()}/maps/api/geocode/json`);
  url.searchParams.set("address", completa);
  url.searchParams.set("region", "mx");
  url.searchParams.set("key", key);

  let respuesta: Response;
  try {
    // Timeout explícito: fetch de Node NO trae uno por defecto. Sin esto,
    // si Google tarda en contestar la server action nunca regresa y la
    // pantalla se queda en "Calculando…" para siempre — que es justo el
    // bug que se reportó desde la ficha del cliente.
    respuesta = await fetch(url, { method: "GET", signal: AbortSignal.timeout(12000) });
  } catch (e) {
    const expiro = e instanceof Error && e.name === "TimeoutError";
    return {
      ok: false,
      error: expiro
        ? "Google Maps tardó demasiado en contestar. Intenta de nuevo o ajusta la distancia a mano."
        : "No se pudo contactar a Google Maps. Intenta de nuevo.",
    };
  }

  const datos = await respuesta.json();

  if (datos.status === "ZERO_RESULTS") {
    return { ok: false, error: "Google no encontró esa dirección. Revísala o ajusta la distancia a mano." };
  }
  if (datos.status !== "OK" || !datos.results?.[0]) {
    return { ok: false, error: `Geocodificación falló: ${datos.status ?? "sin respuesta"}.` };
  }

  // Para cobrar por km no basta «en algún lado de la ciudad»: el centro de una colonia o ciudad no es una dirección.
  if (opciones.exacta && datos.results[0].geometry.location_type === "APPROXIMATE") {
    return { ok: false, error: "Esa dirección está muy general: agrega calle, número y colonia." };
  }
  const ubicacion = datos.results[0].geometry.location;
  return { ok: true, lat: ubicacion.lat, lng: ubicacion.lng, simulado: false };
}

/** La dirección de unas coordenadas (geocodificación inversa): para proponerla, nunca para cobrar. */
export async function direccionDeCoordenadas(lat: number, lng: number): Promise<{ ok: true; direccion: string } | { ok: false; error: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { ok: true, direccion: `Calle simulada ${Math.abs(Math.round(lat * 1000))}, Centro` };
  const url = new URL(`${baseGeocoding()}/maps/api/geocode/json`);
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("language", "es");
  url.searchParams.set("result_type", "street_address|premise");
  url.searchParams.set("key", key);
  try {
    const datos = await (await fetch(url, { signal: AbortSignal.timeout(12000) })).json();
    const d = datos.results?.[0]?.formatted_address;
    return typeof d === "string" ? { ok: true, direccion: d } : { ok: false, error: datos.status ?? "sin resultados" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "sin respuesta" };
  }
}
