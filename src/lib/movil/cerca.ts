import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PLACES_URL, type LugarParaPagina } from "@/lib/prospectos/places";
import { lugarDeGoogle } from "@/lib/web-negocio/google";
import { resenasPublicasDeNegocio } from "@/lib/landing/resenas";
import { resolverCiudad, rangoDe } from "@/lib/mercado/rangos";
import { SERVICIO_PRINCIPAL, servicioMercado, slugDe, type GiroMercado } from "@/lib/mercado/catalogo";
import { vinculosApp } from "@/lib/app/negocios";

/**
 * «Cerca de mí» de la app nativa (Fase 4, docs/app-duenos/FASE-4.md).
 *
 * Dos fuentes, una lista: el DIRECTORIO de PeluDesk (prospectos geocodificados; los que ya son negocios PeluDesk van
 * primero y marcados, con su cupo de hotel de esta noche) y GOOGLE EN VIVO (Places API, Text Search) para lo que el
 * directorio no tiene: abiertas ahora, urgencias 24 h, lugares pet friendly y tiendas. Lo de Google se muestra con su
 * atribución y no se guarda; se recuerda 30 minutos por zona (~1 km) y categoría para cuidar el costo por llamada.
 * Al lado de cada categoría con precios, el rango del Índice de precios de esa ciudad.
 */
export type Categoria = "veterinaria" | "abiertas" | "urgencias" | "estetica" | "guarderia" | "hotel" | "petfriendly" | "tienda";
export const CATEGORIAS: Categoria[] = ["veterinaria", "abiertas", "urgencias", "estetica", "guarderia", "hotel", "petfriendly", "tienda"];
export type TipoPin = "veterinaria" | "urgencias" | "estetica" | "guarderia" | "hotel" | "petfriendly" | "tienda";

export type LugarMapa = {
  id: string;
  fuente: "directorio" | "google";
  nombre: string;
  tipo: TipoPin;
  subtipo: string | null;
  lat: number;
  lng: number;
  distanciaM: number;
  direccion: string | null;
  calificacion: number | null;
  resenas: number | null;
  telefono: string | null;
  whatsapp: string | null;
  aceptaClientes?: boolean;
  abiertoAhora: boolean | null;
  enPeluDesk: boolean;
  negocioId: string | null;
  /** Las mascotas del dueño que ya tienen expediente ahí: «Pedir cita»/«Reservar» abren el flujo de la app. */
  mascotasConVinculo: string[];
  cupoEstaNoche: { hayCupo: boolean; disponible: number } | null;
  googlePlaceId: string | null;
  mapsUri: string | null;
  fichaUrl: string | null;
};
export type PrecioZona = { servicio: string; desde: number; hasta: number; lugar: string } | null;
export type RespuestaCerca = { error: null; lugares: LugarMapa[]; precio: PrecioZona; atribucionGoogle: boolean };

const RADIO_M = 6000;
const GIROS_DIRECTORIO: Partial<Record<Categoria, string>> = { veterinaria: "veterinaria", estetica: "estetica", guarderia: "guarderia", hotel: "hotel" };
const GIRO_MERCADO: Partial<Record<Categoria, GiroMercado>> = { veterinaria: "veterinaria", abiertas: "veterinaria", urgencias: "veterinaria", estetica: "estetica", guarderia: "guarderia", hotel: "hotel" };

const valida = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function distancia(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

/** negocio → las mascotas del dueño con expediente ahí. */
async function mascotasPorNegocio(): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>();
  for (const v of await vinculosApp().catch(() => [])) m.set(v.negocioId, [...(m.get(v.negocioId) ?? []), v.mascotaId]);
  return m;
}

// ── Directorio de PeluDesk ───────────────────────────────────────────────
type FilaCerca = { id: string; slug: string; nombre: string; giro: string; ciudad: string | null; direccion: string | null; calificacion: number | null; resenas: number | null; lat: number; lng: number; distancia_m: number; servicios: unknown };

