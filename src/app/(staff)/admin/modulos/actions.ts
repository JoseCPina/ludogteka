"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { esErrorSoloLectura, MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";

export type ImpactoModulo = { pendientes: number; que: string | null };

// Lo que queda pendiente si se apaga (reservas, citas, paquetes, contratos).
export async function impactoDeApagar(modulo: string): Promise<{ error: string | null; impacto?: ImpactoModulo }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("impacto_apagar_modulo", { p_modulo: modulo });
  if (error) return { error: error.message };
  const d = data as { pendientes: number; que: string | null };
  return { error: null, impacto: { pendientes: Number(d.pendientes ?? 0), que: d.que ?? null } };
}

// Prender o apagar un módulo DENTRO del plan. La base decide si se puede.
// `confirmado`: la persona ya vio lo que queda pendiente y quiere apagarlo de
// todos modos (la base lo exige: sin esto, apagar algo con pendientes se rechaza).
export async function cambiarModulo(modulo: string, activo: boolean, confirmado = false): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cambiar_modulo", { p_modulo: modulo, p_activo: activo, p_confirmado: confirmado });
  if (error) return { error: esErrorSoloLectura(error) ? MENSAJE_SOLO_LECTURA : error.message };
  revalidatePath("/", "layout");
  return { error: null };
}
