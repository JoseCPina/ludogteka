import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarOrdenPoint, leerPagoDeOrden, simularOrdenPoint, type OrdenPoint } from "./point";
import { consultarPago, type PagoMp } from "./links";
import { modoSimulacion } from "./config";
import { describirEstadoOrden, ErrorMercadoPago } from "./errores";

/**
 * Sincronizar una orden nuestra con lo que Mercado Pago dice de ella y,
 * si ya se pagó, registrar el cobro (una sola vez: la RPC es idempotente).
 *
 * La llaman dos caminos que pueden llegar en cualquier orden y repetirse:
 * el webhook (Mercado Pago avisa) y la pantalla (recepción espera con el
 * cliente enfrente y consulta cada pocos segundos). Los dos terminan en
 * registrar_pago_mercadopago con el mismo pago, y la base registra uno.
 *
 * `admin` es el cliente con la secret key: es el único que puede llamar
 * a esa RPC (exige service_role) y escribir en mp_ordenes.
 */
export type OrdenLocal = {
  id: string;
  tipo: "point" | "link";
  estado: string;
  monto: number;
  mp_order_id: string | null;
  mp_payment_id: string | null;
  installments: number | null;
  simulado: boolean;
  created_at: string;
  cobro_id: string | null;
  expira_at: string | null;
};

export type ResultadoSincronizacion = {
  estado: string;
  pagada: boolean;
  registrado: boolean;
  sinTurno: boolean;
  detalle: string | null;
  installments: number | null;
};

const ESTADO_POR_MP: Record<string, string> = {
  created: "creada",
  at_terminal: "en_terminal",
  processing: "en_terminal",
  action_required: "en_terminal",
  processed: "pagada",
  canceled: "cancelada",
  cancelled: "cancelada",
  expired: "expirada",
  failed: "fallida",
  refunded: "reembolsada",
};

