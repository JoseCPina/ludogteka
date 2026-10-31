import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { slugDe } from "@/lib/mercado/catalogo";

/**
 * «Cerca de mí» (Fase 0: lo que ya sabe la plataforma). Con la ubicación que da el celular se listan los lugares del
 * directorio (prospectos geocodificados, prospectos_cerca) por giro, con su distancia, y se marcan los que ya son
 * negocios PeluDesk (ficha reclamada). Los datos de Google en vivo, el cupo y reservar llegan en la Fase 4.
 */
export type Giro = "veterinaria" | "estetica" | "guarderia" | "hotel";
export type LugarCerca = { id: string; slug: string; nombre: string; giro: string; direccion: string | null; calificacion: number | null; resenas: number | null; distanciaM: number; servicios: string[]; enPeluDesk: boolean; fichaUrl: string };

const RADIO_M = 6000;

export async function lugaresCerca(lat: number, lng: number, giro: Giro): Promise<LugarCerca[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc("prospectos_cerca", { p_lat: lat, p_lng: lng, p_radio_m: RADIO_M, p_giro: giro });
  if (error) {
    console.error("[app] cerca", error.message);
    return [];
  }
  const filas = (data ?? []) as { id: string; slug: string; nombre: string; giro: string; ciudad: string | null; direccion: string | null; calificacion: number | null; resenas: number | null; distancia_m: number; servicios: unknown }[];
  const ids = filas.map((f) => f.id);
  const { data: reclamados } = ids.length ? await db.from("prospectos_reclamos").select("prospecto_id").in("prospecto_id", ids).eq("estado", "registrado").is("deleted_at", null) : { data: [] };
  const en = new Set(((reclamados ?? []) as { prospecto_id: string }[]).map((r) => r.prospecto_id));
  const giroFicha = (g: string) => (["estetica", "hotel", "guarderia", "veterinaria"].includes(g) ? g : giro);
  return filas.slice(0, 30).map((f) => ({
    id: f.id, slug: f.slug, nombre: f.nombre, giro: f.giro, direccion: f.direccion, calificacion: f.calificacion, resenas: f.resenas, distanciaM: f.distancia_m,
    servicios: Array.isArray(f.servicios) ? (f.servicios as string[]) : [], enPeluDesk: en.has(f.id),
    fichaUrl: `https://peludesk.mx/directorio/${giroFicha(f.giro)}/${slugDe(f.ciudad ?? "mexico")}/${f.slug}`,
  }));
}

export const distanciaTexto = (m: number) => (m < 950 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);
