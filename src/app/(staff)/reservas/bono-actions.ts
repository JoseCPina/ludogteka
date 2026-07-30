"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";
import type { MetodoPago, LineaMetodo } from "./cobro-actions";

export type EstadoComprarBono = { error: string | null; bonoId?: string; reservaId?: string };

export async function comprarBono(
  clienteId: string,
  servicioId: string,
  notas: string,
  metodos: LineaMetodo[]
): Promise<EstadoComprarBono> {
  if (metodos.length === 0) return { error: "Agrega al menos un método de pago." };
  if (metodos.some((m) => !Number.isFinite(m.monto) || m.monto <= 0)) {
    return { error: "Cada método debe tener un monto mayor a cero." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("comprar_bono", {
    p_cliente_id: clienteId,
    p_servicio_id: servicioId,
    p_notas: notas,
    p_metodos: metodos,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/clientes/${clienteId}`);
  return { error: null, bonoId: data as string };
}

export type ItemTipoBono = "estancia" | "cargo" | "estetica";

export type EstadoConsumirBono = { error: string | null; movimientoId?: string };

export async function consumirBono(
  reservaId: string,
  bonoClienteId: string,
  itemTipo: ItemTipoBono,
  itemId: string,
  cantidad: number
): Promise<EstadoConsumirBono> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("consumir_bono", {
    p_bono_cliente_id: bonoClienteId,
    p_item_tipo: itemTipo,
    p_item_id: itemId,
    p_cantidad: cantidad,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/reservas/${reservaId}`);
  revalidatePath(`/reservas/${reservaId}/cobrar`);
  return { error: null, movimientoId: data as string };
}

export type { MetodoPago };
