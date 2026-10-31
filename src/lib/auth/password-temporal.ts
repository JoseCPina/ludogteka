import type { SupabaseClient } from "@supabase/supabase-js";
import { MARCA_CAMBIO_PASSWORD } from "@/lib/auth/cambio-obligatorio";

export type ResultadoPasswordTemporal =
  | { ok: true; email: string | null; confirmada: boolean }
  | { ok: false; sinConfirmar: true }
  | { ok: false; sinConfirmar?: false; error: string };

/**
 * Pone una contraseña temporal SOLO si con ella se puede entrar (nunca queda una que no sirve). Una cuenta con el correo
 * sin confirmar —alguien invitado que no abrió su link— no entra con contraseña («Email not confirmed»): se confirma
 * primero, porque quien restablece (un admin del negocio, recepción con un cliente o la plataforma) responde por esa
 * persona. Si no se puede confirmar, no se toca la contraseña y se devuelve `sinConfirmar` (quien llama ofrece
 * reenviar la invitación). Al entrar con la temporal, la app pide escoger otra (`MARCA_CAMBIO_PASSWORD`).
 *
 * `admin` es el cliente con la secret key: quien llama ya comprobó que puede restablecer a esa persona.
 */
export async function ponerPasswordTemporal(admin: SupabaseClient, userId: string, password: string): Promise<ResultadoPasswordTemporal> {
  const { data: actual, error: errorLeer } = await admin.auth.admin.getUserById(userId);
  if (errorLeer || !actual?.user) return { ok: false, error: "No encontramos esa cuenta." };
  const sinConfirmar = Boolean(actual.user.email) && !actual.user.email_confirmed_at;
  if (sinConfirmar) {
    const { data: confirmada, error: errorConfirmar } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    if (errorConfirmar || !confirmada?.user?.email_confirmed_at) return { ok: false, sinConfirmar: true };
  }
  const { data: cuenta, error } = await admin.auth.admin.updateUserById(userId, {
    password,
    app_metadata: { [MARCA_CAMBIO_PASSWORD]: true },
  });
  if (error) return { ok: false, error: "No pudimos cambiar la contraseña. Intenta de nuevo." };
  return { ok: true, email: cuenta.user?.email ?? null, confirmada: sinConfirmar };
}
