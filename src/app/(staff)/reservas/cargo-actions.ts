"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";

export type EstadoAccion = { error: string | null };

export type ResultadoAplicarCargo = { error: string | null; cargo: { id: string; precio: number } | null };

export async function aplicarCargo(
  estanciaId: string,
  servicioId: string,
  cantidad: number,
  notas: string
): Promise<ResultadoAplicarCargo> {
  if (!servicioId) return { error: "Elige qué cargo aplicar.", cargo: null };
  if (!Number.isFinite(cantidad) || cantidad < 1) {
    return { error: "La cantidad debe ser al menos 1.", cargo: null };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cargos_aplicados")
    .insert({ estancia_id: estanciaId, servicio_id: servicioId, cantidad, notas: notas.trim() || null })
    .select("id, precio")
    .single();

  if (error) return { error: traducirError(error), cargo: null };

  revalidatePath("/reservas");
  return { error: null, cargo: { id: data.id, precio: data.precio } };
}

// Nunca se borra: se marca cancelado con motivo — es dinero, y el hueco
// clásico de caja es justo poder quitar un cargo sin dejar quién ni por
// qué.
export async function cancelarCargo(cargoId: string, motivo: string): Promise<EstadoAccion> {
  if (!motivo.trim()) return { error: "Escribe el motivo de la cancelación." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("cargos_aplicados")
    .update({ cancelado: true, motivo_cancelacion: motivo.trim() })
    .eq("id", cargoId);

  if (error) return { error: traducirError(error) };

  revalidatePath("/reservas");
  return { error: null };
}
