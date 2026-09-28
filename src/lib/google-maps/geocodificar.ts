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
  opciones: { ciudad?: string | null; centro?: { lat: number; lng: number } | null } = {}
): Promise<ResultadoGeocodificar> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const completa = direccionConCiudad(direccion, opciones.ciudad);
  if (!key) {
    const { lat, lng } = geocodificarSimulado(completa, opciones.centro);
    return { ok: true, lat, lng, simulado: true };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
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

  const ubicacion = datos.results[0].geometry.location;
  return { ok: true, lat: ubicacion.lat, lng: ubicacion.lng, simulado: false };
}
