// R35 (QA externa): una contraseña temporal —la que recepción le restablece a un dueño, o la que la plataforma le da
// a una persona en soporte— se tiene que cambiar al entrar. La marca vive en app_metadata de la cuenta de Auth, que
// solo escribe el servidor con la secret key (la persona no la puede quitar desde el navegador), y el middleware la
// lee con getUser(), que siempre trae la versión vigente de la cuenta, no la del token.
import type { User } from "@supabase/supabase-js";

export const MARCA_CAMBIO_PASSWORD = "debe_cambiar_password";

// La del dueño vive dentro de /portal (su sesión es la cookie del portal); la del personal es la de siempre.
export const RUTA_CAMBIO_PORTAL = "/portal/cambiar-contrasena";
export const RUTA_CAMBIO_PERSONAL = "/auth/nueva-password";

// Lo pone el middleware con la ruta de la petición (nunca el navegador: el middleware pisa lo que traiga).
export const ENCABEZADO_RUTA = "x-peludesk-ruta";

export function debeCambiarPassword(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.[MARCA_CAMBIO_PASSWORD] === true;
}
