"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

export type EstadoMovimiento = { error: string | null; ok?: boolean };

export async function registrarEntradaCompra(
  insumoId: string,
  proveedorId: string,
  cantidadCompra: number,
  costoUnitario: number,
  fechaCaducidad: string | null
): Promise<EstadoMovimiento> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_entrada_compra", {
    p_insumo_id: insumoId,
    p_proveedor_id: proveedorId,
    p_cantidad_compra: cantidadCompra,
    p_costo_unitario: costoUnitario,
    p_fecha_caducidad: fechaCaducidad,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/inventario/${insumoId}`);
  revalidatePath("/inventario");
  return { error: null, ok: true };
}

export async function registrarSalida(
  insumoId: string,
  cantidad: number,
  tipo: "consumo" | "merma",
  motivo: string | null
): Promise<EstadoMovimiento> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_salida", {
    p_insumo_id: insumoId,
    p_cantidad_consumo: cantidad,
    p_tipo: tipo,
    p_motivo: motivo,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/inventario/${insumoId}`);
  revalidatePath("/inventario");
  return { error: null, ok: true };
}

export async function registrarAjuste(
  insumoId: string,
  cantidad: number,
  sentido: "positivo" | "negativo",
  motivo: string
): Promise<EstadoMovimiento> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_ajuste", {
    p_insumo_id: insumoId,
    p_cantidad_consumo: cantidad,
    p_sentido: sentido,
    p_motivo: motivo,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/inventario/${insumoId}`);
  revalidatePath("/inventario");
  return { error: null, ok: true };
}
