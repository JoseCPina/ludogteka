"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { urlDelNegocioActual, negocioActual } from "@/lib/negocio/actual";
import { traducirError } from "../../reservas/traducir-error";

export type EstadoInvitarPortal = { error: string | null; url?: string; urlWhatsApp?: string; expiraAt?: string };

/**
 * «Invitar al portal»: genera el enlace de un solo uso para que el cliente
 * escoja su contraseña. El token se crea aquí y nunca se guarda: a la base
 * solo llega su sha256. Se muestra una vez (si se pierde, se genera otro, que
 * deja sin efecto el anterior).
 */
export async function invitarAlPortal(clienteId: string): Promise<EstadoInvitarPortal> {
  const supabase = await createSupabaseServerClient();
  const { data: cliente } = await supabase.from("clientes").select("nombre, telefono").eq("id", clienteId).is("deleted_at", null).single();
  if (!cliente) return { error: "No encontré a ese cliente." };

  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await supabase.rpc("crear_invitacion_portal", { p_cliente_id: clienteId, p_token_hash: hash, p_dias: 7 });
  if (error) return { error: traducirError(error) };

  const negocio = await negocioActual();
  const url = `${await urlDelNegocioActual()}/activar/${token}`;
  const telefono = String(cliente.telefono ?? "").replace(/\D/g, "");
  const mensaje = `Hola ${cliente.nombre}, aquí puedes abrir tu cuenta de ${negocio.nombre} y escoger tu contraseña. El enlace sirve una sola vez: ${url}`;
  revalidatePath(`/clientes/${clienteId}`);
  return {
    error: null,
    url,
    urlWhatsApp: telefono.length >= 10 ? `https://wa.me/52${telefono.slice(-10)}?text=${encodeURIComponent(mensaje)}` : undefined,
    expiraAt: data as string,
  };
}
