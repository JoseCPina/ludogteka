"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { traducirError } from "../reservas/traducir-error";

export type EstadoMedicamento = { error: string | null; registros?: RegistroFinal[] };

export async function crearMedicamento(
  perroId: string,
  datos: {
    medicamento: string;
    dosis: string;
    horario: string;
    fechaInicio: string;
    fechaFin: string;
    notas: string;
  }
): Promise<EstadoMedicamento> {
  if (!datos.medicamento.trim()) return { error: "Escribe el nombre del medicamento." };
  if (!datos.dosis.trim()) return { error: "Escribe la dosis." };
  if (!datos.fechaInicio) return { error: "Elige la fecha de inicio." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("perro_medicamentos").insert({
    perro_id: perroId,
    medicamento: datos.medicamento.trim(),
    dosis: datos.dosis.trim(),
    horario: datos.horario.trim() || null,
    fecha_inicio: datos.fechaInicio,
    fecha_fin: datos.fechaFin || null,
    notas: datos.notas.trim() || null,
  }).select("id").single();

  if (error) return { error: traducirError(error) };

  revalidatePath(`/perros/${perroId}`);
  return { error: null, registros: await registrosDe(supabase, [{ t: "perro_medicamentos", i: data?.id as string | undefined }]) };
}

export async function toggleActivoMedicamento(
  medicamentoId: string,
  perroId: string,
  activo: boolean
): Promise<EstadoMedicamento> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("perro_medicamentos").update({ activo }).eq("id", medicamentoId);

  if (error) return { error: traducirError(error) };

  revalidatePath(`/perros/${perroId}`);
  return { error: null, registros: await registrosDe(supabase, [{ t: "perro_medicamentos", i: medicamentoId }]) };
}

export async function registrarDosis(
  perroMedicamentoId: string,
  perroId: string,
  omitida: boolean,
  notas: string
): Promise<EstadoMedicamento> {
  if (omitida && !notas.trim()) {
    return { error: "Escribe el motivo por el que se omitió la dosis." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("medicamentos_administrados").insert({
    perro_medicamento_id: perroMedicamentoId,
    omitida,
    notas: notas.trim() || null,
  }).select("id").single();

  if (error) return { error: traducirError(error) };

  revalidatePath(`/perros/${perroId}`);
  return {
    error: null,
    registros: await registrosDe(supabase, [{ t: "medicamentos_administrados", i: data?.id as string | undefined }, { t: "perro_medicamentos", i: perroMedicamentoId }]),
  };
}
