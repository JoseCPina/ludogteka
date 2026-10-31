"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { esMotivoBaja } from "@/lib/perros/baja";

export type ResultadoSolicitudBaja = { error: string | null; ok?: boolean; registros?: RegistroFinal[] };

/**
 * El dueño pide, desde su portal, dar de baja a su mascota (mismos motivos que el personal). Queda pendiente para el
 * negocio en «Necesita atención» y en la ficha de la mascota; el negocio confirma o rechaza con motivo. La base
 * comprueba que la mascota sea suya (portal_solicitar_baja_mascota).
 */
export async function solicitarBajaMascota(perroId: string, motivo: string, nota: string): Promise<ResultadoSolicitudBaja> {
  if (!esMotivoBaja(motivo)) return { error: "Elige el motivo." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("portal_solicitar_baja_mascota", { p_perro_id: perroId, p_motivo: motivo, p_nota: nota.trim() || null });
  if (error) return { error: error.message };
  revalidatePath(`/portal/perros/${perroId}`);
  revalidatePath("/portal");
  return { error: null, ok: true, registros: await registrosDe(supabase, [{ t: "perros_bajas", i: data as string }]) };
}
