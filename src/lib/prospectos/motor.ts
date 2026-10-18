import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SITIO } from "@/lib/peludesk/seo";
import { hoyNegocio } from "@/lib/formato";
import { correrProspeccion, leerAjustes } from "./correr";
import { ciudadesNacionales, estimarCosto } from "./nacional";
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

const GIROS_TODOS = ["guarderia", "hotel", "estetica", "veterinaria"];

/** Cuántas búsquedas a Google van en el mes (corridas de prospección), para descontar las 1,000 gratis. */
async function busquedasDelMes(db: ReturnType<typeof piezas>["db"]): Promise<number> {
  const desde = new Date();
  desde.setUTCDate(1);
  desde.setUTCHours(0, 0, 0, 0);
  let total = 0;
  for (let desplaza = 0; ; desplaza += 1000) {
    const { data } = await db.from("prospeccion_corridas").select("busquedas").gte("inicio_at", desde.toISOString()).order("inicio_at").order("id").range(desplaza, desplaza + 999);
    for (const f of data ?? []) total += Number(f.busquedas) || 0;
    if ((data ?? []).length < 1000) break;
  }
  return total;
}

/** Cuánto costaría recorrer la lista nacional (o los estados / zonas pedidos), sin llamar a Google. */
export async function estimarNacional(f: { estados?: string[]; zonas?: string[]; giros?: string[]; topeDiario?: number; precioPor1000Usd?: number }) {
  const { db } = piezas();
  const ajustes = await leerAjustes(db);
  const giros = (f.giros?.length ? f.giros : GIROS_TODOS).filter((g) => GIROS_TODOS.includes(g));
  const ciudades = ciudadesNacionales(f);
  const consultas = giros.reduce((n, g) => n + (ajustes.consultas[g]?.length ?? 0), 0);
  return { ...estimarCosto({ ciudades: ciudades.length, consultasPorCiudad: consultas, paginasPorConsulta: ajustes.paginas_por_consulta, yaUsadasEsteMes: await busquedasDelMes(db), topeDiario: f.topeDiario, precioPor1000Usd: f.precioPor1000Usd }), giros };
}

/**
 * Una tanda de la prospección nacional: las combinaciones ciudad + consulta que llevan más sin buscarse (las nunca
 * buscadas primero), hasta `tope` búsquedas. Llamarla cada día es la rotación: la siguiente tanda sigue donde quedó.
 */
export async function correrNacional(o: { tope: number; estados?: string[]; zonas?: string[]; giros?: string[]; presupuestoMs: number }) {
  const ajustes = await leerAjustes(piezas().db);
  if (ajustes.pausado) return { pausada: true as const };
  return correrBusqueda({ origen: "manual", tope: o.tope, ciudades: ciudadesNacionales(o), giros: o.giros, presupuestoMs: o.presupuestoMs });
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
  const { data: aj } = await db.from("prospeccion_ajustes").select("firma, whatsapp_ventas").eq("id", 1).single();
  const firma = (aj?.firma as string) ?? "José";
  const whatsapp = (aj?.whatsapp_ventas as string | undefined) ?? null;
  return armarLista({
    db,
    fecha,
    sitio,
    redactar: ia ? (lote) => redactarLote(lote, ia, firma, MODELO_MENSAJES, whatsapp) : async () => new Map(),
    plantilla: (p) => mensajeDePlantilla(p, firma, whatsapp),
  });
}
