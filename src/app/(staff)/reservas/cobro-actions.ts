"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";

export type MetodoPago = "efectivo" | "terminal" | "transferencia" | "tarjeta_manual";

// Una línea de «tarjeta_manual» trae además el folio del voucher y el motivo
// (los valida la base; ver src/lib/cobro/tarjeta-manual.ts).
export type LineaMetodo = {
  metodo: MetodoPago;
  monto: number;
  propina: number;
  folio?: string;
  motivo?: string;
  motivo_texto?: string;
  ultimos4?: string;
  banco?: string;
};

/** `cambio` = efectivo recibido de más: no entra a la caja, se devuelve al cliente. */
export type EstadoCobro = { error: string | null; cobroId?: string; cambio?: number };

export async function registrarCobro(
  reservaId: string,
  notas: string,
  metodos: LineaMetodo[]
): Promise<EstadoCobro> {
  if (metodos.length === 0) return { error: "Agrega al menos un método de pago." };
  if (metodos.some((m) => !Number.isFinite(m.monto) || m.monto <= 0)) {
    return { error: "Cada método debe tener un monto mayor a cero." };
  }

  const supabase = await createSupabaseServerClient();
  // El saldo antes de cobrar: la base cobra solo hasta el saldo y lo que sobra en efectivo es cambio.
  const { data: totales } = await supabase.rpc("cuenta_totales_reserva", { p_reserva_id: reservaId });
  const saldoAntes = Number((Array.isArray(totales) ? totales[0] : totales)?.saldo ?? 0);
  const { data, error } = await supabase.rpc("registrar_cobro", {
    p_reserva_id: reservaId,
    p_notas: notas,
    p_metodos: metodos,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/reservas/${reservaId}`);
  revalidatePath(`/reservas/${reservaId}/cobrar`);
  const recibido = metodos.reduce((s, m) => s + m.monto, 0);
  const cambio = Math.round((recibido - saldoAntes) * 100) / 100;
  return { error: null, cobroId: data as string, cambio: cambio > 0.005 ? cambio : undefined };
}

export type EstadoDevolucion = { error: string | null; devolucionId?: string };

export async function registrarDevolucion(
  reservaId: string,
  cobroId: string,
  motivo: string,
  metodos: { metodo: MetodoPago; monto: number }[]
): Promise<EstadoDevolucion> {
  if (metodos.length === 0) return { error: "Agrega al menos un método a devolver." };
  if (metodos.some((m) => !Number.isFinite(m.monto) || m.monto <= 0)) {
    return { error: "Cada método debe tener un monto mayor a cero." };
  }
  if (!motivo.trim()) return { error: "Escribe el motivo de la devolución." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_devolucion", {
    p_cobro_id: cobroId,
    p_motivo: motivo,
    p_metodos: metodos,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath(`/reservas/${reservaId}`);
  revalidatePath(`/reservas/${reservaId}/cobrar`);
  return { error: null, devolucionId: data as string };
}
