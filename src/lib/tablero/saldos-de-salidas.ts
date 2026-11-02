import type { SupabaseClient } from "@supabase/supabase-js";
import { diasDesde } from "@/lib/antiguedad";

export type SaldoDeSalida = {
  reservaId: string;
  clienteNombre: string;
  perros: string;
  descripcion: string;
  saldo: number;
  // Cuándo se fue el último perro de la cuenta: desde ahí se debe.
  salioEl: string;
  dias: number;
};

// Cuentas con saldo cuyos perros ya se fueron: todo lo de la cuenta terminó (estancia o cita finalizada) y no queda
// nada por venir. Sale de `saldos_de_salidas_json` (migración 20261203001500): la misma cuenta y el mismo saldo que ve
// Caja (`cuentas_abiertas`), ya filtrada en la base, en UNA consulta (antes eran tres: todas las cuentas abiertas y
// después sus estancias y sus citas). `p_dias` alcanza a las que llevan semanas sin cobrarse, que son justo las que no
// se pueden perder. Ordenadas de la más vieja a la más nueva.
export async function cargarSaldosDeSalidas(supabase: SupabaseClient, hoy: string, zona: string, dias = 120): Promise<SaldoDeSalida[]> {
  const { data } = await supabase.rpc("saldos_de_salidas_json", { p_dias: dias });
  const filas = (data ?? []) as {
    reserva_id: string;
    cliente_nombre: string;
    perros: string;
    descripcion: string;
    saldo: number;
    salio_el: string;
  }[];
  return filas
    .filter((c) => c.salio_el && Number(c.saldo) > 0)
    .map((c) => ({
      reservaId: c.reserva_id,
      clienteNombre: c.cliente_nombre,
      perros: c.perros,
      descripcion: c.descripcion,
      saldo: Number(c.saldo),
      salioEl: c.salio_el,
      dias: diasDesde(c.salio_el, hoy, zona),
    }))
    .sort((a, b) => a.salioEl.localeCompare(b.salioEl));
}
