import { geocodificarSimulado } from "./simulado";

// Nunca importar este módulo desde código que corra en el navegador:
// GOOGLE_MAPS_API_KEY es facturable, expuesta en el navegador cualquiera
// la consume contra la cuenta del negocio — mismo criterio que
// src/lib/supabase/admin.ts con la secret key.
export type ResultadoGeocodificar =
  | { ok: true; lat: number; lng: number; simulado: boolean }
  | { ok: false; error: string };

// Geocoding API sigue vigente (no es una de las legacy retiradas en
// marzo 2025) — https://developers.google.com/maps/documentation/geocoding.
// Se llama UNA vez por dirección nueva; el resultado se guarda en
// clientes.direccion_lat/lng y no se vuelve a pedir mientras el texto no
// cambie (ver distancia-actions.ts).
export async function geocodificarDireccion(direccion: string): Promise<ResultadoGeocodificar> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    const { lat, lng } = geocodificarSimulado(direccion);
    return { ok: true, lat, lng, simulado: true };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", direccion);
  url.searchParams.set("region", "mx");
  url.searchParams.set("key", key);

  let respuesta: Response;
  try {
    respuesta = await fetch(url, { method: "GET" });
  } catch {
    return { ok: false, error: "No se pudo contactar a Google Maps. Intenta de nuevo." };
  }

  const datos = await respuesta.json();

  if (datos.status === "ZERO_RESULTS") {
    return { ok: false, error: "Google no encontró esa dirección. Revísala o ajusta la distancia a mano." };
  }
  if (datos.status !== "OK" || !datos.results?.[0]) {
    return { ok: false, error: `Geocodificación falló: ${datos.status ?? "sin respuesta"}.` };
  }

  const ubicacion = datos.results[0].geometry.location;
  return { ok: true, lat: ubicacion.lat, lng: ubicacion.lng, simulado: false };
}
