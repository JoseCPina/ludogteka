"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

export type EstadoConfigDescuento = { error: string | null };

// Insert-only, mismo criterio que tarifas/cupo_configuracion: cambiar el
// tope es una fila nueva con vigencia_desde = hoy, nunca un UPDATE al
// valor vigente.
export async function actualizarTopeDescuento(topeRecepcion: number): Promise<EstadoConfigDescuento> {
  if (!Number.isFinite(topeRecepcion) || topeRecepcion < 0) {
    return { error: "El tope debe ser un número mayor o igual a cero." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: hoyData } = await supabase.rpc("fecha_negocio");

  const { error } = await supabase
    .from("configuracion_descuentos")
    .insert({ vigencia_desde: hoyData, tope_recepcion: topeRecepcion });

  if (error) return { error: traducirError(error) };

  revalidatePath("/admin");
  return { error: null };
}
