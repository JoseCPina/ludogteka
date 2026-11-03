"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { despacharAvisosAlTerminar } from "@/lib/app/avisos-negocio";
import { traducirError } from "../reservas/traducir-error";

export type ResultadoResena = { error: string | null; exito?: string; respondidaAt?: string | null; registros?: RegistroFinal[] };

const RECHAZO = "No tienes permiso para contestar ni esconder reseñas. Pídele a un admin el permiso «Responder y esconder reseñas».";

/**
 * Contestar una reseña (o quitar la respuesta, con el texto vacío). La base solo deja cambiar la respuesta y si se ve
 * (resenas_solo_respuesta) y solo a admin o a recepción con «Responder y esconder reseñas» (resenas_update_staff). Al
 * contestar, el dueño recibe el aviso en su app (disparador de la base; el push sale al terminar).
 */
export async function responderResena(id: string, texto: string): Promise<ResultadoResena> {
  const limpio = texto.trim();
  if (limpio.length > 500) return { error: "La respuesta puede tener hasta 500 caracteres." };
  const supabase = await createSupabaseServerClient();
  despacharAvisosAlTerminar();
  const respondidaAt = limpio ? new Date().toISOString() : null;
  const { data, error } = await supabase.from("resenas").update({ respuesta: limpio || null, respondida_at: respondidaAt }).eq("id", id).select("id");
  if (error) return { error: traducirError(error) };
  if (!data?.length) return { error: RECHAZO };
  return {
    error: null,
    exito: limpio ? "Respuesta guardada: se ve junto a la reseña en la página del negocio." : "Quitaste la respuesta.",
    respondidaAt,
    registros: await registrosDe(supabase, [{ t: "resenas", i: id }]),
  };
}

/** Esconder una reseña de la vista pública (la página del negocio y la app) o volver a mostrarla. */
export async function cambiarVisibilidadResena(id: string, publicada: boolean): Promise<ResultadoResena> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("resenas").update({ publicada }).eq("id", id).select("id");
  if (error) return { error: traducirError(error) };
  if (!data?.length) return { error: RECHAZO };
  return {
    error: null,
    exito: publicada ? "La reseña se ve otra vez en la página del negocio." : "Reseña escondida: ya no sale en la página del negocio ni en la app.",
    registros: await registrosDe(supabase, [{ t: "resenas", i: id }]),
  };
}
