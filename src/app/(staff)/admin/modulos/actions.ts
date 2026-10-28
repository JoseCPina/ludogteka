"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { esErrorSoloLectura, mensajeSoloLectura } from "@/lib/solo-lectura";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

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
export async function cambiarModulo(modulo: string, activo: boolean, confirmado = false): Promise<{ error: string | null; registros?: RegistroFinal[] }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cambiar_modulo", { p_modulo: modulo, p_activo: activo, p_confirmado: confirmado });
  if (error) return { error: esErrorSoloLectura(error) ? mensajeSoloLectura(error) : error.message };
  revalidatePath("/", "layout");
  const { data: fila } = await supabase.from("negocio_modulos").select("id").eq("modulo", modulo).is("deleted_at", null).limit(1).maybeSingle();
  return { error: null, registros: await registrosDe(supabase, [{ t: "negocio_modulos", i: fila?.id }]) };
}
