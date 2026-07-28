"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rutaPorRol } from "@/lib/auth/rutas";

export type EstadoLogin = { error: string | null };

export async function iniciarSesion(
  _estadoPrevio: EstadoLogin,
  formData: FormData
): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa tu correo y tu contraseña." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Tu correo todavía no está confirmado. Revisa tu bandeja de entrada." };
    }
    if (error.code === "invalid_credentials") {
      return { error: "Correo o contraseña incorrectos." };
    }
    return { error: "No pudimos iniciar sesión. Intenta de nuevo en un momento." };
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", data.user.id)
    .single();

  redirect(rutaPorRol(perfil?.rol));
}