async function delDirectorio(lat: number, lng: number, giro: string | null): Promise<{ lugares: LugarMapa[]; ciudad: string | null }> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc("prospectos_cerca", { p_lat: lat, p_lng: lng, p_radio_m: RADIO_M, p_giro: giro });
  if (error) {
    console.error("[movil] cerca directorio", error.message);
    return { lugares: [], ciudad: null };
  }
  const filas = ((data ?? []) as FilaCerca[]).slice(0, 80);
  if (!filas.length) return { lugares: [], ciudad: null };
  const ids = filas.map((f) => f.id);
  const [{ data: extra }, { data: reclamos }] = await Promise.all([
    db.from("prospectos").select("id, telefono, whatsapp, google_place_id, negocio_cliente_id").in("id", ids),
    db.from("prospectos_reclamos").select("prospecto_id, negocio_id").in("prospecto_id", ids).eq("estado", "registrado").is("deleted_at", null),
  ]);
  const porId = new Map(((extra ?? []) as { id: string; telefono: string | null; whatsapp: string | null; google_place_id: string | null; negocio_cliente_id: string | null }[]).map((e) => [e.id, e]));
  const reclamado = new Map(((reclamos ?? []) as { prospecto_id: string; negocio_id: string | null }[]).map((r) => [r.prospecto_id, r.negocio_id]));
  const vinculos = await mascotasPorNegocio();
  const tipoDe = (f: FilaCerca): TipoPin => {
    const s = Array.isArray(f.servicios) ? (f.servicios as string[]) : [];
    if (giro && ["veterinaria", "estetica", "guarderia", "hotel"].includes(giro)) return giro as TipoPin;
    return (["veterinaria", "estetica", "guarderia", "hotel"].find((g) => f.giro === g || s.includes(g)) as TipoPin) ?? "estetica";
  };
  const lugares = filas.map((f): LugarMapa => {
    const e = porId.get(f.id);
    const negocioId = e?.negocio_cliente_id ?? reclamado.get(f.id) ?? null;
    const wa = (e?.whatsapp ?? "").replace(/\D/g, "");
    return {
      id: `d:${f.id}`, fuente: "directorio", nombre: f.nombre, tipo: tipoDe(f), subtipo: null, lat: f.lat, lng: f.lng, distanciaM: f.distancia_m,
      direccion: f.direccion, calificacion: f.calificacion === null ? null : Number(f.calificacion), resenas: f.resenas, telefono: e?.telefono ?? null,
      whatsapp: wa ? (wa.length === 10 ? `52${wa}` : wa) : null, abiertoAhora: null, enPeluDesk: Boolean(negocioId || reclamado.has(f.id)), negocioId,
      mascotasConVinculo: negocioId ? (vinculos.get(negocioId) ?? []) : [], cupoEstaNoche: null, googlePlaceId: e?.google_place_id ?? null, mapsUri: null,
      fichaUrl: `https://peludesk.mx/directorio/${["estetica", "hotel", "guarderia", "veterinaria"].includes(f.giro) ? f.giro : tipoDe(f)}/${slugDe(f.ciudad ?? "mexico")}/${f.slug}`,
    };
  });
  return { lugares, ciudad: filas.find((f) => f.ciudad)?.ciudad ?? null };
}

/** Hoteles PeluDesk: su cupo de esta noche, de la base (la misma cuenta que valida una reserva). */
async function ponerCupo(lugares: LugarMapa[]) {
  await Promise.all(
    lugares
      .filter((l) => l.negocioId && l.tipo === "hotel")
      .map(async (l) => {
        const { data: c } = await createSupabaseAdminClient(l.negocioId!).rpc("cerca_cupo_hotel_esta_noche");
        const cupo = c as { hotel?: boolean; hay_cupo?: boolean; disponible?: number } | null;
        if (cupo?.hotel) l.cupoEstaNoche = { hayCupo: Boolean(cupo.hay_cupo), disponible: Number(cupo.disponible ?? 0) };
      })
  );
}

// ── Negocios PeluDesk por la ubicación de su sucursal (aunque no estén en el directorio) ──
type FilaPeluDesk = { negocio_id: string; nombre: string; slug: string; dominio: string | null; url_publica: string | null; sucursal: string | null; lat: number; lng: number; distancia_m: number; whatsapp: string | null; categorias: string[] };

