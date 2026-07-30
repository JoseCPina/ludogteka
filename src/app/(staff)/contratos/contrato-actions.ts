"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

const BUCKET = "perros-archivos";

export type EstadoGenerarContrato = { error: string | null; contratoId?: string };

export async function generarContrato(perroId: string): Promise<EstadoGenerarContrato> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("generar_contrato", { p_perro_id: perroId });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/perros/${perroId}`);
  return { error: null, contratoId: data as string };
}

// Igual patrón que la foto del perro (foto-actions.ts): el archivo lo
// sube el navegador directo a Storage con su propia sesión (política
// perros_archivos_insert_staff ya lo permite), esta función solo entrega
// la ruta fija por contrato para que no haya forma de pisar el escaneado
// de otro contrato.
export async function prepararRutaContratoPapel(
  contratoId: string,
  perroId: string,
  clienteId: string
): Promise<string> {
  return `${clienteId}/${perroId}/contrato/${contratoId}.pdf`;
}

export type EstadoAccionSimple = { error: string | null };

export async function registrarContratoPapel(
  contratoId: string,
  storagePath: string,
  hashPdf: string
): Promise<EstadoAccionSimple> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("subir_contrato_papel", {
    p_contrato_id: contratoId,
    p_storage_path: storagePath,
    p_hash_pdf: hashPdf,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/contratos");
  return { error: null };
}

export async function cancelarContrato(contratoId: string, motivo: string): Promise<EstadoAccionSimple> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancelar_contrato", {
    p_contrato_id: contratoId,
    p_motivo: motivo,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/contratos");
  return { error: null };
}

export async function obtenerUrlContratoStaff(storagePath: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60);
  return error ? null : data.signedUrl;
}
