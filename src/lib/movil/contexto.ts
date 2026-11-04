import { AsyncLocalStorage } from "node:async_hooks";

/**
 * La sesión de la app nativa para dueños (apps/duenos-movil, docs/app-duenos/PLAN.md).
 *
 * La app nativa no tiene cookies: manda su access token de Supabase en `Authorization: Bearer` a /api/movil. La ruta
 * corre la acción dentro de este contexto y los clientes de Supabase del servidor del área «portal»
 * (`createSupabaseServerClient("portal")`, `supabaseAppEnNegocio`) leen la sesión de aquí en vez de la cookie. Así la app
 * nativa usa exactamente las mismas funciones que la web, con la misma RLS (la base decide con el JWT de la persona).
 *
 * Solo /api/movil abre este contexto; un encabezado `Authorization` en cualquier otra ruta no cambia nada.
 * La sesión nunca se escribe: si el token venció, la base no reconoce a nadie y la app lo renueva
 * (/api/movil/sesion/renovar) y repite.
 */
type SesionMovil = { accessToken: string };

const almacen = new AsyncLocalStorage<SesionMovil>();

export function conSesionMovil<T>(accessToken: string, fn: () => Promise<T>): Promise<T> {
  return almacen.run({ accessToken }, fn);
}

export function sesionMovilActual(): SesionMovil | null {
  return almacen.getStore() ?? null;
}

/** Los segundos de vencimiento que trae el JWT (sin verificarlo: lo verifica Auth en cada consulta). */
function venceEn(jwt: string): number {
  try {
    const carga = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number };
    return typeof carga.exp === "number" ? carga.exp : 0;
  } catch {
    return 0;
  }
}

/**
 * La cookie de sesión que el cliente de @supabase/ssr espera leer, armada con el token de la app nativa. Sin refresh
 * token: si venció, supabase-js no puede renovarla y no hay usuario (la app la renueva sola).
 */
export function cookiesDeSesionMovil(nombreCookie: string, s: SesionMovil): { name: string; value: string }[] {
  const exp = venceEn(s.accessToken);
  const sesion = { access_token: s.accessToken, refresh_token: "", token_type: "bearer", expires_at: exp, expires_in: Math.max(0, exp - Math.floor(Date.now() / 1000)) };
  return [{ name: nombreCookie, value: JSON.stringify(sesion) }];
}
