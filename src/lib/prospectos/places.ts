// Google Places API (New): Text Search para encontrar negocios y Place Details para refrescar uno.
// Sin imports (también lo usa scripts/prospectos/buscar.mjs con Node directo).
//
// Costo: Google cobra Text Search POR LLAMADA (hasta 20 lugares cada una), no por lugar. Con los campos de
// contacto (teléfono, web, calificación) cada llamada es del SKU «Text Search Enterprise», con 1,000 llamadas
// gratis al mes: el tope por día de /plataforma/prospectos (30 por omisión ≈ 900 al mes) se queda adentro.
// Por eso NO se llama Place Details por cada resultado (sería una llamada cobrada por lugar con los mismos datos
// que ya trae la búsqueda): Details solo se usa para «Actualizar desde Google» en la ficha.

export type LugarGoogle = {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  web: string | null;
  calificacion: number | null;
  resenas: number | null;
  tipos: string[];
  cerrado: boolean;
};

export const PLACES_URL = "https://places.googleapis.com/v1";

const CAMPOS = ["id", "displayName", "formattedAddress", "nationalPhoneNumber", "internationalPhoneNumber", "websiteUri", "rating", "userRatingCount", "types", "businessStatus"];

type LugarApi = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  types?: string[];
  businessStatus?: string;
};

export class ErrorPlaces extends Error {
  readonly estado: number;
  readonly fatal: boolean;
  constructor(mensaje: string, estado: number, fatal: boolean) {
    super(mensaje);
    this.estado = estado;
    this.fatal = fatal;
  }
}

function aLugar(p: LugarApi): LugarGoogle | null {
  if (!p.id || !p.displayName?.text) return null;
  return {
    id: p.id,
    nombre: p.displayName.text,
    direccion: p.formattedAddress ?? null,
    telefono: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
    web: p.websiteUri ?? null,
    calificacion: typeof p.rating === "number" ? Math.round(p.rating * 10) / 10 : null,
    resenas: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    tipos: p.types ?? [],
    cerrado: p.businessStatus === "CLOSED_PERMANENTLY",
  };
}

async function errorDe(r: Response): Promise<ErrorPlaces> {
  let detalle = "";
  try {
    const j = (await r.json()) as { error?: { message?: string; status?: string } };
    detalle = j.error?.message ?? j.error?.status ?? "";
  } catch {
    /* sin cuerpo */
  }
  // 400 de llave inválida, 401/403 (llave, API sin habilitar, facturación): no tiene caso seguir con otras.
  const fatal = r.status === 401 || r.status === 403 || /api key|API_KEY|not enabled|billing/i.test(detalle);
  return new ErrorPlaces(`Google Places ${r.status}${detalle ? `: ${detalle.slice(0, 200)}` : ""}`, r.status, fatal);
}

export async function buscarTexto(o: { apiKey: string; consulta: string; pageToken?: string | null; url?: string; topeMs?: number }): Promise<{ lugares: LugarGoogle[]; siguiente: string | null }> {
  const r = await fetch(`${o.url ?? PLACES_URL}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": o.apiKey,
      "X-Goog-FieldMask": [...CAMPOS.map((c) => `places.${c}`), "nextPageToken"].join(","),
    },
    body: JSON.stringify({ textQuery: o.consulta, languageCode: "es", regionCode: "MX", pageSize: 20, ...(o.pageToken ? { pageToken: o.pageToken } : {}) }),
    signal: AbortSignal.timeout(o.topeMs ?? 15_000),
  });
  if (!r.ok) throw await errorDe(r);
  const j = (await r.json()) as { places?: LugarApi[]; nextPageToken?: string };
  return { lugares: (j.places ?? []).map(aLugar).filter((x): x is LugarGoogle => x !== null), siguiente: j.nextPageToken ?? null };
}

export async function detallesLugar(o: { apiKey: string; id: string; url?: string }): Promise<LugarGoogle | null> {
  const r = await fetch(`${o.url ?? PLACES_URL}/places/${encodeURIComponent(o.id)}?languageCode=es&regionCode=MX`, {
    headers: { "X-Goog-Api-Key": o.apiKey, "X-Goog-FieldMask": CAMPOS.join(",") },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw await errorDe(r);
  return aLugar((await r.json()) as LugarApi);
}
