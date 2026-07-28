"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoMiPerroForm = { error: string | null; ok?: boolean };

export async function actualizarMiPerro(
  perroId: string,
  _estadoPrevio: EstadoMiPerroForm,
  formData: FormData
): Promise<EstadoMiPerroForm> {
  const supabase = await createSupabaseServerClient();

  const topeCrudo = String(formData.get("tope_gasto_autorizado") ?? "").trim();
  const tope = topeCrudo ? Number(topeCrudo.replace(",", ".")) : null;
  if (topeCrudo && Number.isNaN(tope)) {
    return { error: "El tope de gasto debe ser un número." };
  }

  const { error } = await supabase.rpc("actualizar_mi_perro", {
    p_perro_id: perroId,
    p_contacto_emergencia_nombre:
      String(formData.get("contacto_emergencia_nombre") ?? "").trim() || null,
    p_contacto_emergencia_telefono:
      String(formData.get("contacto_emergencia_telefono") ?? "").trim() || null,
    p_veterinario_nombre: String(formData.get("veterinario_nombre") ?? "").trim() || null,
    p_veterinario_telefono: String(formData.get("veterinario_telefono") ?? "").trim() || null,
    p_veterinario_clinica: String(formData.get("veterinario_clinica") ?? "").trim() || null,
    p_autorizacion_medica_notas:
      String(formData.get("autorizacion_medica_notas") ?? "").trim() || null,
    p_tope_gasto_autorizado: tope,
    p_alimentacion_notas: String(formData.get("alimentacion_notas") ?? "").trim() || null,
  });

  if (error) return { error: "No pudimos guardar los cambios. Intenta de nuevo." };

  revalidatePath("/portal");
  revalidatePath(`/portal/perros/${perroId}`);
  return { error: null, ok: true };
}
