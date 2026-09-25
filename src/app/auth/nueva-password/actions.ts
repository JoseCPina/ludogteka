"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rutaPorRol } from "@/lib/auth/rutas";
import { esPlataforma } from "@/lib/negocio/actual";

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

  // En el dominio de la plataforma no hay negocio ni rol de negocio.
  if (await esPlataforma()) redirect("/plataforma");

  const { data: rol } = await supabase.rpc("current_rol");
  redirect(rol && rol !== "anonimo" ? rutaPorRol(rol as string) : "/sin-acceso");
}
