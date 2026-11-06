import type { SupabaseClient } from "@supabase/supabase-js";
import type { Recoleccion, RecoleccionDia } from "./tipos";

const COLUMNAS =
  "id, reserva_id, estancia_id, cita_id, perro_id, cliente_id, fecha, hora_estimada, direccion, lat, lng, punto_partida, km, precio, cargo_id, estado, salio_at, recogido_at, cancelada_at, motivo_cancelacion, notas, updated_at";

/** Las recolecciones de una reserva (vivas y canceladas), con la sesión del personal (RLS). */
export async function recoleccionesDeReserva(supabase: SupabaseClient, reservaId: string): Promise<Recoleccion[]> {
  const { data } = await supabase.from("recolecciones").select(COLUMNAS).eq("reserva_id", reservaId).is("deleted_at", null).order("created_at");
  return (data ?? []) as Recoleccion[];
}

/** La recolección viva de una cita (o la última cancelada si no hay viva). */
export async function recoleccionDeCita(supabase: SupabaseClient, citaId: string): Promise<Recoleccion | null> {
  const { data } = await supabase.from("recolecciones").select(COLUMNAS).eq("cita_id", citaId).is("deleted_at", null).order("created_at", { ascending: false });
  const filas = (data ?? []) as Recoleccion[];
  return filas.find((r) => r.estado !== "cancelada") ?? filas[0] ?? null;
}

/** La lista del día, ordenada por punto de partida y cercanía (recolecciones_dia). */
export async function recoleccionesDelDia(supabase: SupabaseClient, fecha: string): Promise<RecoleccionDia[]> {
  const { data, error } = await supabase.rpc("recolecciones_dia", { p_fecha: fecha });
  if (error) {
    console.error("recolecciones_dia:", error.message);
    return [];
  }
  return (data ?? []) as RecoleccionDia[];
}

export type PuntosPartida = { negocio: { direccion: string | null; lat: number | null; lng: number | null } | null; base: { direccion: string | null; lat: number | null; lng: number | null } | null };

export async function puntosDePartida(supabase: SupabaseClient): Promise<PuntosPartida> {
  const { data } = await supabase.rpc("recoleccion_puntos_partida");
  const d = (data ?? {}) as Partial<PuntosPartida>;
  return { negocio: d.negocio ?? null, base: d.base ?? null };
}
