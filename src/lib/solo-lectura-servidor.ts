import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MENSAJE_DEMO, MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";

// Antes de subir un archivo con la secret key (que salta la RLS de Storage): si quien lo manda no puede
// escribir en el negocio, no se sube nada. Sin esto, en la demo el archivo SÍ llegaba a Storage y la base
// rechazaba después el registro: quedaba huérfano (un PDF de consentimiento) o reemplazaba la foto de un
// perro de la demo para todos los visitantes (portal, «Foto de mi perro», upsert sobre la misma ruta).
export type BloqueoEscritura = { demo: boolean; mensaje: string };

/** Lo que dice la base para la sesión (negocio_escribible: plan, cobro y membresía de solo lectura). */
export async function bloqueoDeEscritura(supabase: SupabaseClient): Promise<BloqueoEscritura | null> {
  const { data: escribible } = await supabase.rpc("negocio_escribible");
  if (escribible !== false) return null;
  return (await cargarNegocioLanding()).plan === "demo" ? { demo: true, mensaje: MENSAJE_DEMO } : { demo: false, mensaje: MENSAJE_SOLO_LECTURA };
}

// El alta por link y la teleconsulta (sin sesión) no pasan por aquí: su token solo lo crea una cuenta que
// puede escribir (en la demo, el corredor de tutoriales, que sí guarda).
