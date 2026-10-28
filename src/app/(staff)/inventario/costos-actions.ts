"use server";

import { esErrorSoloLectura, mensajeSoloLectura } from "@/lib/solo-lectura";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

export type EstadoCosto = { error: string | null; ok?: boolean; registros?: RegistroFinal[] };

// Costo de referencia por unidad de compra: lo que admin (o quien tenga el
// permiso de costos) completa para lo que recepción dio de alta sin costo.
// La base lo rechaza a cualquier otro (insumos_costos).
export async function guardarCostoReferencia(insumoId: string, costo: number): Promise<EstadoCosto> {
  if (!(costo >= 0)) return { error: "El costo no puede ser negativo." };
  const supabase = await createSupabaseServerClient();
  const { data: existente } = await supabase
    .from("insumos_costos")
    .select("id")
    .eq("insumo_id", insumoId)
    .maybeSingle();
  const { data: guardado, error } = existente
    ? await supabase.from("insumos_costos").update({ costo_unitario_compra: costo }).eq("id", existente.id).select("id")
    : await supabase.from("insumos_costos").insert({ insumo_id: insumoId, costo_unitario_compra: costo }).select("id");
  if (error) return { error: esErrorSoloLectura(error) ? mensajeSoloLectura(error) : error.code === "42501" ? "No tienes permiso para capturar costos." : traducirError(error) };
  revalidatePath("/inventario");
  revalidatePath("/inventario/sin-costo");
  revalidatePath(`/inventario/${insumoId}`);
  return { error: null, ok: true, registros: await registrosDe(supabase, [{ t: "insumos_costos", i: (guardado?.[0]?.id as string | undefined) ?? existente?.id }, { t: "insumos", i: insumoId }]) };
}
