"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { totalesDeCuenta } from "@/lib/cobro/totales";

/**
 * QA S63 (N170): el total, lo cobrado, lo devuelto y el saldo de una cuenta, y si todas sus estancias quedaron
 * canceladas o sin llegar, para repintar el encabezado de la reserva en cuanto una acción de la pantalla termina.
 * Lee con la sesión de quien llama (la RLS decide). No cambia nada.
 */
export async function cuentaDeReserva(reservaId: string): Promise<{
  total: number;
  cobrado: number;
  devuelto: number;
  saldo: number;
  todaCancelada: boolean;
} | null> {
  // registro-final: solo lee
  const supabase = await createSupabaseServerClient();
  const [t, { data: est }] = await Promise.all([
    totalesDeCuenta(supabase, reservaId),
    supabase.from("estancias").select("estado").eq("reserva_id", reservaId).is("deleted_at", null),
  ]);
  if (!t) return null;
  const filas = (est ?? []) as { estado: string }[];
  return {
    total: t.totalCuenta,
    cobrado: t.totalCobrado,
    devuelto: t.totalDevuelto,
    saldo: t.saldo,
    todaCancelada: filas.length > 0 && filas.every((f) => f.estado === "cancelada" || f.estado === "no_llego"),
  };
}
