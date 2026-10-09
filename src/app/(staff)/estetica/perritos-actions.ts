"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResultadoPerritoEstetica = { error: string | null; perroId?: string };

/**
 * Alta CORTA de otro perrito de un cliente, desde agendar una cita de estética:
 * nombre, raza, tamaño y pelaje. Nada de hotel o guardería (veterinario,
 * contacto de emergencia, alimentación, contrato, vacunas): eso se pide si algún
 * día usa guardería u hotel. Las reglas de quién puede las pone la base (RLS).
 */
export async function crearPerritoEstetica(
  clienteId: string,
  datos: { nombre: string; razaId: string | null; razaTexto: string; tamanoId: string; pelajeId: string }
): Promise<ResultadoPerritoEstetica> {
  const nombre = datos.nombre.trim();
  if (!clienteId) return { error: "Elige primero al cliente." };
  if (!nombre) return { error: "Escribe el nombre del perrito." };
  if (!datos.razaId && !datos.razaTexto.trim()) return { error: "Escribe o elige su raza." };
  if (!datos.tamanoId || !datos.pelajeId) return { error: "Elige su tamaño y su pelaje: con eso se calcula el precio del baño." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("perros")
    .insert({
      cliente_id: clienteId,
      nombre,
      raza: datos.razaTexto.trim() || null,
      raza_id: datos.razaId,
      tamano_id: datos.tamanoId,
      pelaje_id: datos.pelajeId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "No pudimos guardar al perrito. Solo admin o recepción dan de alta perros; intenta de nuevo." };
  revalidatePath(`/clientes/${clienteId}`);
  return { error: null, perroId: data.id as string };
}
