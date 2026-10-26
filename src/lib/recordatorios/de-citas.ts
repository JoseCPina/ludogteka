import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodoPorIds } from "@/lib/supabase/paginar";
import { ultimoPorCita, type RecordatorioDeCita } from "./estado";

/**
 * El último recordatorio automático de cada cita o reserva (por su id), para pintar su estado en la agenda y la
 * ficha. Lo lee el personal (RLS: solo staff del negocio). Si falla, la pantalla sigue sin el chip.
 */
export async function recordatoriosDeCitas(supabase: SupabaseClient, ids: string[]): Promise<Map<string, RecordatorioDeCita>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await leerTodoPorIds<RecordatorioDeCita, string>(ids, (bloque) =>
    supabase
      .from("recordatorios_wa")
      .select("ref_id, estado, respuesta, tipo, para_at, enviado_at")
      .in("ref_id", bloque)
      .is("deleted_at", null)
      .not("estado", "in", "(cancelado,omitido)")
      .order("id")
  );
  if (error) return new Map();
  return ultimoPorCita(data);
}
