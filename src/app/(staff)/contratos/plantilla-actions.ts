"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

export type EstadoAccion = { error: string | null };

export type CategoriaServicioContrato = "guarderia" | "hotel" | "estetica";

export type EstadoCrearTipo = { error: string | null; tipoId?: string };

// Crear el tipo y publicar su primera versión es una sola llamada
// (crear_tipo_contrato lo hace en una transacción): un tipo sin texto
// aparecería como "falta este contrato" en los avisos sin que nadie
// pudiera generarlo.
export async function crearTipoContrato(
  nombre: string,
  categorias: CategoriaServicioContrato[],
  titulo: string,
  cuerpo: string
): Promise<EstadoCrearTipo> {
  if (!nombre.trim()) return { error: "Ponle un nombre al contrato (por ejemplo: Contrato de hotel)." };
  if (!titulo.trim()) return { error: "El título no puede estar vacío." };
  if (!cuerpo.trim()) return { error: "El cuerpo del contrato no puede estar vacío." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("crear_tipo_contrato", {
    p_nombre: nombre,
    p_categorias_servicio: categorias,
    p_titulo: titulo,
    p_cuerpo: cuerpo,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/contratos");
  return { error: null, tipoId: data as string };
}

export async function actualizarTipoContrato(
  tipoId: string,
  nombre: string,
  categorias: CategoriaServicioContrato[]
): Promise<EstadoAccion> {
  if (!nombre.trim()) return { error: "Ponle un nombre al contrato (por ejemplo: Contrato de hotel)." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("actualizar_tipo_contrato", {
    p_tipo_id: tipoId,
    p_nombre: nombre,
    p_categorias_servicio: categorias,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/contratos");
  return { error: null };
}

export async function archivarTipoContrato(tipoId: string): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("archivar_tipo_contrato", { p_tipo_id: tipoId });

  if (error) return { error: traducirError(error) };

  revalidatePath("/contratos");
  return { error: null };
}

export async function reactivarTipoContrato(tipoId: string): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reactivar_tipo_contrato", { p_tipo_id: tipoId });

  if (error) return { error: traducirError(error) };

  revalidatePath("/contratos");
  return { error: null };
}

export type EstadoPublicarPlantilla = { error: string | null; plantillaId?: string };

export async function publicarPlantilla(
  tipoId: string,
  titulo: string,
  cuerpo: string,
  requiereRefirma: boolean
): Promise<EstadoPublicarPlantilla> {
  if (!titulo.trim()) return { error: "El título no puede estar vacío." };
  if (!cuerpo.trim()) return { error: "El cuerpo del contrato no puede estar vacío." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("publicar_plantilla", {
    p_tipo_contrato_id: tipoId,
    p_titulo: titulo,
    p_cuerpo: cuerpo,
    p_requiere_refirma: requiereRefirma,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/contratos");
  return { error: null, plantillaId: data as string };
}

export async function marcarRequiereRefirma(
  plantillaId: string,
  valor: boolean
): Promise<EstadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("marcar_requiere_refirma", {
    p_plantilla_id: plantillaId,
    p_valor: valor,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/contratos");
  return { error: null };
}
