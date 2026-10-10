import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ¿Puede hacer esto en Veterinaria? El permiso, o ser médico veterinario designado
 * (la base lo decide con `vet_puede`; esto solo lo pregunta para mostrar u ocultar botones).
 */
export async function vetPuede(supabase: SupabaseClient, permiso: "registrar_vacunas" | "emitir_certificados" | "hospitalizar"): Promise<boolean> {
  const { data } = await supabase.rpc("vet_puede", { p_permiso: permiso });
  return data === true;
}

export async function vetPermisos(supabase: SupabaseClient): Promise<{ vacunas: boolean; certificados: boolean; hospitalizar: boolean }> {
  const [vacunas, certificados, hospitalizar] = await Promise.all([
    vetPuede(supabase, "registrar_vacunas"),
    vetPuede(supabase, "emitir_certificados"),
    vetPuede(supabase, "hospitalizar"),
  ]);
  return { vacunas, certificados, hospitalizar };
}
