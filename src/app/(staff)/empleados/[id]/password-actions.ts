"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generarPasswordTemporal } from "@/lib/auth/identidad";
import { traducirError } from "../../reservas/traducir-error";
import { negocioActual } from "@/lib/negocio/actual";
import { MARCA_CAMBIO_PASSWORD } from "@/lib/auth/cambio-obligatorio";

export type EstadoRestablecerPersonal = { error: string | null; password?: string; urlWhatsApp?: string };

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
  const { data: cuenta, error: errorAuth } = await admin.auth.admin.updateUserById(userId, {
    password,
    app_metadata: { [MARCA_CAMBIO_PASSWORD]: true },
  });
  if (errorAuth) return { error: "No pudimos cambiar la contraseña. Intenta de nuevo." };
  const telefono = telefonoCrudo.replace(/[^0-9]/g, "");
  const correo = cuenta.user?.email && !cuenta.user.email.endsWith("@telefono.ludogteka.mx") ? cuenta.user.email : null;
  const mensaje =
    `Hola ${nombre}, te restablecimos tu contraseña de ${negocio.nombre}.

` +
    `Entra en «Soy del equipo» con ${correo ? `tu correo (${correo})` : "tu teléfono"} y esta contraseña: ${password}

` +
    `Al entrar te va a pedir que escojas una contraseña nueva.`;
  return { error: null, password, urlWhatsApp: telefono ? `https://wa.me/52${telefono.slice(-10)}?text=${encodeURIComponent(mensaje)}` : undefined };
}
