// Prueba de conexión con Google Maps, para el panel de admin.
//
// Existe porque hoy la única forma de enterarse de que la llave está mal
// configurada (una API sin habilitar, facturación caída, una restricción
// por HTTP referrer que bloquea al servidor) es que le falle a recepción
// con el cliente enfrente. Esto lo mueve a un botón que se aprieta cuando
// uno quiere, no cuando el negocio menos lo necesita.
//
// No reusa geocodificarDireccion()/calcularDistanciaRuta() a propósito:
// esas dos traducen cualquier fallo a un mensaje para recepción ("Google
// no encontró esa dirección"), que es lo correcto ahí y justo lo que
// estorba aquí. El diagnóstico necesita el status crudo de Google para
// poder decir QUÉ hay que ir a arreglar en la consola.
import { geocodificarSimulado, distanciaSimulada } from "./simulado";

export type PruebaApi = {
  api: string;
  ok: boolean;
  simulado: boolean;
  detalle: string;
  sugerencia: string | null;
  ms: number;
};

export type Punto = { lat: number; lng: number };

// Traduce lo que responde Google a la acción concreta en la consola. Un
// "REQUEST_DENIED" a secas no le dice nada a nadie a los tres meses.
function sugerenciaGeocoding(status: string, mensaje: string): string | null {
  if (status === "REQUEST_DENIED") {
    if (/referer|referrer/i.test(mensaje)) {
      return "La llave tiene restricción de aplicación por HTTP referrer. Esta llave la usa el servidor de Vercel, que no manda referrer: cámbiala a 'Ninguna' o restringe por IP.";
    }
    if (/not authorized|API key not valid|disabled/i.test(mensaje)) {
      return "Habilita Geocoding API en el proyecto, o quita esa API de la lista de restricciones de la llave.";
    }
    return "Revisa en Credenciales que la llave permita Geocoding API y que su restricción de aplicación no sea por HTTP referrer.";
  }
  if (status === "OVER_QUERY_LIMIT" || status === "OVER_DAILY_LIMIT") {
    return "Se acabó la cuota o la facturación no está activa. Revisa Facturación y las Cuotas del proyecto.";
  }
  if (status === "ZERO_RESULTS") {
    return "La llave funciona: Google respondió bien, solo que no encontró esa dirección de prueba.";
  }
  return null;
}

function sugerenciaRoutes(status: number, cuerpo: string): string | null {
  if (status === 403) {
    if (/referer|referrer/i.test(cuerpo)) {
      return "La llave tiene restricción por HTTP referrer y el servidor no manda referrer: cámbiala a 'Ninguna' o restringe por IP.";
    }
    return "Habilita Routes API en el proyecto, o agrégala a las APIs permitidas de la llave.";
  }
  if (status === 429) {
    return "Cuota agotada. Revisa Cuotas y Facturación del proyecto.";
  }
  if (status === 400) {
    return "Google rechazó la petición. Si dice algo de billing, es la cuenta de facturación del proyecto.";
  }
  return null;
}