async function dePeluDesk(lat: number, lng: number, categoria: Categoria): Promise<LugarMapa[]> {
  if (!["estetica", "guarderia", "hotel"].includes(categoria)) return [];
  const { data, error } = await createSupabaseAdminClient().rpc("cerca_negocios_peludesk", { p_lat: lat, p_lng: lng, p_km: RADIO_M / 1000 });
  if (error) {
    console.error("[movil] cerca peludesk", error.message);
    return [];
  }
  const vinculos = await mascotasPorNegocio();
  return ((data ?? []) as FilaPeluDesk[])
    .filter((n) => (n.categorias ?? []).includes(categoria))
    .map((n): LugarMapa => {
      const wa = (n.whatsapp ?? "").replace(/\D/g, "");
      return {
        id: `p:${n.negocio_id}`, fuente: "directorio", nombre: n.nombre, tipo: categoria as TipoPin, subtipo: null, lat: n.lat, lng: n.lng, distanciaM: n.distancia_m,
        direccion: n.sucursal, calificacion: null, resenas: null, telefono: null, whatsapp: wa ? (wa.length === 10 ? `52${wa}` : wa) : null, abiertoAhora: null,
        enPeluDesk: true, negocioId: n.negocio_id, mascotasConVinculo: vinculos.get(n.negocio_id) ?? [], cupoEstaNoche: null, googlePlaceId: null, mapsUri: null,
        fichaUrl: n.url_publica ?? (n.dominio ? `https://${n.dominio}` : `https://${n.slug}.peludesk.mx`),
      };
    });
}

// ── Google en vivo ───────────────────────────────────────────────────────
type BusquedaGoogle = { consulta: string; tipoIncluido?: string; abiertos?: boolean; tipo: TipoPin; subtipo?: string };
const BUSQUEDAS: Partial<Record<Categoria, BusquedaGoogle[]>> = {
  abiertas: [{ consulta: "veterinaria", tipoIncluido: "veterinary_care", abiertos: true, tipo: "veterinaria" }],
  urgencias: [{ consulta: "veterinaria urgencias 24 horas", tipoIncluido: "veterinary_care", abiertos: true, tipo: "urgencias" }],
  petfriendly: [
    { consulta: "parque para perros", tipoIncluido: "park", tipo: "petfriendly", subtipo: "parque" },
    { consulta: "restaurante pet friendly", tipoIncluido: "restaurant", tipo: "petfriendly", subtipo: "restaurante" },
    { consulta: "café pet friendly", tipoIncluido: "cafe", tipo: "petfriendly", subtipo: "cafe" },
    { consulta: "hotel que acepta mascotas", tipoIncluido: "lodging", tipo: "petfriendly", subtipo: "hotel" },
  ],
  tienda: [{ consulta: "tienda de mascotas", tipoIncluido: "pet_store", tipo: "tienda" }],
};
const CAMPOS_GOOGLE = ["id", "displayName", "formattedAddress", "location", "rating", "userRatingCount", "currentOpeningHours.openNow", "nationalPhoneNumber", "internationalPhoneNumber", "googleMapsUri", "businessStatus"];

type LugarGoogleApi = { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; rating?: number; userRatingCount?: number; currentOpeningHours?: { openNow?: boolean }; nationalPhoneNumber?: string; internationalPhoneNumber?: string; googleMapsUri?: string; businessStatus?: string };

