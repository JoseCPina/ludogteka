"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";

const BUCKET = "perros-archivos";
const EXPIRACION_SEGUNDOS = 60 * 60;

// Misma convención de bucket que las fotos de perfil (perros-archivos),
// misma validación de RLS (solo mira el segmento {perro_id}, índice 2 —
// ver add_storage_perros_archivos.sql) — no hace falta ninguna política
// nueva, esta ruta ya queda cubierta por las que protegen ese bucket.
export async function prepararRutaFotoLlegada(
  clienteId: string,
  perroId: string,
  estanciaId: string
): Promise<string> {
  return `${clienteId}/${perroId}/estancias/${estanciaId}/llegada.jpg`;
}

export async function obtenerUrlFotoLlegada(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, EXPIRACION_SEGUNDOS);
  return error ? null : data.signedUrl;
}

export type EstadoAccion = { error: string | null };

export type CamposCheckin = {
  entregadoPorNombre: string;
  entregadoPorTelefono: string;
  estadoLlegada: string;
  fotoLlegadaPath: string | null;
};

// Las pertenencias se guardan aparte, una por una, en cuanto se
// capturan (agregarPertenencia) — no se acumulan en el formulario para
// mandarse juntas aquí. Esta acción solo hace la transición a en_curso.
export async function confirmarCheckin(
  estanciaId: string,
  campos: CamposCheckin
): Promise<EstadoAccion> {
  if (!campos.entregadoPorNombre.trim()) {
    return { error: "Registra quién entrega al perro." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("estancias")
    .update({
      estado: "en_curso",
      entregado_por_nombre: campos.entregadoPorNombre.trim(),
      entregado_por_telefono: campos.entregadoPorTelefono.trim() || null,
      estado_llegada: campos.estadoLlegada.trim() || null,
      foto_llegada_path: campos.fotoLlegadaPath,
    })
    .eq("id", estanciaId);

  if (error) return { error: traducirError(error) };

  revalidatePath("/reservas");
  revalidatePath(`/reservas/estancias/${estanciaId}/checkin`);
  return { error: null };
}

export async function agregarPertenencia(
  estanciaId: string,
  descripcion: string
): Promise<{ error: string | null; id: string | null }> {
  if (!descripcion.trim()) return { error: "Escribe una descripción.", id: null };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("estancia_pertenencias")
    .insert({ estancia_id: estanciaId, descripcion: descripcion.trim() })
    .select("id")
    .single();

  if (error) return { error: "No pudimos guardar la pertenencia.", id: null };
  revalidatePath(`/reservas/estancias/${estanciaId}/checkin`);
  revalidatePath(`/reservas/estancias/${estanciaId}/checkout`);
  return { error: null, id: data.id };
}

export async function alternarPertenencia(
  pertenenciaId: string,
  devuelto: boolean
): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("estancia_pertenencias")
    .update({ devuelto })
    .eq("id", pertenenciaId);

  if (error) return { error: "No pudimos actualizar esa pertenencia." };
  return { error: null };
}

export type CamposCheckout = {
  recogidoPorNombre: string;
  recogidoPorTelefono: string;
  recogidoPorEsDueno: boolean;
};

export async function confirmarCheckout(
  estanciaId: string,
  campos: CamposCheckout
): Promise<EstadoAccion> {
  if (!campos.recogidoPorNombre.trim()) {
    return { error: "Registra quién recoge al perro." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("estancias")
    .update({
      estado: "finalizada",
      recogido_por_nombre: campos.recogidoPorNombre.trim(),
      recogido_por_telefono: campos.recogidoPorTelefono.trim() || null,
      recogido_por_es_dueno: campos.recogidoPorEsDueno,
    })
    .eq("id", estanciaId);

  if (error) return { error: traducirError(error) };

  revalidatePath("/reservas");
  revalidatePath(`/reservas/estancias/${estanciaId}/checkout`);
  return { error: null };
}
