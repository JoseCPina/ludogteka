import type { SupabaseClient } from "@supabase/supabase-js";
import { aplicanRequisitosDe } from "./alta-requisitos";

export { aplicanRequisitosDe };

// Los perros (de la lista) que tienen al menos una cita de estética viva.
export async function perrosConCitasEstetica(supabase: SupabaseClient, perroIds: string[]): Promise<Set<string>> {
  const con = new Set<string>();
  if (perroIds.length === 0) return con;
  const { data } = await supabase
    .from("citas_estetica")
    .select("perro_id")
    .in("perro_id", perroIds)
    .is("deleted_at", null)
    .neq("estado", "cancelada")
    .limit(1000); // limite-filas-ok: acotado a los perros de una ficha, solo se usa para saber si hay alguna
  for (const f of data ?? []) con.add(f.perro_id as string);
  return con;
}
