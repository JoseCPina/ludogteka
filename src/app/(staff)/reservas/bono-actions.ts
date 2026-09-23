"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";
import type { LineaMetodo } from "./cobro-actions";

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

// Aplica el bono del dueño a una estancia de guardería que quedó pagando
// el día suelto (p. ej. se vendió el paquete después de reservar). La
// base elige cuál (el que vence primero) y dice qué queda.
export type ResultadoAplicarBonoEstancia = {
  error: string | null;
  aplicado?: boolean;
  motivo?: string;
  nombre?: string;
  ilimitado?: boolean;
  restantes?: number;
  total?: number;
  vence?: string | null;
};

export async function aplicarBonoAEstancia(estanciaId: string): Promise<ResultadoAplicarBonoEstancia> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("aplicar_bono_a_estancia", { p_estancia_id: estanciaId });
  if (error) return { error: traducirError(error) };

  revalidatePath(`/reservas/estancias/${estanciaId}/checkin`);
  return { error: null, ...(data as Omit<ResultadoAplicarBonoEstancia, "error">) };
}

// NUNCA re-exportar tipos desde un archivo "use server" (`export type {
// X }`): el build de producción de Next lo deja como un export en tiempo
// de ejecución de un nombre que TypeScript ya borró, y el módulo entero
// truena al cargarse ("ReferenceError: MetodoPago is not defined") —
// con él, TODA server action invocada desde la página que lo importe.
// Así estuvo rota la ficha del cliente en producción (link de
// complemento, restablecer contraseña) mientras en desarrollo funcionaba.
// Los tipos se importan de donde se definen (cobro-actions).
