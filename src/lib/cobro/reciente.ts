import type { SupabaseClient } from "@supabase/supabase-js";
import { dinero } from "@/lib/dinero";
import { nombresDePersonal } from "@/lib/personal/nombres";

// N28: dos personas cobraron $10 cada una sobre la misma cuenta con 54 ms de diferencia y se registraron los dos
// sin aviso. Antes de registrar un cobro el servidor revisa si, desde que la pantalla se abrió, entró otro cobro a
// la cuenta (en los últimos 2 minutos: de otra persona siempre; propio, si la pantalla no lo vio) o si el saldo
// cambió; si pasó, no registra:
// pide confirmación con lo que encontró.

export const VENTANA_COBRO_RECIENTE_MS = 2 * 60 * 1000;

/** Lo que la pantalla sabía al abrirse: el saldo que mostraba y los cobros que ya listaba. */
export type ControlCobro = { saldoVisto: number; cobrosVistos: string[]; confirmado?: boolean };

export function hace(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return `${m} min`;
}

export type CobroReciente = { monto: number; hechoPor: string | null; hace: number };

/** Texto del aviso, o null si no hay nada que confirmar. Pura: la usan las pruebas. */
export function textoAvisoCobro(args: {
  reciente: CobroReciente | null;
  nombreAutor: string | null;
  saldoVisto: number;
  saldoActual: number;
}): string | null {
  const { reciente, nombreAutor, saldoVisto, saldoActual } = args;
  const cambioSaldo = Math.abs(saldoActual - saldoVisto) > 0.005;
  if (reciente) {
    const quien = nombreAutor ? ` por ${nombreAutor}` : "";
    return `Se acaba de registrar otro cobro de ${dinero(reciente.monto)}${quien} hace ${hace(reciente.hace)}. El saldo ahora es ${dinero(saldoActual)}. ¿Registrar de todos modos?`;
  }
  if (cambioSaldo) {
    return `El saldo cambió desde que abriste esta pantalla: antes era ${dinero(saldoVisto)} y ahora es ${dinero(saldoActual)}. ¿Registrar de todos modos?`;
  }
  return null;
}

export async function avisoCobroReciente(
  supabase: SupabaseClient,
  reservaIds: string[],
  control: ControlCobro,
  ctx: { esAdmin: boolean; negocioId: string; usuarioId?: string | null }
): Promise<string | null> {
  if (control.confirmado) return null;
  const desde = new Date(Date.now() - VENTANA_COBRO_RECIENTE_MS).toISOString();
  const [{ data: cobros }, totales] = await Promise.all([
    supabase
      .from("cobros")
      .select("id, created_at, created_by, grupo_id, cobro_metodos(monto, ajuste_id)")
      .in("reserva_id", reservaIds)
      .is("anulado_at", null)
      .gte("created_at", desde)
      .order("created_at", { ascending: false }),
    Promise.all(reservaIds.map((id) => supabase.rpc("cuenta_totales_reserva", { p_reserva_id: id }))),
  ]);
  const saldoActual =
    Math.round(
      totales.reduce((s, r) => {
        const fila = Array.isArray(r.data) ? r.data[0] : r.data;
        return s + Number(fila?.saldo ?? 0);
      }, 0) * 100
    ) / 100;

  // N28 (QA del 18 de octubre): un cobro de OTRA persona en los últimos 2 minutos siempre pide confirmación, aunque la
  // pantalla ya lo muestre (se actualizó sola). Uno propio que la pantalla ya vio no pregunta; uno propio que no vio
  // (otra pestaña) sí.
  const vistos = new Set(control.cobrosVistos);
  const nuevos = (cobros ?? []).filter((c) => (ctx.usuarioId && c.created_by !== ctx.usuarioId) || !vistos.has(c.id as string));
  let reciente: CobroReciente | null = null;
  let nombreAutor: string | null = null;
  if (nuevos.length > 0) {
    // Un cobro junto son varios cobros con el mismo grupo: se cuenta una vez, con todo lo que abonó.
    const primero = nuevos[0];
    const mismos = primero.grupo_id ? nuevos.filter((c) => c.grupo_id === primero.grupo_id) : [primero];
    const monto = mismos.reduce(
      (s, c) =>
        s +
        ((c.cobro_metodos as { monto: number; ajuste_id: string | null }[] | null) ?? [])
          .filter((m) => !m.ajuste_id)
          .reduce((a, m) => a + Number(m.monto), 0),
      0
    );
    reciente = { monto, hechoPor: (primero.created_by as string | null) ?? null, hace: Date.now() - new Date(primero.created_at as string).getTime() };
    if (reciente.hechoPor) {
      nombreAutor = (await nombresDePersonal(supabase, [reciente.hechoPor], { esAdmin: ctx.esAdmin, negocioId: ctx.negocioId })).get(reciente.hechoPor) ?? null;
    }
  }
  return textoAvisoCobro({ reciente, nombreAutor, saldoVisto: control.saldoVisto, saldoActual });
}