async function probarGeocoding(direccion: string, key: string | undefined): Promise<PruebaApi> {
  const t0 = Date.now();
  if (!key) {
    const { lat, lng } = geocodificarSimulado(direccion);
    return {
      api: "Geocoding API",
      ok: true,
      simulado: true,
      detalle: `Sin llave configurada: la app respondió con una coordenada simulada (${lat.toFixed(4)}, ${lng.toFixed(4)}).`,
      sugerencia: "Es lo esperado en desarrollo. En producción, si sale esto, falta GOOGLE_MAPS_API_KEY en Vercel.",
      ms: Date.now() - t0,
    };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", direccion);
  url.searchParams.set("region", "mx");
  url.searchParams.set("key", key);

  try {
    const r = await fetch(url, { method: "GET", signal: AbortSignal.timeout(12000) });
    const datos = await r.json();
    const ms = Date.now() - t0;
    const status = String(datos.status ?? `HTTP ${r.status}`);
    const mensaje = String(datos.error_message ?? "");

    if (status === "OK" && datos.results?.[0]) {
      const u = datos.results[0].geometry.location;
      const precision = datos.results[0].geometry.location_type ?? "?";
      return {
        api: "Geocoding API",
        ok: true,
        simulado: false,
        detalle: `Respondió (${u.lat.toFixed(6)}, ${u.lng.toFixed(6)}), precisión ${precision}.`,
        sugerencia: null,
        ms,
      };
    }
    return {
      api: "Geocoding API",
      ok: false,
      simulado: false,
      detalle: `Google respondió ${status}${mensaje ? `: ${mensaje}` : ""}.`,
      sugerencia: sugerenciaGeocoding(status, mensaje),
      ms,
    };
  } catch (e) {
    return {
      api: "Geocoding API",
      ok: false,
      simulado: false,
      detalle: `No se pudo contactar a Google: ${e instanceof Error ? e.message : "error de red"}.`,
      sugerencia: "Revisa que el servidor tenga salida a internet.",
      ms: Date.now() - t0,
    };
  }
}

async function probarRoutes(
  base: Punto,
  intermedio: Punto,
  destino: Punto,
  key: string | undefined
): Promise<PruebaApi> {
  const t0 = Date.now();
  if (!key) {
    return {
      api: "Routes API",
      ok: true,
      simulado: true,
      detalle: `Sin llave configurada: la app respondió ${distanciaSimulada("base", "intermedio", "destino")} km simulados.`,
      sugerencia: "Es lo esperado en desarrollo. En producción, si sale esto, falta GOOGLE_MAPS_API_KEY en Vercel.",
      ms: Date.now() - t0,
    };
  }

  const punto = (p: Punto) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

  try {
    const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: punto(base),
        destination: punto(destino),
        intermediates: [punto(intermedio)],
        travelMode: "DRIVE",
      }),
      signal: AbortSignal.timeout(12000),
    });
    const cuerpo = await r.text();
    const ms = Date.now() - t0;

    if (!r.ok) {
      return {
        api: "Routes API",
        ok: false,
        simulado: false,
        detalle: `Google respondió HTTP ${r.status}: ${cuerpo.slice(0, 200)}`,
        sugerencia: sugerenciaRoutes(r.status, cuerpo),
        ms,
      };
    }

    const datos = JSON.parse(cuerpo);
    const metros = datos.routes?.[0]?.distanceMeters;
    if (typeof metros !== "number") {
      return {
        api: "Routes API",
        ok: false,
        simulado: false,
        detalle: "Google respondió sin ruta entre esos puntos.",
        sugerencia: "Revisa que las coordenadas de la base y de la sucursal sean correctas.",
        ms,
      };
    }
    return {
      api: "Routes API",
      ok: true,
      simulado: false,
      detalle: `Ruta base → dirección de prueba → Ludogteka: ${(metros / 1000).toFixed(1)} km.`,
      sugerencia: null,
      ms,
    };
  } catch (e) {
    return {
      api: "Routes API",
      ok: false,
      simulado: false,
      detalle: `No se pudo contactar a Google: ${e instanceof Error ? e.message : "error de red"}.`,
      sugerencia: "Revisa que el servidor tenga salida a internet.",
      ms: Date.now() - t0,
    };
  }
}

// Las dos APIs que el cotizador necesita, en el mismo orden en que las
// usa el flujo real: primero convertir la dirección en coordenada,
// después medir la ruta. Si la primera falla, la segunda se corre igual
// (con la coordenada de la sucursal como intermedio) — saber si el
// problema es de una API o de las dos cambia a dónde hay que ir.
export async function probarGoogleMaps(
  direccionPrueba: string,
  base: Punto,
  ludogteka: Punto
): Promise<PruebaApi[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;

  const geo = await probarGeocoding(direccionPrueba, key);
  const intermedio = geo.ok && !geo.simulado
    ? extraerPunto(geo.detalle) ?? ludogteka
    : ludogteka;
  const rutas = await probarRoutes(base, intermedio, ludogteka, key);

  return [geo, rutas];
}

// La coordenada ya viene formateada en el detalle; se relee de ahí para
// no cambiar la forma de PruebaApi solo por esto.
function extraerPunto(detalle: string): Punto | null {
  const m = detalle.match(/\((-?\d+\.\d+), (-?\d+\.\d+)\)/);
  if (!m) return null;
  return { lat: Number(m[1]), lng: Number(m[2]) };
}
