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

// Cuentas con saldo cuyos perros ya se fueron: todo lo de la cuenta
// terminó (estancia o cita finalizada) y no queda nada por venir. Sale de
// `cuentas_abiertas` (la misma cuenta y el mismo saldo que ve Caja), en
// una sola consulta en vez de una por reserva; `p_dias` alcanza a las que
// llevan semanas sin cobrarse, que son justo las que no se pueden perder.
// Ordenadas de la más vieja a la más nueva.
export async function cargarSaldosDeSalidas(supabase: SupabaseClient, hoy: string, dias = 120): Promise<SaldoDeSalida[]> {
  const { data: cuentas } = await supabase.rpc("cuentas_abiertas", { p_dias: dias });
  const filas = (cuentas ?? []) as {
    reserva_id: string;
    cliente_nombre: string;
    perros: string;
    descripcion: string;
    saldo: number;
  }[];
  if (filas.length === 0) return [];
  const ids = filas.map((c) => c.reserva_id);
  const [{ data: estancias }, { data: citas }] = await Promise.all([
    supabase.from("estancias").select("reserva_id, estado, hora_salida_real").in("reserva_id", ids).is("deleted_at", null),
    supabase.from("citas_estetica").select("reserva_id, estado, fin").in("reserva_id", ids).is("deleted_at", null),
  ]);
  const PENDIENTE = new Set(["reservada", "confirmada", "en_curso"]);
  const porReserva = new Map<string, { pendiente: boolean; salida: string | null }>();
  const anotar = (reservaId: string, estado: string, fin: string | null) => {
    const r = porReserva.get(reservaId) ?? { pendiente: false, salida: null };
    if (PENDIENTE.has(estado)) r.pendiente = true;
    if (estado === "finalizada" && fin && (!r.salida || fin > r.salida)) r.salida = fin;
    porReserva.set(reservaId, r);
  };
  for (const e of estancias ?? []) anotar(e.reserva_id as string, e.estado as string, (e.hora_salida_real as string | null) ?? null);
  for (const c of citas ?? []) anotar(c.reserva_id as string, c.estado as string, (c.fin as string | null) ?? null);

  const resultado: SaldoDeSalida[] = [];
  for (const c of filas) {
    const r = porReserva.get(c.reserva_id);
    if (!r || r.pendiente || !r.salida || Number(c.saldo) <= 0) continue;
    resultado.push({
      reservaId: c.reserva_id,
      clienteNombre: c.cliente_nombre,
      perros: c.perros,
      descripcion: c.descripcion,
      saldo: Number(c.saldo),
      salioEl: r.salida,
      dias: diasDesde(r.salida, hoy),
    });
  }
  return resultado.sort((a, b) => a.salioEl.localeCompare(b.salioEl));
}
