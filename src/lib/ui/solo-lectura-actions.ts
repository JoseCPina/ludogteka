"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { esErrorSoloLectura, mensajeSoloLectura } from "@/lib/solo-lectura";
import { esApp } from "@/lib/app/sesion";

/**
 * ¿Este negocio está en solo lectura para quien pregunta? Si sí, el mensaje que le toca: el del demo
 * («En la demo no se guardan cambios…») o el de una prueba vencida / cuenta de solo lectura. Lo usa
 * `esperarConTope` (src/lib/ui/espera.ts), por donde pasa TODA acción del servidor, para que ninguna
 * pantalla tenga que traducir ese rechazo por su cuenta. Lo dice la misma función de la base que
 * lanza el rechazo (exigir_negocio_escribible), no una copia de su regla.
 */
export async function mensajeSiSoloLectura(): Promise<string | null> {
  // En la app para dueños (app.peludesk.mx) el negocio NO es el del dominio: cada acción va al negocio del vínculo y
  // ella misma dice el rechazo de la base (también el de la demo). Preguntarle aquí al negocio del dominio daba un
  // «solo lectura» que no era (2 de noviembre de 2026, verificación de la Fase 3 en producción).
  if (await esApp()) return null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("exigir_negocio_escribible");
  return esErrorSoloLectura(error) ? mensajeSoloLectura(error) : null;
}
