"use server";

import { ponerPasswordTemporal } from "@/lib/auth/password-temporal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generarPasswordTemporal } from "@/lib/auth/identidad";
import { traducirError } from "../../reservas/traducir-error";
import { negocioActual } from "@/lib/negocio/actual";

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
  // (La Admin API de Auth no toca tablas: el negocio no aplica aquí. Que
  // la cuenta sea de un cliente de ESTE negocio y de ningún otro ya lo
  // comprobó cuenta_de_cliente_para_restablecer.)
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  // Temporal de verdad (R35): la cuenta queda marcada y al entrar al portal se le pide escoger otra.
  // Nunca queda una contraseña que no sirve: una cuenta sin confirmar se confirma en este momento (ponerPasswordTemporal).
  const puesta = await ponerPasswordTemporal(admin, userId as string, password);
  if (!puesta.ok) {
    return { error: puesta.sinConfirmar ? "Su cuenta todavía no está activa y no pudimos activarla: mándale otra vez su link para completar el alta." : puesta.error };
  }

  const nombre = (cliente?.nombre as string | null) ?? "";
  const telefono = (cliente?.telefono as string | null) ?? "";
  const mensaje =
    `Hola ${nombre}, te restablecimos tu contraseña de ${negocio.nombre}.\n\n` +
    `Entra con tu teléfono (${telefono}) y esta contraseña: ${password}\n\n` +
    `Al entrar te va a pedir que escojas una contraseña nueva.`;

  return {
    error: null,
    password,
    urlWhatsApp: telefono
      ? `https://wa.me/52${telefono.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(mensaje)}`
      : undefined,
  };
}