const buscarEnGoogle = unstable_cache(
  async (b: BusquedaGoogle, latR: number, lngR: number): Promise<LugarGoogleApi[]> => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) return [];
    const url = process.env.VERCEL_ENV !== "production" ? process.env.PLACES_API_URL?.trim() || PLACES_URL : PLACES_URL;
    const r = await fetch(`${url}/places:searchText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": CAMPOS_GOOGLE.map((c) => `places.${c}`).join(",") },
      body: JSON.stringify({
        textQuery: b.consulta, languageCode: "es", regionCode: "MX", pageSize: 20, ...(b.tipoIncluido ? { includedType: b.tipoIncluido, strictTypeFiltering: false } : {}), ...(b.abiertos ? { openNow: true } : {}),
        locationBias: { circle: { center: { latitude: latR, longitude: lngR }, radius: RADIO_M } },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.error("[movil] google", r.status, (await r.text()).slice(0, 200));
      return [];
    }
    return (((await r.json()) as { places?: LugarGoogleApi[] }).places ?? []).filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY");
  },
  ["movil-cerca-google"],
  { revalidate: 1800 }
);

async function deGoogle(lat: number, lng: number, categoria: Categoria): Promise<LugarMapa[]> {
  const busquedas = BUSQUEDAS[categoria] ?? [];
  // La zona se redondea (~1 km) para que la caché sirva a todos los que están cerca.
  const latR = Math.round(lat * 100) / 100, lngR = Math.round(lng * 100) / 100;
  const respuestas = await Promise.all(busquedas.map((b) => buscarEnGoogle(b, latR, lngR).then((ls) => ls.map((l) => ({ l, b })))));
  const vistos = new Set<string>();
  const salida: LugarMapa[] = [];
  for (const { l, b } of respuestas.flat()) {
    const la = l.location?.latitude, ln = l.location?.longitude;
    if (!l.id || vistos.has(l.id) || typeof la !== "number" || typeof ln !== "number") continue;
    vistos.add(l.id);
    const d = distancia({ lat, lng }, { lat: la, lng: ln });
    if (d > RADIO_M * 1.5) continue;
    const tel = (l.nationalPhoneNumber ?? "").replace(/\D/g, "");
    salida.push({
      id: `g:${l.id}`, fuente: "google", nombre: l.displayName?.text ?? "Lugar", tipo: b.tipo, subtipo: b.subtipo ?? null, lat: la, lng: ln, distanciaM: d,
      direccion: l.formattedAddress ?? null, calificacion: typeof l.rating === "number" ? Math.round(l.rating * 10) / 10 : null, resenas: l.userRatingCount ?? null,
      telefono: tel || null, whatsapp: null, abiertoAhora: typeof l.currentOpeningHours?.openNow === "boolean" ? l.currentOpeningHours.openNow : null,
      enPeluDesk: false, negocioId: null, mascotasConVinculo: [], cupoEstaNoche: null, googlePlaceId: l.id, mapsUri: l.googleMapsUri ?? null, fichaUrl: null,
    });
  }
  return salida;
}

/** El rango del Índice de precios del servicio principal de la categoría, en la ciudad (o el estado, o el país). */
async function precioDeZona(categoria: Categoria, ciudad: string | null): Promise<PrecioZona> {
  const giro = GIRO_MERCADO[categoria];
  if (!giro) return null;
  const servicio = SERVICIO_PRINCIPAL[giro];
  const c = await resolverCiudad(giro, ciudad);
  const r = await rangoDe({ giro, servicio, ciudad: c, talla: null });
  if (r.nivel === "sin_datos" || r.p25 == null || r.p75 == null) return null;
  return { servicio: servicioMercado(servicio)?.nombre ?? servicio, desde: Math.round(r.p25), hasta: Math.round(r.p75), lugar: r.lugar ?? c?.nombre ?? "México" };
}

export async function cercaDeMi(lat: number, lng: number, categoria: Categoria): Promise<RespuestaCerca | { error: string }> {
  if (!valida(lat, lng)) return { error: "No pudimos leer tu ubicación." };
  if (!CATEGORIAS.includes(categoria)) return { error: "Escoge qué buscar." };
  const giro = GIROS_DIRECTORIO[categoria] ?? (categoria === "abiertas" || categoria === "urgencias" ? "veterinaria" : null);
  const [dir, google, peludesk] = await Promise.all([giro ? delDirectorio(lat, lng, giro) : Promise.resolve({ lugares: [] as LugarMapa[], ciudad: null }), deGoogle(lat, lng, categoria), dePeluDesk(lat, lng, categoria)]);
  // Un negocio PeluDesk que ya está en el directorio se queda una vez (con la ficha del directorio).
  const yaEstan = new Set(dir.lugares.map((l) => l.negocioId).filter(Boolean));
  dir.lugares.push(...peludesk.filter((p) => !yaEstan.has(p.negocioId)));
  await ponerCupo(dir.lugares);
  // Quién recibe clientes nuevos desde la app (docs/app-duenos/FASE-3.md).
  const conNegocio = [...new Set(dir.lugares.map((l) => l.negocioId).filter(Boolean))] as string[];
  if (conNegocio.length) {
    const { data: aceptan } = await createSupabaseAdminClient().from("negocios").select("id, acepta_clientes_app").in("id", conNegocio);
    const siAcepta = new Set(((aceptan ?? []) as { id: string; acepta_clientes_app: boolean }[]).filter((n) => n.acepta_clientes_app).map((n) => n.id));
    for (const l of dir.lugares) l.aceptaClientes = Boolean(l.negocioId && siAcepta.has(l.negocioId));
  }
  // Un lugar de Google que ya está en el directorio se queda con la ficha del directorio (y su marca PeluDesk).
  const porPlace = new Map(dir.lugares.filter((l) => l.googlePlaceId).map((l) => [l.googlePlaceId!, l]));
  for (const g of google) {
    const d = g.googlePlaceId ? porPlace.get(g.googlePlaceId) : null;
    if (d) {
      d.abiertoAhora = g.abiertoAhora;
      d.mapsUri = g.mapsUri;
      if (categoria === "urgencias") d.tipo = "urgencias";
    }
  }
  let lugares: LugarMapa[];
  if (categoria === "abiertas" || categoria === "urgencias") {
    // Solo lo que Google dice que está abierto ahora (los del directorio que coinciden, más los de Google).
    lugares = [...dir.lugares.filter((l) => l.abiertoAhora === true), ...google.filter((g) => !(g.googlePlaceId && porPlace.has(g.googlePlaceId)))];
  } else {
    lugares = [...dir.lugares, ...google];
  }
  // PeluDesk primero (y, en hoteles, los que tienen cupo esta noche antes que los llenos); después, por distancia.
  const peso = (l: LugarMapa) => (l.enPeluDesk ? (l.cupoEstaNoche && !l.cupoEstaNoche.hayCupo ? 1 : 0) : 2);
  lugares.sort((a, b) => peso(a) - peso(b) || a.distanciaM - b.distanciaM);
  const precio = await precioDeZona(categoria, dir.ciudad);
  return { error: null, lugares: lugares.slice(0, 60), precio, atribucionGoogle: lugares.some((l) => l.fuente === "google" || l.googlePlaceId) };
}

// ── La ficha de un lugar (hoja) ──────────────────────────────────────────
export type FichaLugar = {
  error: null;
  google: (Pick<LugarParaPagina, "horario" | "resumen" | "mapsUri" | "calificacion" | "resenas" | "opiniones"> & { fotos: { uri: string; autor: string | null }[] }) | null;
  resenasPeluDesk: { total: number; promedio: number | null; ultimas: { estrellas: number; texto: string | null; quien: string }[] } | null;
};

export async function fichaDeLugar(o: { googlePlaceId: string | null; negocioId: string | null }): Promise<FichaLugar> {
  const [g, r] = await Promise.all([
    o.googlePlaceId && /^[A-Za-z0-9_-]{10,300}$/.test(o.googlePlaceId) ? lugarDeGoogle(o.googlePlaceId, { fotos: 4, anchoFoto: 900 }) : Promise.resolve(null),
    o.negocioId && /^[0-9a-f-]{36}$/i.test(o.negocioId) ? resenasPublicasDeNegocio(o.negocioId) : Promise.resolve(null),
  ]);
  return {
    error: null,
    google: g
      ? { horario: g.horario, resumen: g.resumen, mapsUri: g.mapsUri, calificacion: g.calificacion, resenas: g.resenas, opiniones: g.opiniones.slice(0, 3), fotos: g.fotos.map((f) => ({ uri: f.uri, autor: f.autores[0]?.nombre ?? null })) }
      : null,
    resenasPeluDesk: r && r.total ? { total: r.total, promedio: r.promedio, ultimas: r.ultimas.slice(0, 3).map((x) => ({ estrellas: x.estrellas, texto: x.texto, quien: x.quien })) } : null,
  };
}
