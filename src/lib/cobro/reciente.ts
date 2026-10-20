import type { SupabaseClient } from "@supabase/supabase-js";
import { dinero } from "@/lib/dinero";
import { nombresDePersonal } from "@/lib/personal/nombres";

// N28: dos personas cobraron $10 cada una sobre la misma cuenta con 54 ms de diferencia y se registraron los dos
// sin aviso. Antes de registrar un cobro el servidor revisa si en los últimos 2 minutos entró a la cuenta un cobro
// que NO registró esta misma pantalla (de otra persona, o de la misma cuenta desde otra ventana) o si el saldo cambió
// desde lo que la pantalla mostraba; si pasó, no registra: pide confirmación con lo que encontró.
// QA S15 (19 de octubre de 2026): con F5 la pantalla nacía «sabiendo» el cobro de la otra ventana y la regla vieja
// (los cobros que la pantalla ya listaba no contaban) lo dejaba pasar. Ahora no importa qué listaba la pantalla: solo
// se exime lo que ESTA CARGA de la pantalla registró (`cobrosDeEstaPantalla`, en memoria: un F5 es otra carga).

export const VENTANA_COBRO_RECIENTE_MS = 2 * 60 * 1000;

/**
 * Lo que la pantalla sabía: el saldo que mostraba, los cobros que listaba (informativo) y los cobros (o cobros junto)
 * que registró ella misma: solo esos no piden confirmación.
 */
export type ControlCobro = { saldoVisto: number; cobrosVistos?: string[]; cobrosDeEstaPantalla?: string[]; confirmado?: boolean };

export function hace(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return `${m} min`;
}

export type CobroReciente = { monto: number; hechoPor: string | null; hace: number; mismaCuenta?: boolean };

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
    const quien = reciente.mismaCuenta ? " con tu cuenta desde otra ventana" : nombreAutor ? ` por ${nombreAutor}` : "";
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
  control: ControlCobro | undefined,
  ctx: { esAdmin: boolean; negocioId: string; usuarioId?: string | null }
): Promise<string | null> {
  if (control?.confirmado) return null;
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

  // Todo cobro de los últimos 2 minutos que no registró esta pantalla pide confirmación, sin importar si la pantalla
  // ya lo enseñaba (se actualizó sola, F5 o se volvió a entrar) ni quién lo hizo.
  const propios = new Set(control?.cobrosDeEstaPantalla ?? []);
  const nuevos = (cobros ?? []).filter((c) => !propios.has(c.id as string) && !(c.grupo_id && propios.has(c.grupo_id as string)));
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
    const hechoPor = (primero.created_by as string | null) ?? null;
    reciente = { monto, hechoPor, hace: Date.now() - new Date(primero.created_at as string).getTime(), mismaCuenta: Boolean(ctx.usuarioId && hechoPor === ctx.usuarioId) };
    if (reciente.hechoPor && !reciente.mismaCuenta) {
      nombreAutor = (await nombresDePersonal(supabase, [reciente.hechoPor], { esAdmin: ctx.esAdmin, negocioId: ctx.negocioId })).get(reciente.hechoPor) ?? null;
    }
  }
  // Sin lo que la pantalla mostraba no se compara el saldo: solo los cobros recientes.
  return textoAvisoCobro({ reciente, nombreAutor, saldoVisto: control?.saldoVisto ?? saldoActual, saldoActual });
}
