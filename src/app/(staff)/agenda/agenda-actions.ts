"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

export type EstadoAccion = { error: string | null };
export type EstadoCrearCita = { error: string | null; citaId?: string };

export async function crearCita(datos: {
  perroId: string;
  servicioId: string;
  empleadoId: string;
  inicio: string;
  estanciaId: string | null;
}): Promise<EstadoCrearCita> {
  if (!datos.perroId || !datos.servicioId || !datos.empleadoId || !datos.inicio) {
    return { error: "Completa perro, servicio, empleado y hora." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: reserva, error: errorReserva } = await supabase
    .from("perros")
    .select("cliente_id")
    .eq("id", datos.perroId)
    .single();
  if (errorReserva || !reserva) return { error: "No pudimos encontrar al perro." };

  const { data: reservaCreada, error: errorCrearReserva } = await supabase
    .from("reservas")
    .insert({ cliente_id: reserva.cliente_id })
    .select("id")
    .single();
  if (errorCrearReserva || !reservaCreada) {
    return { error: "No pudimos crear la reserva para esta cita." };
  }

  const { data, error } = await supabase
    .from("citas_estetica")
    .insert({
      reserva_id: reservaCreada.id,
      perro_id: datos.perroId,
      servicio_id: datos.servicioId,
      empleado_id: datos.empleadoId,
      inicio: datos.inicio,
      estancia_id: datos.estanciaId,
    })
    .select("id")
    .single();

  if (error) {
    await supabase.from("reservas").delete().eq("id", reservaCreada.id);
    return { error: traducirError(error) };
  }

  revalidatePath("/agenda");
  return { error: null, citaId: data.id };
}

export async function reagendarCita(citaId: string, nuevoInicio: string): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("citas_estetica")
    .update({ inicio: nuevoInicio, fin: null })
    .eq("id", citaId);

  if (error) return { error: traducirError(error) };
  revalidatePath("/agenda");
  return { error: null };
}

export async function cancelarCita(citaId: string): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("citas_estetica")
    .update({ estado: "cancelada" })
    .eq("id", citaId);

  if (error) return { error: traducirError(error) };
  revalidatePath("/agenda");
  return { error: null };
}

export async function marcarCitaNoLlego(citaId: string): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("citas_estetica")
    .update({ estado: "no_llego" })
    .eq("id", citaId);

  if (error) return { error: traducirError(error) };
  revalidatePath("/agenda");
  return { error: null };
}

export async function iniciarCita(
  citaId: string,
  entregadoPorNombre: string | null,
  entregadoPorTelefono: string | null
): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("citas_estetica")
    .update({
      estado: "en_curso",
      entregado_por_nombre: entregadoPorNombre,
      entregado_por_telefono: entregadoPorTelefono,
    })
    .eq("id", citaId);

  if (error) return { error: traducirError(error) };
  revalidatePath("/agenda");
  return { error: null };
}

export async function finalizarCita(
  citaId: string,
  recogidoPorNombre: string | null,
  recogidoPorTelefono: string | null,
  recogidoPorEsDueno: boolean | null
): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("citas_estetica")
    .update({
      estado: "finalizada",
      recogido_por_nombre: recogidoPorNombre,
      recogido_por_telefono: recogidoPorTelefono,
      recogido_por_es_dueno: recogidoPorEsDueno,
    })
    .eq("id", citaId);

  if (error) return { error: traducirError(error) };
  revalidatePath("/agenda");
  return { error: null };
}
