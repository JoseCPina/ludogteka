"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { rutaPorRol } from "@/lib/auth/rutas";
import { clasificarIdentificador } from "@/lib/auth/identidad";
import { negocioActual } from "@/lib/negocio/actual";

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
    // Solo entre los clientes de ESTE negocio (el del dominio).
    const admin = createSupabaseAdminClient((await negocioActual()).id);
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
  const { error } = await supabase.auth.signInWithPassword({ email, password });

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

  // El rol es el de su membresía EN ESTE negocio. Una cuenta que existe
  // (por ejemplo, de otro negocio) pero no es de este, no entra aquí.
  const { data: rol } = await supabase.rpc("current_rol");
  if (!rol || rol === "anonimo") {
    await supabase.auth.signOut();
    const negocio = await negocioActual();
    return { error: `Tu cuenta no tiene acceso a ${negocio.nombre}. Si eres cliente, pídele a recepción tu link de registro.` };
  }
  redirect(rutaPorRol(rol as string));
}
