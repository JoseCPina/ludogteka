"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generarPasswordTemporal } from "@/lib/auth/identidad";
import { traducirError } from "../../reservas/traducir-error";

export type EstadoRestablecer = {
  error: string | null;
  password?: string;
  urlWhatsApp?: string;
};

/**
 * Recepción le restablece la contraseña a un cliente.
 *
 * Es la otra mitad del "olvidé mi contraseña" del login: el dueño escribe
 * por WhatsApp y alguien del mostrador se la genera aquí mismo. No hay
 * correo de recuperación porque no hay correo — la cuenta va con el
 * teléfono, y el teléfono no está verificado.
 *
 * Quién puede hacerlo y sobre quién NO se decide aquí: lo decide
 * `cuenta_de_cliente_para_restablecer` en la base, que exige rol de admin
 * o recepción y se niega a devolver una cuenta que no sea de un cliente.
 * Si la regla viviera solo en este archivo, una pantalla nueva que se
 * olvidara de repetirla abriría el panel entero.
 */
export async function restablecerPasswordCliente(
  clienteId: string
): Promise<EstadoRestablecer> {
  const supabase = await createSupabaseServerClient();

  const { data: userId, error } = await supabase.rpc("cuenta_de_cliente_para_restablecer", {
    p_cliente_id: clienteId,
  });
  if (error) return { error: traducirError(error) };
  if (!userId) return { error: "Ese cliente todavía no tiene cuenta." };

  const { data: cliente } = await supabase
    .from("clientes")
    .select("nombre, telefono")
    .eq("id", clienteId)
    .single();

  const password = generarPasswordTemporal();

  // La Admin API es el único camino: la contraseña no vive en una tabla
  // que una función de la base pueda tocar.
  const admin = createSupabaseAdminClient();
  const { error: errorAuth } = await admin.auth.admin.updateUserById(userId as string, {
    password,
  });
  if (errorAuth) {
    return { error: "No pudimos cambiar la contraseña. Intenta de nuevo." };
  }

  const nombre = (cliente?.nombre as string | null) ?? "";
  const telefono = (cliente?.telefono as string | null) ?? "";
  const mensaje =
    `Hola ${nombre}, te restablecimos tu contraseña de Ludogteka.\n\n` +
    `Entra con tu teléfono (${telefono}) y esta contraseña: ${password}\n\n` +
    `Cámbiala desde tu portal en cuanto entres.`;

  return {
    error: null,
    password,
    urlWhatsApp: telefono
      ? `https://wa.me/52${telefono.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(mensaje)}`
      : undefined,
  };
}
