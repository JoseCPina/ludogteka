"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../reservas/traducir-error";
import { normalizarTelefono } from "@/lib/telefono";

export type EstadoInvitacion = {
  error: string | null;
  url?: string;
  urlWhatsApp?: string;
  expiraAt?: string;
};

// El link se arma con el host del request, no con una variable de entorno:
// así funciona igual en desarrollo (localhost:3001) y en producción sin
// tener que acordarse de configurar nada, y sin riesgo de mandarle a un
// cliente real un link que apunte a la máquina de alguien.
async function urlBase(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "";
  const protocolo = hdrs.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}

// 52 + 10 dígitos, mismo formato que ya usa el aviso de bitácora por
// WhatsApp (ver perros/bitacora-actions.ts).
function enlaceWhatsApp(telefono: string, mensaje: string) {
  return `https://wa.me/52${telefono.replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;
}

export async function crearInvitacion(
  nombreReferencia: string,
  telefonoCrudo: string,
  diasVigencia: number
): Promise<EstadoInvitacion> {
  if (!nombreReferencia.trim()) {
    return { error: "Escribe un nombre para reconocer la invitación (ej. Ana, la del labrador)." };
  }
  const telefono = normalizarTelefono(telefonoCrudo);
  if (!telefono) {
    return { error: "El teléfono debe tener 10 dígitos. Puedes escribirlo con espacios o guiones." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("crear_invitacion_cliente", {
    p_nombre_referencia: nombreReferencia,
    p_telefono: telefono,
    p_dias_vigencia: diasVigencia,
  });

  if (error) return { error: traducirError(error) };

  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila?.token) return { error: "No pudimos generar el link. Intenta de nuevo." };

  const url = `${await urlBase()}/alta/${fila.token}`;
  const mensaje =
    `Hola ${nombreReferencia.trim()}, aquí puedes darte de alta en Ludogteka y registrar a tu perro: ${url}`;

  revalidatePath("/clientes/invitaciones");
  return {
    error: null,
    url,
    urlWhatsApp: enlaceWhatsApp(telefono, mensaje),
    expiraAt: fila.expira_at as string,
  };
}

// Reenviar es rearmar el mensaje de la MISMA invitación, no crear otra:
// generar una nueva por cada reenvío llenaría la lista de links vivos para
// la misma persona, y cualquiera de ellos serviría para darse de alta.
export async function enlaceParaReenviar(
  invitacionId: string
): Promise<{ error: string | null; url?: string; urlWhatsApp?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("invitaciones_cliente")
    .select("token, telefono, nombre_referencia, usada_at, cancelada_at, expira_at")
    .eq("id", invitacionId)
    .single();

  if (error || !data) return { error: "No encontramos esa invitación." };
  if (data.usada_at) return { error: "Esa invitación ya se usó." };
  if (data.cancelada_at) return { error: "Esa invitación está cancelada." };
  if (new Date(data.expira_at as string) <= new Date()) {
    return { error: "Esa invitación ya venció. Genera una nueva." };
  }

  const url = `${await urlBase()}/alta/${data.token}`;
  const mensaje =
    `Hola ${data.nombre_referencia}, aquí puedes darte de alta en Ludogteka y registrar a tu perro: ${url}`;

  return { error: null, url, urlWhatsApp: enlaceWhatsApp(data.telefono as string, mensaje) };
}

export async function cancelarInvitacion(invitacionId: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancelar_invitacion_cliente", { p_id: invitacionId });

  if (error) return { error: traducirError(error) };

  revalidatePath("/clientes/invitaciones");
  return { error: null };
}

export async function marcarDatosRevisados(clienteId: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("marcar_datos_revisados", { p_cliente_id: clienteId });

  if (error) return { error: traducirError(error) };

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clienteId}`);
  return { error: null };
}
