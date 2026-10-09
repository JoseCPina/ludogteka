"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../reservas/traducir-error";

export type ResultadoTarifaGuarderia = { error: string | null; exito?: string };

export async function guardarTarifaGuarderia(activa: boolean, servicioTarifaId: string, incluidos: string[], dias: number): Promise<ResultadoTarifaGuarderia> {
  if (!Number.isFinite(dias) || dias < 1 || dias > 365) return { error: "Los días de actividad van de 1 a 365." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_tarifa_guarderia", {
    p_activa: activa,
    p_servicio_tarifa: servicioTarifaId || null,
    p_servicios: incluidos,
    p_dias: Math.round(dias),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/admin/tarifa-guarderia");
  revalidatePath("/estetica/nueva");
  return { error: null, exito: activa ? "Tarifa activada. Las citas nuevas de perros de guardería la proponen." : "Tarifa apagada. Las citas ya agendadas conservan su precio." };
}
