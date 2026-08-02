import { distanciaSimulada } from "./simulado";

export type PuntoRuta = { lat: number; lng: number; id: string };

export type ResultadoRuta =
  | { ok: true; km: number; simulado: boolean }
  | { ok: false; error: string };

// Routes API (computeRoutes), NO Distance Matrix ni Directions — esas dos
// quedaron legacy desde el 1 de marzo de 2025. Una sola llamada con el
// domicilio como waypoint intermedio entre base y Ludogteka: el orden se
// respeta tal cual (sin optimizeWaypointOrder), exactamente la ruta real
// de la camioneta. Field mask pedido al mínimo (solo distanceMeters) para
// no pagar/transferir de más — Routes API exige X-Goog-FieldMask, a
// diferencia de las APIs legacy que no lo pedían.
// https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
export async function calcularDistanciaRuta(
  base: PuntoRuta,
  domicilio: PuntoRuta,
  ludogteka: PuntoRuta
): Promise<ResultadoRuta> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return { ok: true, km: distanciaSimulada(base.id, domicilio.id, ludogteka.id), simulado: true };
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
        destination: punto(ludogteka),
        intermediates: [punto(domicilio)],
        travelMode: "DRIVE",
      }),
    });
  } catch {
    return { ok: false, error: "No se pudo contactar a Google Maps. Intenta de nuevo." };
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
