import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lo llaman las acciones de servidor cuando un formulario se guardó bien: el
 * borrador ya no hace falta. Nunca rompe el guardado si falla.
 */
export async function descartarBorradorGuardado(supabase: SupabaseClient, formulario: string, clave = ""): Promise<void> {
  try {
    await supabase.rpc("borrador_descartar", { p_formulario: formulario, p_clave: clave });
  } catch {
    /* un borrador que sobra no es un error del guardado */
  }
}
