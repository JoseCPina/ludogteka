"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../reservas/traducir-error";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

export type ResultadoPoliticaSalida = { error: string | null; exito?: string; registros?: RegistroFinal[] };

/** N132: si la salida anticipada ajusta la cuenta a lo usado (por omisión) o se cobra la estancia completa. */
export async function guardarPoliticaSalida(completa: boolean): Promise<ResultadoPoliticaSalida> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_politica_salida_anticipada", { p_completa: completa });
  if (error) return { error: traducirError(error) };
  revalidatePath("/admin/hotel");
  const { data: ajustes } = await supabase.from("negocio_ajustes_operacion").select("id").is("deleted_at", null).limit(1).maybeSingle();
  return {
    registros: await registrosDe(supabase, [{ t: "negocio_ajustes_operacion", i: ajustes?.id }]),
    error: null,
    exito: completa
      ? "Listo: si un perro sale antes, se cobra la estancia completa y el check-out lo avisa."
      : "Listo: si un perro sale antes, la cuenta baja a las noches (o días) que usó y el check-out lo dice antes de confirmar.",
  };
}
