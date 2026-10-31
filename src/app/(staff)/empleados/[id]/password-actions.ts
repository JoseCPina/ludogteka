"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generarPasswordTemporal } from "@/lib/auth/identidad";
import { traducirError } from "../../reservas/traducir-error";
import { negocioActual } from "@/lib/negocio/actual";
import { ponerPasswordTemporal } from "@/lib/auth/password-temporal";
import { urlDelNegocio } from "@/lib/negocio/actual";

// `inviteLink`: la cuenta (invitada, sin abrir su link) no se pudo confirmar; en vez de una contraseña que no serviría
// se generó una invitación nueva («Reenviar invitación»).
export type EstadoRestablecerPersonal = { error: string | null; password?: string; urlWhatsApp?: string; inviteLink?: string };

/**
 * QA S36: un admin le restablece la contraseña a alguien de su equipo (es lo que el login le dice a quien la olvidó en
 * «Soy del equipo»): desde su ficha de Empleados o desde Administración → Cuentas. Quién puede y sobre quién lo decide
 * la base (`cuenta_de_personal_para_restablecer` / `cuenta_del_equipo_para_restablecer`: solo admin, solo su equipo,
 * nunca la propia ni la de alguien que esté en otro negocio); aquí solo se pone la contraseña temporal por la Admin API.
 */
export async function restablecerPasswordPersonal(empleadoId: string): Promise<EstadoRestablecerPersonal> {
  const supabase = await createSupabaseServerClient();
  const { data: userId, error } = await supabase.rpc("cuenta_de_personal_para_restablecer", { p_empleado_id: empleadoId });
  if (error) return { error: traducirError(error) };
  if (!userId) return { error: "Esta persona no tiene cuenta en la app." };
  const { data: empleado } = await supabase.from("empleados").select("nombre, telefono").eq("id", empleadoId).single();
  return ponerTemporal(userId as string, (empleado?.nombre as string | null) ?? "", (empleado?.telefono as string | null) ?? "");
}

/** Lo mismo desde Administración → Cuentas (está aunque el módulo de Empleados esté apagado). */
export async function restablecerPasswordCuenta(profileId: string): Promise<EstadoRestablecerPersonal> {
  const supabase = await createSupabaseServerClient();
  const { data: userId, error } = await supabase.rpc("cuenta_del_equipo_para_restablecer", { p_profile_id: profileId });
  if (error) return { error: traducirError(error) };
  const { data: perfil } = await supabase.from("profiles").select("nombre_completo, telefono").eq("id", profileId).maybeSingle();
  return ponerTemporal(userId as string, (perfil?.nombre_completo as string | null) ?? "", (perfil?.telefono as string | null) ?? "");
}

async function ponerTemporal(userId: string, nombre: string, telefonoCrudo: string): Promise<EstadoRestablecerPersonal> {
  const password = generarPasswordTemporal();
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  // Temporal de verdad: al entrar se le pide escoger otra (/auth/nueva-password).
  // Nunca queda una contraseña que no sirve: alguien invitado que no abrió su link se confirma en este momento (el
  // admin responde por esa persona); si no se puede, se reenvía la invitación con un link nuevo.
  const puesta = await ponerPasswordTemporal(admin, userId, password);
  if (!puesta.ok && puesta.sinConfirmar) return reenviarInvitacion(admin, userId, nombre, telefonoCrudo, negocio);
  if (!puesta.ok) return { error: puesta.error };
  const telefono = telefonoCrudo.replace(/[^0-9]/g, "");
  const correo = puesta.email && !puesta.email.endsWith("@telefono.ludogteka.mx") ? puesta.email : null;
  const mensaje =
    `Hola ${nombre}, te restablecimos tu contraseña de ${negocio.nombre}.

` +
    `Entra en «Soy del equipo» con ${correo ? `tu correo (${correo})` : "tu teléfono"} y esta contraseña: ${password}

` +
    `Al entrar te va a pedir que escojas una contraseña nueva.`;
  return { error: null, password, urlWhatsApp: telefono ? `https://wa.me/52${telefono.slice(-10)}?text=${encodeURIComponent(mensaje)}` : undefined };
}

/** «Reenviar invitación»: un link nuevo para la cuenta que sigue sin abrir el suyo (el anterior deja de servir). */
async function reenviarInvitacion(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  nombre: string,
  telefonoCrudo: string,
  negocio: Awaited<ReturnType<typeof negocioActual>>
): Promise<EstadoRestablecerPersonal> {
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (!email) return { error: "No pudimos generar la invitación. Intenta de nuevo." };
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "invite", email });
  if (error || !link?.properties?.hashed_token) return { error: "No pudimos generar la invitación. Intenta de nuevo." };
  const inviteLink = `${urlDelNegocio(negocio)}/auth/callback?token_hash=${link.properties.hashed_token}&type=invite`;
  const telefono = telefonoCrudo.replace(/[^0-9]/g, "").slice(-10);
  const texto = `Hola ${nombre}, te invitamos a usar la app de ${negocio.nombre}. Abre este link para crear tu contraseña: ${inviteLink}`;
  return {
    error: null,
    inviteLink,
    urlWhatsApp: telefono.length === 10 ? `https://wa.me/52${telefono}?text=${encodeURIComponent(texto)}` : `https://wa.me/?text=${encodeURIComponent(texto)}`,
  };
}
