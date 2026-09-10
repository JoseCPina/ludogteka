"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { rutaPorRol } from "@/lib/auth/rutas";
import { clasificarIdentificador } from "@/lib/auth/identidad";

export type EstadoLogin = { error: string | null };

export async function iniciarSesion(
  _estadoPrevio: EstadoLogin,
  formData: FormData
): Promise<EstadoLogin> {
  const identificador = String(formData.get("identificador") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!identificador || !password) {
    return { error: "Ingresa tu teléfono o correo y tu contraseña." };
  }

  const quien = clasificarIdentificador(identificador);
  if (quien.tipo === "invalido") {
    return { error: "Escribe tu teléfono a diez dígitos, o tu correo completo." };
  }

  let email: string;

  if (quien.tipo === "email") {
    email = quien.email;
  } else {
    // El teléfono no es lo que Auth conoce: hay que averiguar de qué
    // cuenta se trata. Se hace con la secret key y del lado del servidor
    // — el correo resuelto nunca llega al navegador, ni siquiera al del
    // dueño de la cuenta.
    const admin = createSupabaseAdminClient();
    const { data } = await admin.rpc("email_de_login_por_telefono", {
      p_telefono: quien.telefono,
    });
    const resuelto = data as string | null;

    if (!resuelto) {
      // A propósito el MISMO mensaje que una contraseña equivocada: si
      // dijera "ese número no está registrado", cualquiera podría probar
      // números hasta encontrar los que sí son clientes del negocio.
      return { error: "Teléfono o contraseña incorrectos." };
    }
    email = resuelto;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Tu cuenta todavía no está confirmada. Avísale a recepción." };
    }
    if (error.code === "invalid_credentials") {
      return {
        error:
          quien.tipo === "telefono"
            ? "Teléfono o contraseña incorrectos."
            : "Correo o contraseña incorrectos.",
      };
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
