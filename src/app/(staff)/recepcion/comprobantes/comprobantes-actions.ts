"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

export type ResultadoRevision = {
  error: string | null;
  estado?: "confirmado" | "rechazado";
  fechaVencimiento?: string | null;
  registros?: RegistroFinal[];
};

// Confirmar o rechazar un comprobante que mandó el dueño. Todo lo decide
// la base (revisar_requisito_propuesto): aquí solo se le pasa la decisión.
export async function revisarComprobante(
  id: string,
  confirmar: boolean,
  motivo: string
): Promise<ResultadoRevision> {
  if (!confirmar && !motivo.trim()) {
    return { error: "Para rechazarlo escribe por qué: el dueño lo va a leer en su portal." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("revisar_requisito_propuesto", {
    p_id: id,
    p_confirmar: confirmar,
    p_motivo: confirmar ? null : motivo.trim(),
  });

  if (error) return { error: error.message || "No pudimos guardar la revisión." };

  const salida = data as { estado: "confirmado" | "rechazado"; fecha_vencimiento?: string | null; requisito_aplicado_id?: string | null } | null;
  revalidatePath("/recepcion/comprobantes");
  revalidatePath("/recepcion");
  revalidatePath("/admin");
  return {
    error: null,
    estado: salida?.estado,
    fechaVencimiento: salida?.fecha_vencimiento ?? null,
    registros: await registrosDe(supabase, [
      { t: "requisitos_sanitarios_propuestos", i: id },
      { t: "requisitos_sanitarios_aplicados", i: salida?.requisito_aplicado_id },
    ]),
  };
}
