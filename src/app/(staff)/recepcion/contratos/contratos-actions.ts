"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../reservas/traducir-error";

// Un contrato firmado con defecto (campos sin llenar en el PDF) no se
// toca: se genera uno nuevo del mismo tipo para el mismo perro, ligado a
// su paquete de guardería vigente si es de los que se generan con la
// compra. El dueño lo firma desde su portal.
export async function regenerarContrato(contratoId: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("regenerar_contrato", { p_contrato_id: contratoId });
  if (error) return { error: traducirError(error) };

  revalidatePath("/recepcion/contratos");
  revalidatePath("/recepcion");
  return { error: null };
}