export async function leerOrdenLocal(admin: SupabaseClient, ordenId: string): Promise<OrdenLocal | null> {
  const { data } = await admin
    .from("mp_ordenes")
    .select("id, tipo, estado, monto, mp_order_id, mp_payment_id, installments, simulado, created_at, cobro_id, expira_at")
    .eq("id", ordenId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? ({ ...data, monto: Number(data.monto) } as OrdenLocal) : null;
}

async function registrar(
  admin: SupabaseClient,
  orden: OrdenLocal,
  pago: { paymentId: string | null; monto: number | null; installments: number | null; tipo: string | null },
  evento: unknown
): Promise<ResultadoSincronizacion> {
  const { data, error } = await admin.rpc("registrar_pago_mercadopago", {
    p_orden_id: orden.id,
    p_mp_payment_id: pago.paymentId,
    p_monto: pago.monto ?? orden.monto,
    p_installments: pago.installments ?? 1,
    p_mp_payment_type: pago.tipo,
    p_evento: evento ?? null,
  });
  if (error) throw new ErrorMercadoPago(error.message, 0, null, null);
  const r = data as { registrado: boolean; sin_turno?: boolean; cobro_id: string | null };
  return {
    estado: "pagada",
    pagada: true,
    registrado: Boolean(r.registrado),
    sinTurno: Boolean(r.sin_turno),
    detalle: null,
    installments: pago.installments ?? 1,
  };
}

async function marcar(admin: SupabaseClient, ordenId: string, estado: string, detalle: string | null, evento: unknown) {
  await admin
    .from("mp_ordenes")
    .update({ estado, detalle_error: detalle, notificado_at: new Date().toISOString(), ultimo_evento: evento ?? null })
    .eq("id", ordenId);
}

// Terminal: consulta la orden en Mercado Pago (o la simulación) y
// aplica lo que diga.
export async function sincronizarOrdenPoint(
  admin: SupabaseClient,
  orden: OrdenLocal,
  ordenMp?: OrdenPoint
): Promise<ResultadoSincronizacion> {
  if (orden.cobro_id || orden.estado === "pagada") {
    return { estado: "pagada", pagada: true, registrado: Boolean(orden.cobro_id), sinTurno: !orden.cobro_id, detalle: null, installments: orden.installments };
  }
  if (["cancelada", "expirada", "fallida", "reembolsada"].includes(orden.estado)) {
    return { estado: orden.estado, pagada: false, registrado: false, sinTurno: false, detalle: null, installments: null };
  }
  if (!orden.mp_order_id) {
    return { estado: orden.estado, pagada: false, registrado: false, sinTurno: false, detalle: "La orden no llegó a crearse en Mercado Pago.", installments: null };
  }

  const remota =
    ordenMp ??
    (orden.simulado || modoSimulacion()
      ? simularOrdenPoint({ creadaEn: orden.created_at, monto: orden.monto, plazos: orden.installments, mpOrderId: orden.mp_order_id })
      : await consultarOrdenPoint(orden.mp_order_id));

  const estadoMp = String(remota.status);
  if (estadoMp === "processed") {
    const pago = leerPagoDeOrden(remota);
    return registrar(admin, orden, pago, remota);
  }
  const local = ESTADO_POR_MP[estadoMp] ?? orden.estado;
  if (["cancelada", "expirada", "fallida", "reembolsada"].includes(local)) {
    const detalle = describirEstadoOrden(estadoMp, remota.status_detail ?? remota.transactions?.payments?.[0]?.status_detail);
    await marcar(admin, orden.id, local, detalle, remota);
    return { estado: local, pagada: false, registrado: false, sinTurno: false, detalle, installments: null };
  }
  if (local !== orden.estado) {
    await admin.from("mp_ordenes").update({ estado: local, ultimo_evento: remota }).eq("id", orden.id);
  }
  return { estado: local, pagada: false, registrado: false, sinTurno: false, detalle: null, installments: null };
}

// Link: un pago de Checkout Pro notificado por webhook (o leído de la
// simulación). Solo cuenta si está aprobado y su external_reference es
// una orden nuestra de tipo link.
export async function aplicarPagoLink(admin: SupabaseClient, orden: OrdenLocal, pago: PagoMp): Promise<ResultadoSincronizacion> {
  if (orden.cobro_id || orden.estado === "pagada") {
    return { estado: "pagada", pagada: true, registrado: Boolean(orden.cobro_id), sinTurno: !orden.cobro_id, detalle: null, installments: orden.installments };
  }
  if (pago.status === "approved") {
    const monto = Number(pago.transaction_amount ?? orden.monto);
    return registrar(
      admin,
      orden,
      {
        paymentId: String(pago.id),
        monto: Number.isFinite(monto) && monto > 0 ? monto : orden.monto,
        installments: Number(pago.installments ?? 1) || 1,
        tipo: pago.payment_type_id ?? null,
      },
      pago
    );
  }
  if (pago.status === "rejected" || pago.status === "cancelled") {
    // Un link rechazado no muere: el cliente puede volver a intentar con
    // otra tarjeta desde el mismo link. Se anota, no se cierra.
    await admin.from("mp_ordenes").update({ detalle_error: `Intento ${pago.status}: ${pago.status_detail ?? ""}`, ultimo_evento: pago }).eq("id", orden.id);
  }
  if (pago.status === "refunded" || pago.status === "charged_back") {
    await marcar(admin, orden.id, "reembolsada", `Mercado Pago reportó ${pago.status}.`, pago);
    return { estado: "reembolsada", pagada: false, registrado: false, sinTurno: false, detalle: null, installments: null };
  }
  return { estado: orden.estado, pagada: false, registrado: false, sinTurno: false, detalle: null, installments: null };
}

export async function sincronizarPagoPorId(admin: SupabaseClient, paymentId: string): Promise<ResultadoSincronizacion | null> {
  const pago = await consultarPago(paymentId);
  const ref = pago.external_reference;
  if (!ref) return null;
  const orden = await leerOrdenLocal(admin, ref);
  if (!orden) return null;
  return orden.tipo === "link" ? aplicarPagoLink(admin, orden, pago) : sincronizarOrdenPoint(admin, orden);
}
