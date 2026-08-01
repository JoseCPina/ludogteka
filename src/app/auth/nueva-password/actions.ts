"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rutaPorRol } from "@/lib/auth/rutas";

export type EstadoNuevaPassword = { error: string | null };

export async function definirPassword(
  _estadoPrevio: EstadoNuevaPassword,
  formData: FormData
): Promise<EstadoNuevaPassword> {
  const password = String(formData.get("password") ?? "");
  const confirmacion = String(formData.get("confirmacion") ?? "");

  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }
  if (password !== confirmacion) {
    return { error: "Las contraseñas no coinciden." };
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Tu sesión de invitación expiró. Pide un link nuevo." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "No pudimos guardar tu contraseña. Intenta de nuevo en un momento." };
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  redirect(rutaPorRol(perfil?.rol));
}
