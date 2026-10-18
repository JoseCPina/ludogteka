"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoDeCuenta = { id: string; total: number; saldo: number };

/**
 * Total y saldo vivos de unas cuentas (N29): la pantalla de cobro lo pregunta cada pocos segundos para enterarse
 * de un cobro, un cargo o una anulación hecha desde otra sesión. Lee con la sesión de quien llama (la RLS decide).
 */
export async function estadoDeCuentas(reservaIds: string[]): Promise<{ error: string | null; cuentas: EstadoDeCuenta[] }> {
  const ids = Array.from(new Set(reservaIds)).slice(0, 20);
  if (ids.length === 0) return { error: null, cuentas: [] };
  const supabase = await createSupabaseServerClient();
  const filas = await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await supabase.rpc("cuenta_totales_reserva", { p_reserva_id: id });
      const fila = Array.isArray(data) ? data[0] : data;
      if (error || !fila) return null;
      return { id, total: Number(fila.total_cuenta ?? fila.totalCuenta ?? 0), saldo: Number(fila.saldo ?? 0) };
    })
  );
  const cuentas = filas.filter((f): f is EstadoDeCuenta => f !== null);
  return cuentas.length === ids.length ? { error: null, cuentas } : { error: "No pudimos revisar la cuenta.", cuentas };
}
