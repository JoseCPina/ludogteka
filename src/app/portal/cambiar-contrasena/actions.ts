"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getUserConReintento } from "@/lib/supabase/get-user";
import { negocioActual } from "@/lib/negocio/actual";
import { MARCA_CAMBIO_PASSWORD } from "@/lib/auth/cambio-obligatorio";
import { MIN_CONTRASENA, TEXTO_CONTRASENA_CORTA } from "@/lib/auth/contrasena";

export type EstadoCambioContrasena = { error: string | null };

export async function cambiarMiContrasena(
  _previo: EstadoCambioContrasena,
  formData: FormData
): Promise<EstadoCambioContrasena> {
  const password = String(formData.get("password") ?? "");
  const confirmacion = String(formData.get("confirmacion") ?? "");
  if (password.length < MIN_CONTRASENA) return { error: TEXTO_CONTRASENA_CORTA };
  if (password !== confirmacion) return { error: "Las contraseñas no coinciden." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await getUserConReintento(supabase);
  if (!user) return { error: "Tu sesión terminó. Vuelve a entrar con tu teléfono y la contraseña temporal." };

  // Con la sesión de la persona: es ELLA quien cambia su contraseña.
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/same|different from the old/i.test(error.message)) {
      return { error: "Escoge una contraseña distinta a la temporal." };
    }
    if (/weak|short|characters/i.test(error.message)) {
      return { error: "Esa contraseña es muy débil. Escoge otra más larga." };
    }
    return { error: "No pudimos guardar tu contraseña. Intenta de nuevo en un momento." };
  }

  // Ya cambiada, se quita la marca. Solo la secret key puede escribir app_metadata (la Admin API de Auth no toca
  // tablas de negocio). Si falla, la contraseña nueva ya sirve y la pantalla se la volverá a pedir: no se pierde nada.
  const negocio = await negocioActual();
  const { error: errorMarca } = await createSupabaseAdminClient(negocio.id).auth.admin.updateUserById(user.id, {
    app_metadata: { [MARCA_CAMBIO_PASSWORD]: false },
  });
  if (errorMarca) {
    console.error("[cambiar-contrasena] no se quitó la marca", errorMarca.message);
    return { error: "Tu contraseña nueva quedó guardada, pero no pudimos terminar. Intenta de nuevo." };
  }

  redirect("/portal?contrasena=cambiada");
}
