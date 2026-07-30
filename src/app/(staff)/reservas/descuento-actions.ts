"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";

export type TipoDescuento = "porcentaje" | "monto_fijo";

export type EstadoAplicarDescuento = { error: string | null; descuentoId?: string };

export async function aplicarDescuento(
  reservaId: string,
  catalogoDescuentoId: string,
  tipo: TipoDescuento,
  valor: number,
  motivoAdicional: string
): Promise<EstadoAplicarDescuento> {
  if (!catalogoDescuentoId) return { error: "Elige un motivo de descuento." };
  if (!Number.isFinite(valor) || valor <= 0) return { error: "El valor debe ser mayor a cero." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("aplicar_descuento", {
    p_reserva_id: reservaId,
    p_catalogo_descuento_id: catalogoDescuentoId,
    p_tipo: tipo,
    p_valor: valor,
    p_motivo_adicional: motivoAdicional,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/reservas/${reservaId}`);
  revalidatePath(`/reservas/${reservaId}/cobrar`);
  return { error: null, descuentoId: data as string };
}

export type EstadoAccionSimple = { error: string | null };

export async function cancelarDescuento(
  reservaId: string,
  descuentoId: string,
  motivo: string
): Promise<EstadoAccionSimple> {
  if (!motivo.trim()) return { error: "Escribe el motivo de la cancelación." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("descuentos_aplicados")
    .update({ cancelado: true, motivo_cancelacion: motivo })
    .eq("id", descuentoId);

  if (error) return { error: traducirError(error) };

  revalidatePath(`/reservas/${reservaId}`);
  revalidatePath(`/reservas/${reservaId}/cobrar`);
  return { error: null };
}
