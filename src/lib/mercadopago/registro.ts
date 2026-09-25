import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarOrdenPoint, leerPagoDeOrden, simularOrdenPoint, type OrdenPoint } from "./point";
import { comisionDePago, consultarPago, type PagoMp } from "./links";
import { modoSimulacion } from "./config";
import { describirEstadoOrden, ErrorMercadoPago } from "./errores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

// PeluDesk: `admin` salta la RLS; la orden se busca SOLO en el negocio
// de quien pregunta.
export async function leerOrdenLocal(admin: SupabaseClient, ordenId: string, negocioId: string): Promise<OrdenLocal | null> {
  const { data } = await admin
    .from("mp_ordenes")
    .select("id, tipo, estado, monto, mp_order_id, mp_payment_id, installments, simulado, created_at, cobro_id, expira_at")
    .eq("id", ordenId)
    .eq("negocio_id", negocioId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? ({ ...data, monto: Number(data.monto) } as OrdenLocal) : null;
}

// La comisión de Mercado Pago de un cobro ya registrado entra sola como
// gasto del local (categoría Comisiones), una vez por orden. Si la API no
// la trae, o algo falla aquí, el cobro NO se afecta: queda para captura
// manual.
async function registrarComision(admin: SupabaseClient, orden: OrdenLocal, pago: PagoMp | null) {
  try {
    if (!pago || orden.simulado || modoSimulacion()) return;
    const monto = comisionDePago(pago);
    if (!(monto > 0)) return;
    const tipo = orden.tipo === "point" ? "terminal" : "link de pago";
    const detalle = `Cobro por ${tipo}, pago ${pago.id}: ${(pago.fee_details ?? []).map((f) => `${f.type ?? "comisión"} ${f.amount}`).join(", ")}`;
    const { error } = await admin.rpc("registrar_comision_mercadopago", { p_orden_id: orden.id, p_monto: monto, p_detalle: detalle });
    if (error) console.error("[mercadopago] comisión no registrada", orden.id, error.message);
  } catch (e) {
    console.error("[mercadopago] comisión no registrada", orden.id, e);
  }
}

// En la terminal (API de Orders) la comisión no viene en la orden: se
// intenta leer el pago con la API de pagos, solo si su id es de esa API.
async function pagoDeTerminal(paymentId: string | null): Promise<PagoMp | null> {
  if (!paymentId || !/^\d+$/.test(paymentId)) return null;
  try {
    return await consultarPago(paymentId);
  } catch {
    return null;
  }
}

async function registrar(
  admin: SupabaseClient,
  orden: OrdenLocal,
  pago: { paymentId: string | null; monto: number | null; installments: number | null; tipo: string | null },
  evento: unknown,
  pagoMp: PagoMp | null = null
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
  if (r.registrado) {
    const conComision = pagoMp ?? (orden.tipo === "point" && !orden.simulado && !modoSimulacion() ? await pagoDeTerminal(pago.paymentId) : null);
    await registrarComision(admin, orden, conComision);
  }
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
      pago,
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

/**
 * PeluDesk: una notificación de Mercado Pago (o el link simulado) no trae
 * negocio — llega sin sesión y sin dominio de negocio que valga. El negocio
 * se deduce de LA ORDEN (esa única lectura va sin encabezado), y todo lo
 * demás corre con un cliente atado al negocio de la orden: la RPC que
 * registra el cobro solo ve ese negocio.
 */
export async function contextoDeOrden(
  filtro: { id: string } | { mp_order_id: string }
): Promise<{ admin: SupabaseClient; orden: OrdenLocal } | null> {
  const [columna, valor] = "id" in filtro ? ["id", filtro.id] : ["mp_order_id", filtro.mp_order_id];
  if ("id" in filtro && !/^[0-9a-f-]{36}$/i.test(valor)) return null;
  const { data: fila } = await createSupabaseAdminClient()
    .from("mp_ordenes")
    .select("id, negocio_id")
    .eq(columna, valor)
    .is("deleted_at", null)
    .maybeSingle();
  if (!fila) return null;
  const admin = createSupabaseAdminClient(fila.negocio_id as string);
  const orden = await leerOrdenLocal(admin, fila.id as string, fila.negocio_id as string);
  return orden ? { admin, orden } : null;
}

export async function sincronizarPagoPorId(paymentId: string): Promise<ResultadoSincronizacion | null> {
  const pago = await consultarPago(paymentId);
  const ref = pago.external_reference;
  if (!ref) return null;
  const ctx = await contextoDeOrden({ id: ref });
  if (!ctx) return null;
  return ctx.orden.tipo === "link" ? aplicarPagoLink(ctx.admin, ctx.orden, pago) : sincronizarOrdenPoint(ctx.admin, ctx.orden);
}
