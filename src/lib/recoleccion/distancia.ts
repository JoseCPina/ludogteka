import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { apartarConsulta, hayLlaveMaps } from "@/lib/google-maps/cuota";
import { direccionDeCoordenadas, geocodificarDireccion } from "@/lib/google-maps/geocodificar";
import { kmEntrePuntos } from "@/lib/google-maps/ruta";
import type { Cotizacion, PuntoPartida } from "./tipos";

/**
 * Los km de una recolección salen de la DIRECCIÓN: se geocodifica (una vez por dirección y negocio) y se calcula la ruta
 * desde el punto de partida con Routes API (una vez por par origen-destino). Al llegar al tope del mes o si Google falla,
 * línea recta × 1.3 y se dice. La ubicación del celular nunca entra aquí: solo sirve para proponer una dirección
 * (`direccionDesdeUbicacion`). El resultado se guarda como cotización en el servidor: un dueño solo puede guardar esos km.
 *
 * `caller` es el cliente con la sesión de quien cotiza (personal o dueño): la base decide si puede. El resto va con la
 * secret key atada al negocio: caché, cuota y cotización no los toca nadie con sesión.
 */
export type ResultadoDistancia = { error: string | null; cotizacion?: Cotizacion; lat?: number | null; lng?: number | null; simulado?: boolean; aviso?: string | null; pedirKm?: boolean };

const TOPE_COTIZACIONES_DIA = 30;
const FACTOR_LINEA_RECTA = 1.3;
const norm = (d: string) => d.trim().replace(/\s+/g, " ").toLowerCase();
const clavePunto = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

function lineaRecta(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.ceil(2 * 6371 * Math.asin(Math.sqrt(h)) * FACTOR_LINEA_RECTA * 10) / 10;
}

async function contarIntento(admin: ReturnType<typeof createSupabaseAdminClient>, negocioId: string, clienteId: string, direccionNorm: string) {
  await admin.from("recoleccion_cotizaciones").insert({ negocio_id: negocioId, cliente_id: clienteId, direccion_norm: direccionNorm, punto: "negocio", km: 0, origen: "intento", expira_at: new Date(Date.now() - 3600_000).toISOString() });
}

async function intentosDelDia(admin: ReturnType<typeof createSupabaseAdminClient>, negocioId: string, clienteId: string): Promise<number> {
  const { count } = await admin.from("recoleccion_cotizaciones").select("id", { count: "exact", head: true }).eq("negocio_id", negocioId).eq("cliente_id", clienteId).gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  return count ?? 0;
}

