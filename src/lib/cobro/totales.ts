import type { SupabaseClient } from "@supabase/supabase-js";

/** Los totales de una cuenta tal como los muestra la pantalla de cobro (de `cuenta_totales_reserva`). */
export type TotalesCuenta = {
  totalCuenta: number;
  totalCobrado: number;
  totalPropinas: number;
  totalDevuelto: number;
  totalBono: number;
  totalDescuento: number;
  saldo: number;
};

export function totalesDeFila(crudo: unknown): TotalesCuenta {
  const f = (Array.isArray(crudo) ? crudo[0] : crudo) as Record<string, unknown> | null | undefined;
  return {
    totalCuenta: Number(f?.total_cuenta ?? 0),
    totalCobrado: Number(f?.total_cobrado ?? 0),
    totalPropinas: Number(f?.total_propinas ?? 0),
    totalDevuelto: Number(f?.total_devuelto ?? 0),
    totalBono: Number(f?.total_bono ?? 0),
    totalDescuento: Number(f?.total_descuento ?? 0),
    saldo: Number(f?.saldo ?? 0),
  };
}

/**
 * QA S15 (N45): después de registrar, anular o corregir un cobro, la acción devuelve los totales nuevos para que la
 * pantalla los pinte de inmediato, sin esperar a que llegue la página refrescada (2 a 5 s con la base lenta).
 */
export async function totalesDeCuenta(supabase: SupabaseClient, reservaId: string | null | undefined): Promise<TotalesCuenta | undefined> {
  if (!reservaId) return undefined;
  const { data, error } = await supabase.rpc("cuenta_totales_reserva", { p_reserva_id: reservaId });
  if (error || !data) return undefined;
  return totalesDeFila(data);
}
