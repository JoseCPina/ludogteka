import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * QA S62 (N164): lo que una línea cuesta EN SU CUENTA: su precio más las correcciones de precio vigentes que la tocan
 * (`cuenta_ajustes_precio`, la misma fuente que la línea «Corrección de precio» de cuenta_lineas_reserva). La cita, la
 * estancia o el cargo dicen este precio; el original queda en la línea de la corrección.
 */
export async function correccionVigenteDeLinea(supabase: SupabaseClient, tipo: "estetica" | "estancia" | "cargo", id: string): Promise<number> {
  const { data } = await supabase.from("cuenta_ajustes_precio").select("monto").eq("linea_tipo", tipo).eq("linea_id", id).is("deleted_at", null);
  return Math.round(((data ?? []) as { monto: number }[]).reduce((s, a) => s + Number(a.monto), 0) * 100) / 100;
}
