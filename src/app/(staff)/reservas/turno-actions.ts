"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";

export type EstadoAbrirTurno = { error: string | null; turnoId?: string };

// Bloque D construye la pantalla completa de apertura/retiros/cierre con
// arqueo — esto es solo lo mínimo para que Bloque A (cobros) no quede
// bloqueado sin turno abierto. El unique index turnos_caja_un_abierto_idx
// es quien de verdad impide dos turnos abiertos a la vez, esto es solo el
// mensaje amable si ya hay uno.
export async function abrirTurno(fondoInicial: number, notas: string): Promise<EstadoAbrirTurno> {
  if (!Number.isFinite(fondoInicial) || fondoInicial < 0) {
    return { error: "El fondo inicial debe ser un número mayor o igual a cero." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("turnos_caja")
    .insert({ fondo_inicial: fondoInicial, notas_apertura: notas.trim() || null })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya hay un turno de caja abierto." };
    }
    return { error: traducirError(error) };
  }

  revalidatePath("/reservas");
  revalidatePath("/caja");
  return { error: null, turnoId: data.id };
}
