"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rutaPorRol } from "@/lib/auth/rutas";
import { esPlataforma, negocioActual } from "@/lib/negocio/actual";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MARCA_CAMBIO_PASSWORD, debeCambiarPassword } from "@/lib/auth/cambio-obligatorio";

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
    if (/same|different from the old/i.test(error.message)) return { error: "Escoge una contraseña distinta a la temporal." };
    return { error: "No pudimos guardar tu contraseña. Intenta de nuevo en un momento." };
  }

  // R35: si era una contraseña temporal, se quita la marca (solo la secret key escribe app_metadata).
  if (debeCambiarPassword(user)) {
    const admin = (await esPlataforma()) ? createSupabaseAdminClient() : createSupabaseAdminClient((await negocioActual()).id);
    const { error: errorMarca } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { [MARCA_CAMBIO_PASSWORD]: false } });
    if (errorMarca) return { error: "Tu contraseña nueva quedó guardada, pero no pudimos terminar. Intenta de nuevo." };
  }

  // En el dominio de la plataforma no hay negocio ni rol de negocio.
  if (await esPlataforma()) redirect("/plataforma");

  const { data: rol } = await supabase.rpc("current_rol");
  redirect(rol && rol !== "anonimo" ? rutaPorRol(rol as string) : "/sin-acceso");
}
