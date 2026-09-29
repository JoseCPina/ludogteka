"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../reservas/traducir-error";

export type LineaVenta = { insumoId: string | null; concepto: string; precio: number | null; cantidad: number };
export type ResultadoVenta = { error: string | null; reservaId?: string };

// La venta de mostrador: la base arma la cuenta (de la persona o de
// «Público en general»), descuenta el inventario y devuelve la cuenta para
// cobrarla en la pantalla de cobro de siempre.
export async function crearVentaRapida(clienteId: string | null, lineas: LineaVenta[], notas: string): Promise<ResultadoVenta> {
  if (lineas.length === 0) return { error: "Agrega al menos un producto o concepto." };
  for (const l of lineas) {
    if (!Number.isFinite(l.cantidad) || l.cantidad <= 0) return { error: "Cada renglón necesita una cantidad mayor a cero." };
    if (!l.insumoId) {
      if (!l.concepto.trim()) return { error: "Escribe qué se vende en cada renglón." };
      if (!l.precio || !Number.isFinite(l.precio) || l.precio <= 0) return { error: "Cada concepto necesita un precio mayor a cero." };
    }
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("crear_venta_mostrador", {
    p_cliente_id: clienteId,
    p_lineas: lineas.map((l) => (l.insumoId ? { insumo_id: l.insumoId, cantidad: l.cantidad } : { concepto: l.concepto.trim(), precio: l.precio, cantidad: l.cantidad })),
    p_notas: notas,
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/caja");
  revalidatePath("/inventario");
  return { error: null, reservaId: data as string };
}

export async function cancelarRenglonVenta(ventaId: string, reservaId: string, motivo: string): Promise<{ error: string | null }> {
  if (!motivo.trim()) return { error: "Escribe por qué se cancela." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancelar_venta_mostrador", { p_venta_id: ventaId, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/caja/cobrar/${reservaId}`);
  revalidatePath(`/reservas/${reservaId}/cobrar`);
  revalidatePath("/caja");
  revalidatePath("/inventario");
  return { error: null };
}
