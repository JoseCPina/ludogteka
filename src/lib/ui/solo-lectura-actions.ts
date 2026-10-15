"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { esErrorSoloLectura, mensajeSoloLectura } from "@/lib/solo-lectura";

/**
 * ¿Este negocio está en solo lectura para quien pregunta? Si sí, el mensaje que le toca: el del demo
 * («En la demo no se guardan cambios…») o el de una prueba vencida / cuenta de solo lectura. Lo usa
 * `esperarConTope` (src/lib/ui/espera.ts), por donde pasa TODA acción del servidor, para que ninguna
 * pantalla tenga que traducir ese rechazo por su cuenta. Lo dice la misma función de la base que
 * lanza el rechazo (exigir_negocio_escribible), no una copia de su regla.
 */
export async function mensajeSiSoloLectura(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("exigir_negocio_escribible");
  return esErrorSoloLectura(error) ? mensajeSoloLectura(error) : null;
}
