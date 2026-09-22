"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoRequisitoEstancia = { error: string | null; ok?: boolean };

function mensajeDeError(error: { code?: string; message: string }): string {
  // Los RAISE del trigger y de las RPC ya vienen en español.
  if (error.code === "P0001") return error.message;
  if (error.code === "23514") {
    return "Solo una hembra puede marcarse en celo o gestante. Revisa el sexo en la ficha.";
  }
  return "No pudimos guardar el cambio. Intenta de nuevo.";
}

function revalidar(perroId: string, clienteId: string | null) {
  revalidatePath(`/perros/${perroId}`);
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
}

// Quién la hizo NO viaja desde la pantalla: lo pone la base desde la
// sesión (auth.uid()) dentro de la RPC.
export async function marcarEvaluacionComportamiento(
  perroId: string,
  clienteId: string | null,
  _estadoPrevio: EstadoRequisitoEstancia,
  formData: FormData
): Promise<EstadoRequisitoEstancia> {
  const fecha = String(formData.get("fecha") ?? "").trim();
  const notas = String(formData.get("notas") ?? "").trim();
  if (!fecha) return { error: "Indica la fecha en que se hizo la evaluación." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("marcar_evaluacion_comportamiento", {
    p_perro_id: perroId,
    p_fecha: fecha,
    p_notas: notas || null,
  });
  if (error) return { error: mensajeDeError(error) };

  revalidar(perroId, clienteId);
  return { error: null, ok: true };
}

export async function quitarEvaluacionComportamiento(
  perroId: string,
  clienteId: string | null
): Promise<EstadoRequisitoEstancia> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("quitar_evaluacion_comportamiento", { p_perro_id: perroId });
  if (error) return { error: mensajeDeError(error) };

  revalidar(perroId, clienteId);
  return { error: null, ok: true };
}

// Celo y gestación son marcas que recepción prende y apaga. Van directo
// a la fila del perro (misma política de RLS que el resto de la ficha);
// el check de la base impide marcarlas en un macho.
export async function marcarEstadoReproductivo(
  perroId: string,
  clienteId: string | null,
  cambios: { en_celo?: boolean; gestante?: boolean }
): Promise<EstadoRequisitoEstancia> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("perros").update(cambios).eq("id", perroId);
  if (error) return { error: mensajeDeError(error) };

  revalidar(perroId, clienteId);
  return { error: null, ok: true };
}
