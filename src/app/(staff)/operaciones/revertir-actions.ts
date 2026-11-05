"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "@/app/(staff)/reservas/traducir-error";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import type { OperacionReversible, TipoReversion } from "@/lib/operaciones/reversion";

export type ResultadoReversion = {
  error: string | null;
  /** Lo que la base devolvió (estado nuevo, saldo, efectos). */
  resultado?: Record<string, unknown> | null;
  registros?: RegistroFinal[];
};

type Llamada = { fn: string; args: (id: string, motivo: string, op: OperacionReversible) => Record<string, unknown>; tabla: string };

const LLAMADAS: Record<TipoReversion, Llamada> = {
  checkin_estancia: { fn: "revertir_checkin_estancia", tabla: "estancias", args: (id, motivo, op) => ({ p_estancia: id, p_motivo: motivo, p_destino: op.destino ?? "reservada" }) },
  checkout_estancia: { fn: "revertir_checkout_estancia", tabla: "estancias", args: (id, motivo) => ({ p_estancia: id, p_motivo: motivo }) },
  no_llego_estancia: { fn: "reabrir_estancia", tabla: "estancias", args: (id, motivo) => ({ p_estancia: id, p_motivo: motivo }) },
  cancelacion_estancia: { fn: "reabrir_estancia", tabla: "estancias", args: (id, motivo) => ({ p_estancia: id, p_motivo: motivo }) },
  cancelacion_cita: { fn: "reabrir_cita", tabla: "citas_estetica", args: (id, motivo) => ({ p_cita: id, p_motivo: motivo }) },
  no_llego_cita: { fn: "reabrir_cita", tabla: "citas_estetica", args: (id, motivo) => ({ p_cita: id, p_motivo: motivo }) },
  eliminacion_cita: { fn: "reabrir_cita", tabla: "citas_estetica", args: (id, motivo) => ({ p_cita: id, p_motivo: motivo }) },
  finalizacion_cita: { fn: "revertir_finalizacion_cita", tabla: "citas_estetica", args: (id, motivo) => ({ p_cita: id, p_motivo: motivo }) },
  cargo_cancelado: { fn: "reactivar_cargo", tabla: "cargos_aplicados", args: (id, motivo) => ({ p_cargo: id, p_motivo: motivo }) },
  venta_cancelada: { fn: "reactivar_venta_mostrador", tabla: "ventas_mostrador", args: (id, motivo) => ({ p_venta: id, p_motivo: motivo }) },
  cuenta_cancelada: { fn: "reabrir_cuenta", tabla: "reservas", args: (id, motivo) => ({ p_reserva: id, p_motivo: motivo }) },
  devolucion: { fn: "anular_devolucion", tabla: "devoluciones", args: (id, motivo) => ({ p_devolucion: id, p_motivo: motivo }) },
};

/**
 * Deshace una operación (migración 20261203004300): la base revisa el permiso «Deshacer operaciones», el estado, el
 * cupo y el pase, hace los efectos encadenados y deja la bitácora. Devuelve el registro final para que la pantalla lo
 * pinte al recibir la respuesta.
 */
export async function revertirOperacion(op: OperacionReversible, motivo: string): Promise<ResultadoReversion> {
  const texto = motivo.trim();
  if (texto.length < 5) return { error: "Escribe el motivo (qué pasó), al menos 5 letras." };
  const llamada = LLAMADAS[op.tipo];
  if (!llamada) return { error: "Esa operación no se puede deshacer desde aquí." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(llamada.fn, llamada.args(op.id, texto, op));
  if (error) return { error: traducirError(error) };
  const resultado = (data ?? null) as Record<string, unknown> | null;
  const reservaId = typeof resultado?.reserva_id === "string" ? (resultado.reserva_id as string) : null;
  const registros = await registrosDe(supabase, [
    { t: llamada.tabla, i: op.id },
    ...(reservaId && llamada.tabla !== "reservas" ? [{ t: "reservas", i: reservaId }] : []),
  ]);
  return { error: null, resultado, registros };
}
