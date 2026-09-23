import { mpFetch } from "./api";
import { TERMINAL_EXPIRACION_ORDEN, modoSimulacion } from "./config";

/**
 * Terminal Point por la API de Orders (la vigente para Point desde
 * 2025; la de Payment Intents quedó como legado).
 *
 *   POST /v1/orders            { type: "point", external_reference,
 *                                expiration_time, transactions.payments[{amount}],
 *                                config.point{terminal_id, print_on_terminal},
 *                                config.payment_method{default_installments, installments_cost} }
 *   GET  /v1/orders/{id}       estado: created | at_terminal | processing |
 *                                processed | canceled | expired | refunded | failed
 *   POST /v1/orders/{id}/cancel  solo mientras está created / at_terminal
 *   GET  /terminals/v1/list    terminales de la cuenta con operating_mode
 *   PATCH /terminals/v1/setup  { terminals: [{ id, operating_mode: "PDV" }] }
 */
export type EstadoOrdenMp =
  | "created"
  | "at_terminal"
  | "processing"
  | "processed"
  | "canceled"
  | "expired"
  | "refunded"
  | "failed"
  | "action_required";

export type OrdenPoint = {
  id: string;
  status: EstadoOrdenMp | string;
  status_detail?: string;
  external_reference?: string;
  total_paid_amount?: string | number;
  transactions?: {
    payments?: {
      id?: string;
      amount?: string | number;
      paid_amount?: string | number;
      status?: string;
      status_detail?: string;
      payment_method?: { id?: string; type?: string; installments?: number | string };
    }[];
  };
  config?: { point?: { terminal_id?: string } };
};

export type Terminal = { id: string; pos_id?: number | string; store_id?: string; external_pos_id?: string; operating_mode?: string };

export async function crearOrdenPoint(args: {
  monto: number;
  externalReference: string;
  descripcion: string;
  terminalId: string;
  plazos?: number | null;
}): Promise<OrdenPoint> {
  if (modoSimulacion()) {
    return {
      id: `SIM-ORD-${args.externalReference.slice(0, 8)}`,
      status: "at_terminal",
      external_reference: args.externalReference,
      config: { point: { terminal_id: args.terminalId } },
    };
  }
  const cuerpo: Record<string, unknown> = {
    type: "point",
    external_reference: args.externalReference,
    expiration_time: TERMINAL_EXPIRACION_ORDEN,
    description: args.descripcion.slice(0, 120),
    transactions: { payments: [{ amount: args.monto.toFixed(2) }] },
    config: {
      point: { terminal_id: args.terminalId, print_on_terminal: "seller_ticket" },
      ...(args.plazos && args.plazos > 1
        ? { payment_method: { default_type: "credit_card", default_installments: String(args.plazos), installments_cost: "seller" } }
        : {}),
    },
  };
  return mpFetch<OrdenPoint>("/v1/orders", { method: "POST", body: cuerpo, idempotencia: args.externalReference });
}

export async function consultarOrdenPoint(mpOrderId: string): Promise<OrdenPoint> {
  return mpFetch<OrdenPoint>(`/v1/orders/${encodeURIComponent(mpOrderId)}`);
}

export async function cancelarOrdenPoint(mpOrderId: string, idempotencia: string): Promise<OrdenPoint> {
  if (modoSimulacion()) return { id: mpOrderId, status: "canceled", status_detail: "canceled_by_api" };
  return mpFetch<OrdenPoint>(`/v1/orders/${encodeURIComponent(mpOrderId)}/cancel`, {
    method: "POST",
    body: {},
    idempotencia: `${idempotencia}-cancel`,
  });
}

export async function listarTerminales(): Promise<Terminal[]> {
  if (modoSimulacion()) {
    return [{ id: "SIMULADA__TERMINAL-01", pos_id: 0, store_id: "0", operating_mode: "PDV" }];
  }
  const r = await mpFetch<{ data?: { terminals?: Terminal[] }; terminals?: Terminal[] }>("/terminals/v1/list?limit=50");
  return r.data?.terminals ?? r.terminals ?? [];
}

export async function ponerTerminalEnPdv(terminalId: string): Promise<Terminal[]> {
  if (modoSimulacion()) return [{ id: terminalId, operating_mode: "PDV" }];
  const r = await mpFetch<{ terminals?: Terminal[] }>("/terminals/v1/setup", {
    method: "PATCH",
    body: { terminals: [{ id: terminalId, operating_mode: "PDV" }] },
  });
  return r.terminals ?? [];
}

// Lo que un pago procesado trae de vuelta, normalizado.
export function leerPagoDeOrden(orden: OrdenPoint): {
  paymentId: string | null;
  monto: number | null;
  installments: number | null;
  tipo: string | null;
  statusDetail: string | null;
} {
  const pago = orden.transactions?.payments?.[0];
  const monto = Number(pago?.paid_amount ?? orden.total_paid_amount ?? pago?.amount ?? NaN);
  const inst = Number(pago?.payment_method?.installments ?? 1);
  return {
    paymentId: pago?.id ?? null,
    monto: Number.isFinite(monto) && monto > 0 ? Math.round(monto * 100) / 100 : null,
    installments: Number.isFinite(inst) && inst > 0 ? inst : 1,
    tipo: pago?.payment_method?.type ?? null,
    statusDetail: pago?.status_detail ?? orden.status_detail ?? null,
  };
}

// ── Simulación de la terminal ──
// La orden simulada "se paga" sola a los 8 segundos. Los centavos del
// monto eligen el caso que se quiere probar:
//   .13 → el cliente cancela en la terminal a los 4 segundos
//   .77 → la terminal nunca contesta (para probar el tope y la salida manual)
//   cualquier otro → pagado, a 1 plazo salvo que se hayan pedido meses
export function simularOrdenPoint(args: { creadaEn: string; monto: number; plazos: number | null; mpOrderId: string }): OrdenPoint {
  const segundos = (Date.now() - new Date(args.creadaEn).getTime()) / 1000;
  const centavos = Math.round((args.monto * 100) % 100);
  const base: OrdenPoint = { id: args.mpOrderId, status: "at_terminal" };
  if (centavos === 77) return base;
  if (centavos === 13) {
    return segundos >= 4 ? { ...base, status: "canceled", status_detail: "canceled_by_user" } : base;
  }
  if (segundos < 8) return { ...base, status: segundos >= 5 ? "processing" : "at_terminal" };
  return {
    ...base,
    status: "processed",
    status_detail: "accredited",
    total_paid_amount: args.monto.toFixed(2),
    transactions: {
      payments: [
        {
          id: `SIM-PAY-${args.mpOrderId.slice(-8)}`,
          amount: args.monto.toFixed(2),
          paid_amount: args.monto.toFixed(2),
          status: "processed",
          status_detail: "accredited",
          payment_method: { id: "simulada", type: "credit_card", installments: args.plazos && args.plazos > 1 ? args.plazos : 1 },
        },
      ],
    },
  };
}
