"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../../reservas/traducir-error";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

export type EstadoReceta = { error: string | null; registros?: RegistroFinal[] };

export async function crearLineaReceta(
  servicioId: string,
  tamanoId: string,
  insumoId: string,
  cantidad: number
): Promise<EstadoReceta> {
  if (!tamanoId) return { error: "Elige un tamaño." };
  if (!insumoId) return { error: "Elige un insumo." };
  if (!cantidad || cantidad <= 0) return { error: "La cantidad debe ser mayor a cero." };

  const supabase = await createSupabaseServerClient();
  const { data: linea, error } = await supabase.from("recetas_consumo").insert({
    servicio_id: servicioId,
    tamano_id: tamanoId,
    insumo_id: insumoId,
    cantidad_consumo: cantidad,
  }).select("id").single();

  if (error) {
    if (error.code === "23505") return { error: "Ya hay una línea para este tamaño e insumo." };
    return { error: traducirError(error) };
  }

  revalidatePath(`/servicios/${servicioId}/receta`);
  return { error: null, registros: await registrosDe(supabase, [{ t: "recetas_consumo", i: linea?.id }]) };
}

export async function darDeBajaLineaReceta(servicioId: string, lineaId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("recetas_consumo").update({ deleted_at: new Date().toISOString() }).eq("id", lineaId);
  revalidatePath(`/servicios/${servicioId}/receta`);
}
