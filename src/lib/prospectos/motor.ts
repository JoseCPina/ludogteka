import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SITIO } from "@/lib/peludesk/seo";
import { hoyNegocio } from "@/lib/formato";
import { correrProspeccion } from "./correr";
import { buscarTexto, PLACES_URL } from "./places";
import { revisarWeb } from "./web";
import { crearLlamarIA, MODELO_CLASIFICAR, MODELO_MENSAJES } from "./ia";
import { clasificarLote, giroDeServicios } from "./clasificar";
import { ciudadDeDireccion, procesarCalidad } from "./calidad";
import { armarLista } from "./lista";
import { mensajeDePlantilla, redactarLote } from "./mensajes";

// Arma las piezas de la prospección con las variables del servidor. Lo usan la tarea diaria y las acciones de
// /plataforma/prospectos; los scripts arman lo mismo a mano (no pueden importar con «@/»).

export const ZONA_PROSPECTOS = "America/Mexico_City";
const enPrueba = (n: string) => (process.env.VERCEL_ENV !== "production" ? process.env[n]?.trim().replace(/\/$/, "") || null : null);

export function piezas() {
  const db = createSupabaseAdminClient();
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
  const url = enPrueba("PLACES_API_URL") ?? PLACES_URL;
  const ia = process.env.ANTHROPIC_API_KEY ? crearLlamarIA({ apiKey: process.env.ANTHROPIC_API_KEY, workspace: process.env.ANTHROPIC_WORKSPACE_ID, url: enPrueba("ANTHROPIC_API_URL") ?? undefined }) : null;
  const sitio = enPrueba("PELUDESK_SITIO_URL") ?? SITIO;
  return { db, apiKey, url, ia, sitio };
}

export async function correrBusqueda(o: { origen: "cron" | "manual"; tope?: number; ciudades?: string[]; giros?: string[]; presupuestoMs: number }) {
  const { db, apiKey, url } = piezas();
  return correrProspeccion({
    db,
    apiKey,
    buscar: (consulta, pageToken) => buscarTexto({ apiKey: apiKey!, consulta, pageToken, url }),
    revisarWeb: (w) => revisarWeb(w),
    ciudadDe: ciudadDeDireccion,
    ...o,
  });
}

export async function correrCalidad(presupuestoMs: number, topeClasificar = 300) {
  const { db, ia } = piezas();
  return procesarCalidad({
    db,
    clasificar: ia ? (lote) => clasificarLote(lote, ia, MODELO_CLASIFICAR) : null,
    resumenWeb: async (w) => (await revisarWeb(w, 6000)).resumen ?? null,
    giroDeServicios,
    topeClasificar,
    presupuestoMs,
  });
}

export async function correrLista(fecha = hoyNegocio(ZONA_PROSPECTOS)) {
  const { db, ia, sitio } = piezas();
  const { data: aj } = await db.from("prospeccion_ajustes").select("firma").eq("id", 1).single();
  const firma = (aj?.firma as string) ?? "José";
  return armarLista({
    db,
    fecha,
    sitio,
    redactar: ia ? (lote) => redactarLote(lote, ia, firma, MODELO_MENSAJES) : async () => new Map(),
    plantilla: (p) => mensajeDePlantilla(p, firma),
  });
}
