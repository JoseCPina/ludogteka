import type { SupabaseClient } from "@supabase/supabase-js";
import type { TextosPoliticas } from "./catalogo";

/**
 * Los textos que el negocio escribió (`negocio_politicas.textos`). Sin fila
 * o sin la clave, el que llama usa el texto por omisión del catálogo.
 * `negocioId` se filtra a mano por si el cliente es el de la secret key
 * (el alta por link no tiene sesión); con una sesión, la RLS ya acota.
 */
export async function cargarTextosPoliticas(cliente: SupabaseClient, negocioId: string): Promise<TextosPoliticas> {
  const { data } = await cliente
    .from("negocio_politicas")
    .select("textos")
    .eq("negocio_id", negocioId)
    .is("deleted_at", null)
    .maybeSingle();
  const textos = (data?.textos as Record<string, unknown> | null) ?? {};
  const salida: Record<string, string> = {};
  for (const [k, v] of Object.entries(textos)) if (typeof v === "string") salida[k] = v;
  return salida as TextosPoliticas;
}
