"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "@/app/(staff)/reservas/traducir-error";
import { leerCotizacion, type CotizacionLinea } from "./cotizacion-linea";

// QA R50 (N133): la cotización de una línea con la regla con la que la base cobra (cotizar_linea_servicio).
export async function cotizarLineaServicio(
  perroId: string,
  servicioId: string,
  entrada: string | null,
  salida: string | null,
  horas: number | null
): Promise<{ error: string | null; cotizacion: CotizacionLinea | null }> {
  if (!perroId || !servicioId) return { error: null, cotizacion: null };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cotizar_linea_servicio", {
    p_perro_id: perroId,
    p_servicio_id: servicioId,
    p_entrada: entrada || null,
    p_salida: salida || null,
    p_horas: horas,
  });
  if (error) return { error: traducirError(error), cotizacion: null };
  return { error: null, cotizacion: leerCotizacion(data) };
}

// La talla y el pelaje del catálogo compartido, para el selector que sale junto al aviso.
export async function catalogoTallaPelaje(): Promise<{ tamanos: { id: string; etiqueta: string }[]; pelajes: { id: string; etiqueta: string }[] }> {
  const supabase = await createSupabaseServerClient();
  const [{ data: tamanos }, { data: pelajes }] = await Promise.all([
    supabase.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
    supabase.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden"),
  ]);
  return { tamanos: (tamanos ?? []) as { id: string; etiqueta: string }[], pelajes: (pelajes ?? []) as { id: string; etiqueta: string }[] };
}

// Guarda en el expediente lo que falta para el precio (solo lo que se escogió) y nada más.
export async function guardarTallaPelaje(perroId: string, tamanoId: string | null, pelajeId: string | null): Promise<{ error: string | null }> {
  if (!tamanoId && !pelajeId) return { error: "Elige lo que falta." };
  const supabase = await createSupabaseServerClient();
  const cambios: { tamano_id?: string; pelaje_id?: string } = {};
  if (tamanoId) cambios.tamano_id = tamanoId;
  if (pelajeId) cambios.pelaje_id = pelajeId;
  const { data, error } = await supabase.from("perros").update(cambios).eq("id", perroId).select("id");
  if (error) return { error: traducirError(error) };
  if (!data || data.length === 0) return { error: "No pudimos guardar: solo admin o recepción editan los datos del perro." };
  revalidatePath(`/perros/${perroId}`);
  return { error: null };
}
