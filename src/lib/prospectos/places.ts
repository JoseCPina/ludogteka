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

// ── Para la página personalizada (peludesk.mx/para/<slug>) ───────────────────────────────────────────────────────
// Lo de Google se pide AL MOSTRAR la página y no se guarda (términos de Places: solo el place_id se conserva).
// Las fotos se muestran con la URL temporal que entrega Google (skipHttpRedirect), sin pasar la llave al
// navegador, y cada una con el nombre de quien la tomó.

export type FotoGoogle = { uri: string; autores: { nombre: string; uri: string | null }[] };
export type LugarParaPagina = {
  nombre: string;
  direccion: string | null;
  calificacion: number | null;
  resenas: number | null;
  horario: string[];
  resumen: string | null;
  mapsUri: string | null;
  fotos: FotoGoogle[];
  /** regularOpeningHours.periods tal cual (lib/web-negocio/horario los convierte). */
  periodos: { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } }[];
  /** Las reseñas que entrega Google (hasta 5), con su autor y su fecha relativa. */
  opiniones: { autor: string; autorUri: string | null; calificacion: number; texto: string; cuando: string | null }[];
};

type FotoApi = { name?: string; authorAttributions?: { displayName?: string; uri?: string }[] };

export async function detallesParaPagina(o: { apiKey: string; id: string; url?: string; fotos?: number; anchoFoto?: number }): Promise<LugarParaPagina | null> {
  const base = o.url ?? PLACES_URL;
  const r = await fetch(`${base}/places/${encodeURIComponent(o.id)}?languageCode=es&regionCode=MX`, {
    headers: {
      "X-Goog-Api-Key": o.apiKey,
      "X-Goog-FieldMask": "displayName,formattedAddress,rating,userRatingCount,regularOpeningHours.weekdayDescriptions,regularOpeningHours.periods,editorialSummary,googleMapsUri,photos,reviews",
    },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!r.ok) throw await errorDe(r);
  const j = (await r.json()) as {
    displayName?: { text?: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    regularOpeningHours?: { weekdayDescriptions?: string[]; periods?: LugarParaPagina["periodos"] };
    reviews?: { rating?: number; text?: { text?: string }; originalText?: { text?: string }; relativePublishTimeDescription?: string; authorAttribution?: { displayName?: string; uri?: string } }[];
    editorialSummary?: { text?: string };
    googleMapsUri?: string;
    photos?: FotoApi[];
  };
  const fotos = await Promise.all(
    (j.photos ?? []).slice(0, o.fotos ?? 4).map(async (f): Promise<FotoGoogle | null> => {
      if (!f.name) return null;
      try {
        const m = await fetch(`${base}/${f.name}/media?maxWidthPx=${o.anchoFoto ?? 1200}&skipHttpRedirect=true`, { headers: { "X-Goog-Api-Key": o.apiKey }, signal: AbortSignal.timeout(6_000), cache: "no-store" });
        if (!m.ok) return null;
        const uri = ((await m.json()) as { photoUri?: string }).photoUri;
        return uri ? { uri, autores: (f.authorAttributions ?? []).map((a) => ({ nombre: a.displayName ?? "Google Maps", uri: a.uri ?? null })) } : null;
      } catch {
        return null;
      }
    })
  );
  return {
    nombre: j.displayName?.text ?? "",
    direccion: j.formattedAddress ?? null,
    calificacion: typeof j.rating === "number" ? Math.round(j.rating * 10) / 10 : null,
    resenas: typeof j.userRatingCount === "number" ? j.userRatingCount : null,
    horario: j.regularOpeningHours?.weekdayDescriptions ?? [],
    resumen: j.editorialSummary?.text ?? null,
    mapsUri: j.googleMapsUri ?? null,
    fotos: fotos.filter((x): x is FotoGoogle => x !== null),
    periodos: j.regularOpeningHours?.periods ?? [],
    opiniones: (j.reviews ?? [])
      .map((r) => ({
        autor: r.authorAttribution?.displayName ?? "Cliente en Google",
        autorUri: r.authorAttribution?.uri ?? null,
        calificacion: typeof r.rating === "number" ? r.rating : 0,
        texto: (r.text?.text ?? r.originalText?.text ?? "").trim(),
        cuando: r.relativePublishTimeDescription ?? null,
      }))
      .filter((r) => r.texto.length > 0),
  };
}
