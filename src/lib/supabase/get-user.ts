import { isAuthRetryableFetchError, isAuthSessionMissingError, type AuthError, type SupabaseClient } from "@supabase/supabase-js";

// getUser() devuelve usuario nulo por DOS motivos distintos: no hay sesión
// (cookie ausente o token ya inválido: hay que ir a /login de inmediato) o
// Auth/la red falló en ese instante (un 5xx, un corte, un timeout). Mandar a
// /login por lo segundo saca de la app a alguien que sí tiene sesión, y a una
// prueba automática la tira. Solo lo segundo se reintenta, una vez.
const ESPERA_REINTENTO_MS = 400;

function esFalloPasajero(error: AuthError | null | undefined): boolean {
  if (!error) return false;
  if (isAuthSessionMissingError(error)) return false; // no hay sesión: no se reintenta
  if (isAuthRetryableFetchError(error)) return true;
  const estado = (error as { status?: number }).status;
  // Sin estado = ni siquiera llegó respuesta (red); 5xx = Auth caído un momento.
  // Un 4xx (token inválido, usuario borrado) es una sesión que de verdad no sirve.
  return estado === undefined || estado === 0 || estado >= 500;
}

export async function getUserConReintento(supabase: SupabaseClient) {
  let primero;
  try {
    primero = await supabase.auth.getUser();
  } catch {
    primero = null;
  }
  if (primero && (primero.data.user || !esFalloPasajero(primero.error))) return primero;
  await new Promise((r) => setTimeout(r, ESPERA_REINTENTO_MS));
  return supabase.auth.getUser();
}
