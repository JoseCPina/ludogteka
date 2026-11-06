import { distanciaSimulada } from "./simulado";

// Fuera de producción, GOOGLE_API_URL apunta a un doble de pruebas (recoleccion-dev).
const baseRutas = () => (process.env.VERCEL_ENV !== "production" && process.env.GOOGLE_API_URL?.replace(/\/$/, "")) || "https://routes.googleapis.com";
// Una llave restringida solo a Routes API, si existe; si no, la de siempre.
const llaveRutas = () => process.env.GOOGLE_RUTAS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

/** Km por ruta en coche de un punto a otro (recolección). Sin llave, simulados. */
export async function kmEntrePuntos(origen: { lat: number; lng: number }, destino: { lat: number; lng: number }): Promise<{ ok: true; km: number; simulado: boolean } | { ok: false; error: string }> {
  const key = llaveRutas();
  if (!key) {
    const r = 6371, rad = (x: number) => (x * Math.PI) / 180;
    const h = Math.sin(rad(destino.lat - origen.lat) / 2) ** 2 + Math.cos(rad(origen.lat)) * Math.cos(rad(destino.lat)) * Math.sin(rad(destino.lng - origen.lng) / 2) ** 2;
    return { ok: true, km: Math.ceil(2 * r * Math.asin(Math.sqrt(h)) * 1.3 * 10) / 10, simulado: true };
  }
  const punto = (p: { lat: number; lng: number }) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  try {
    const r = await fetch(`${baseRutas()}/directions/v2:computeRoutes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters" },
      body: JSON.stringify({ origin: punto(origen), destination: punto(destino), travelMode: "DRIVE" }),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return { ok: false, error: `Routes API respondió ${r.status}` };
    const metros = (await r.json()).routes?.[0]?.distanceMeters;
    if (typeof metros !== "number") return { ok: false, error: "Google no devolvió una ruta entre esos puntos." };
    return { ok: true, km: Math.round((metros / 1000) * 10) / 10, simulado: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "sin respuesta" };
  }
}

export type PuntoRuta = { lat: number; lng: number; id: string };

export type ResultadoRuta =
  | { ok: true; km: number; simulado: boolean }
  | { ok: false; error: string };

// Routes API (computeRoutes), NO Distance Matrix ni Directions — esas dos
// quedaron legacy desde el 1 de marzo de 2025. Una sola llamada con el
// domicilio como waypoint intermedio entre base y el negocio: el orden se
// respeta tal cual (sin optimizeWaypointOrder), exactamente la ruta real
// de la camioneta. Field mask pedido al mínimo (solo distanceMeters) para
// no pagar/transferir de más — Routes API exige X-Goog-FieldMask, a
// diferencia de las APIs legacy que no lo pedían.
// https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
export async function calcularDistanciaRuta(
  base: PuntoRuta,
  domicilio: PuntoRuta,
  negocio: PuntoRuta
): Promise<ResultadoRuta> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return { ok: true, km: distanciaSimulada(base.id, domicilio.id, negocio.id), simulado: true };
  }

  const punto = (p: PuntoRuta) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

  let respuesta: Response;
  try {
    respuesta = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: punto(base),
        destination: punto(negocio),
        intermediates: [punto(domicilio)],
        travelMode: "DRIVE",
      }),
      // Ver el comentario de geocodificar.ts: sin timeout explícito, un
      // Google lento deja la pantalla girando indefinidamente.
      signal: AbortSignal.timeout(12000),
    });
  } catch (e) {
    const expiro = e instanceof Error && e.name === "TimeoutError";
    return {
      ok: false,
      error: expiro
        ? "Google Maps tardó demasiado en contestar. Intenta de nuevo o ajusta la distancia a mano."
        : "No se pudo contactar a Google Maps. Intenta de nuevo.",
    };
  }

  if (!respuesta.ok) {
    return { ok: false, error: `Routes API respondió ${respuesta.status}. Intenta de nuevo.` };
  }

  const datos = await respuesta.json();
  const metros = datos.routes?.[0]?.distanceMeters;
  if (typeof metros !== "number") {
    return { ok: false, error: "Google no devolvió una ruta entre esos puntos." };
  }

  return { ok: true, km: Math.round((metros / 1000) * 10) / 10, simulado: false };
}