export async function cotizarPorDireccion(o: { caller: SupabaseClient; negocioId: string; clienteId: string; direccion: string; punto: PuntoPartida; esDueno: boolean }): Promise<ResultadoDistancia> {
  const direccion = o.direccion.trim();
  if (direccion.length < 5) return { error: "Escribe la dirección de la recolección: calle, número y colonia." };
  const admin = createSupabaseAdminClient(o.negocioId);
  const primera = await o.caller.rpc("recoleccion_cotizar", { p_cliente: o.clienteId, p_direccion: direccion, p_lat: null, p_lng: null, p_punto: o.punto });
  if (primera.error) return { error: primera.error.message };
  const base = primera.data as Cotizacion;
  if (base.sin_tarifa) return { error: base.sin_tarifa, cotizacion: base };
  if (o.esDueno) {
    if ((await intentosDelDia(admin, o.negocioId, o.clienteId)) >= TOPE_COTIZACIONES_DIA) return { error: "Ya cotizaste varias veces hoy. Intenta mañana o pregúntale al negocio." };
  }

  const registrar = async (km: number, origen: "guardada" | "ruta" | "estimada", lat: number | null, lng: number | null, extra: Partial<ResultadoDistancia> = {}): Promise<ResultadoDistancia> => {
    const { data, error } = await admin.rpc("recoleccion_cotizacion_registrar", { p_cliente: o.clienteId, p_direccion: direccion, p_punto: o.punto, p_lat: lat, p_lng: lng, p_km: km, p_origen: origen });
    if (error) {
      console.error("[recoleccion] cotización", error.message);
      return { error: "No pudimos guardar la cotización. Intenta de nuevo." };
    }
    const q = data as Partial<Cotizacion> & { sin_tarifa: string | null };
    const cotizacion = { ...base, ...q, km, origen_km: origen } as Cotizacion;
    if (q.sin_tarifa) return { error: q.sin_tarifa, cotizacion };
    return { error: null, cotizacion, lat, lng, aviso: null, ...extra };
  };

  // La dirección guardada del cliente ya trae su distancia.
  if (base.origen_km === "guardada" && base.km != null) return registrar(Number(base.km), "guardada", base.lat_guardada, base.lng_guardada);

  const { data: puntos } = await o.caller.rpc("recoleccion_puntos_partida");
  const salida = ((puntos ?? {}) as Record<string, { lat: number | null; lng: number | null } | null>)[o.punto];
  if (salida?.lat == null || salida?.lng == null) {
    return { error: o.esDueno ? "Este negocio todavía no tiene ubicado su local en el mapa. Pregúntale por WhatsApp." : "Falta ubicar el punto de salida en el mapa. Escribe los km a mano.", pedirKm: !o.esDueno };
  }
  const origen = { lat: Number(salida.lat), lng: Number(salida.lng) };

  // ── Geocodificar, con caché ──
  const dirNorm = norm(direccion);
  let destino: { lat: number; lng: number } | null = null;
  const guardada = norm(base.direccion_guardada ?? "") === dirNorm && base.lat_guardada != null && base.lng_guardada != null;
  if (guardada) destino = { lat: Number(base.lat_guardada), lng: Number(base.lng_guardada) };
  if (!destino) {
    const { data: c } = await admin.from("maps_geocodificaciones").select("lat, lng").eq("negocio_id", o.negocioId).eq("direccion_norm", dirNorm).is("deleted_at", null).maybeSingle();
    if (c) destino = { lat: Number(c.lat), lng: Number(c.lng) };
  }
  let simulado = !hayLlaveMaps();
  if (!destino) {
    // Cada intento de un dueño cuenta para su límite del día, también si la dirección no existe.
    if (o.esDueno) await contarIntento(admin, o.negocioId, o.clienteId, dirNorm);
    // Geocodificar se aparta contra el tope pero no se bloquea: sin coordenadas ni la línea recta se puede calcular.
    if (hayLlaveMaps()) await apartarConsulta(admin, "geocodificar");
    const { data: neg } = await admin.from("negocios").select("ciudad").eq("id", o.negocioId).maybeSingle();
    const g = await geocodificarDireccion(direccion, { ciudad: (neg?.ciudad as string | null) ?? null, centro: origen, exacta: true });
    if (!g.ok) return { error: o.esDueno ? (/general/.test(g.error) ? g.error : "No encontramos esa dirección. Revisa calle, número y colonia.") : `${g.error} Escribe los km a mano.`, pedirKm: !o.esDueno };
    destino = { lat: g.lat, lng: g.lng };
    simulado = g.simulado;
    await admin.from("maps_geocodificaciones").upsert({ negocio_id: o.negocioId, direccion_norm: dirNorm, lat: g.lat, lng: g.lng }, { onConflict: "negocio_id,direccion_norm", ignoreDuplicates: true });
  }

  // ── Ruta, con caché por par origen-destino ──
  const de = clavePunto(origen.lat, origen.lng);
  const a = clavePunto(destino.lat, destino.lng);
  const { data: enCache } = await admin.from("maps_rutas").select("km").eq("negocio_id", o.negocioId).eq("origen", de).eq("destino", a).is("deleted_at", null).maybeSingle();
  if (enCache) return registrar(Number(enCache.km), "ruta", destino.lat, destino.lng, { simulado });

  const estimar = (motivo: string) => registrar(lineaRecta(origen, destino!), "estimada", destino!.lat, destino!.lng, { simulado, aviso: o.esDueno ? null : motivo });
  if (hayLlaveMaps()) {
    const cuota = await apartarConsulta(admin, "ruta");
    if (!cuota.permitida) return estimar(`Tu negocio ya usó las ${cuota.tope} consultas de Google Maps de este mes: estos km son una estimación (línea recta × 1.3). Revísalos.`);
  }
  const ruta = await kmEntrePuntos(origen, destino);
  if (!ruta.ok) {
    console.error("[recoleccion] ruta", ruta.error);
    return estimar("Google Maps no contestó: estos km son una estimación (línea recta × 1.3). Revísalos.");
  }
  await admin.from("maps_rutas").upsert({ negocio_id: o.negocioId, origen: de, destino: a, km: ruta.km }, { onConflict: "negocio_id,origen,destino", ignoreDuplicates: true });
  return registrar(ruta.km, "ruta", destino.lat, destino.lng, { simulado: simulado || ruta.simulado });
}

/** «¿Usar donde estás ahora?»: propone una dirección para que la persona la confirme. No se cobra nada con esto. */
export async function direccionDesdeUbicacion(negocioId: string, clienteId: string, lat: number, lng: number): Promise<{ error: string | null; direccion?: string }> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: "No tenemos tu ubicación." };
  const admin = createSupabaseAdminClient(negocioId);
  if ((await intentosDelDia(admin, negocioId, clienteId)) >= TOPE_COTIZACIONES_DIA) return { error: "Ya lo intentaste varias veces hoy. Escribe la dirección." };
  await contarIntento(admin, negocioId, clienteId, "ubicacion del celular");
  if (hayLlaveMaps()) {
    const cuota = await apartarConsulta(admin, "geocodificar");
    if (!cuota.permitida) return { error: "Por ahora no podemos sacar la dirección de tu ubicación. Escríbela." };
  }
  const r = await direccionDeCoordenadas(lat, lng);
  return r.ok ? { error: null, direccion: r.direccion } : { error: "No encontramos una dirección ahí. Escríbela." };
}
