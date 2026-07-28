"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizarTelefono } from "@/lib/telefono";

export type EstadoMisDatos = { error: string | null; ok?: boolean };

export async function actualizarMisDatos(
  _estadoPrevio: EstadoMisDatos,
  formData: FormData
): Promise<EstadoMisDatos> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Recarga la página." };

  const telefono = normalizarTelefono(String(formData.get("telefono") ?? ""));
  if (!telefono) {
    return {
      error: "El teléfono debe tener 10 dígitos. Puedes escribirlo con espacios o guiones.",
    };
  }
  const email = String(formData.get("email") ?? "").trim() || null;

  const { error } = await supabase.rpc("actualizar_mi_cliente", {
    p_telefono: telefono,
    p_email: email,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un cliente activo con ese correo." };
    }
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  revalidatePath("/portal");
  return { error: null, ok: true };
}
