import { mpFetch } from "./api";
import { TERMINAL_EXPIRACION_ORDEN } from "./config";
import { describirEstadoOrden } from "./errores";
import type { ConexionCobro, EstadoOrden, EstadoRemoto } from "@/lib/pagos/tipos";

/**
 * Terminal Point por la API de Orders (la vigente para Point desde 2025),
 * siempre con el token de la conexión del negocio.
 *
 *   POST /v1/orders            { type: "point", external_reference, expiration_time,
 *                                transactions.payments[{amount}], config.point{terminal_id} }
 *   GET  /v1/orders/{id}       created | at_terminal | processing | processed |
 *                                canceled | expired | refunded | failed
 *   POST /v1/orders/{id}/cancel  solo mientras está created / at_terminal
 *   GET  /terminals/v1/list    terminales de la cuenta con operating_mode
 *   PATCH /terminals/v1/setup  { terminals: [{ id, operating_mode: "PDV" }] }
 */
export type OrdenPoint = {
  id: string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  user_id?: string | number;
  total_paid_amount?: string | number;
  transactions?: {
    payments?: {
      id?: string;
      // El id del mismo pago en la API de pagos (/v1/payments/<id>), numérico:
      // de ahí sale la comisión (fee_details).
      reference_id?: string | number;
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

export const TERMINAL_SIMULADA = "SIMULADA__POINT-SMART-01";

function token(cx: ConexionCobro): string {
  return cx.mp?.accessToken ?? "";
}

/**
 * Solo Point Smart recibe órdenes de la app (API de Orders). El modelo va
 * al principio del id. Visto en la API real (28 de septiembre de 2026, la
 * cuenta de PeluDesk): NEWLAND_N950__… es Point Smart y DSPREAD_D20__… es
 * Point Smart 2 (las dos salen en /terminals/v1/list y aceptan modo PDV);
 * PAX_A910__… es la Point Smart de otros países. Cualquier otra (Point
 * Air, Mini, Blue) cobra sola, con el celular, y no se puede integrar.
 */
export function modeloDeTerminal(id: string): { nombre: string; compatible: boolean } {
  const prefijo = id.split("__")[0]?.toUpperCase() ?? "";
  if (prefijo.startsWith("SIMULADA")) return { nombre: "Point Smart (simulada)", compatible: true };
  if (prefijo.includes("N950")) return { nombre: "Point Smart", compatible: true };
  if (prefijo.includes("D20")) return { nombre: "Point Smart 2", compatible: true };
  if (prefijo.includes("A910")) return { nombre: "Point Smart", compatible: true };
  return { nombre: prefijo.replace(/_/g, " ") || id, compatible: false };
}

export async function crearOrdenPoint(
  cx: ConexionCobro,
  args: { monto: number; externalReference: string; descripcion: string; plazos?: number | null }
): Promise<OrdenPoint> {
  if (cx.simulado) {
    return {
      id: `SIM-ORD-${args.externalReference.slice(0, 8)}`,
      status: "at_terminal",
      external_reference: args.externalReference,
      config: { point: { terminal_id: cx.terminalId ?? TERMINAL_SIMULADA } },
    };
  }
  const cuerpo: Record<string, unknown> = {
    type: "point",
    external_reference: args.externalReference,
    expiration_time: TERMINAL_EXPIRACION_ORDEN,
    description: args.descripcion.slice(0, 120),
    transactions: { payments: [{ amount: args.monto.toFixed(2) }] },
    config: {
      point: { terminal_id: cx.terminalId, print_on_terminal: "seller_ticket" },
      ...(args.plazos && args.plazos > 1
        ? { payment_method: { default_type: "credit_card", default_installments: String(args.plazos), installments_cost: "seller" } }
        : {}),
    },
  };
  return mpFetch<OrdenPoint>(token(cx), "/v1/orders", { method: "POST", body: cuerpo, idempotencia: args.externalReference });
}

export async function consultarOrdenPoint(cx: ConexionCobro, mpOrderId: string): Promise<OrdenPoint> {
  return mpFetch<OrdenPoint>(token(cx), `/v1/orders/${encodeURIComponent(mpOrderId)}`);
}

export async function cancelarOrdenPoint(cx: ConexionCobro, mpOrderId: string, idempotencia: string): Promise<OrdenPoint> {
  if (cx.simulado) return { id: mpOrderId, status: "canceled", status_detail: "canceled_by_api" };
  return mpFetch<OrdenPoint>(token(cx), `/v1/orders/${encodeURIComponent(mpOrderId)}/cancel`, {
    method: "POST",
    body: {},
    idempotencia: `${idempotencia}-cancel`,
  });
}

export async function listarTerminales(cx: ConexionCobro): Promise<Terminal[]> {
  if (cx.simulado) return [{ id: TERMINAL_SIMULADA, pos_id: 0, store_id: "0", operating_mode: "PDV" }];
  const r = await mpFetch<{ data?: { terminals?: Terminal[] }; terminals?: Terminal[] }>(token(cx), "/terminals/v1/list?limit=50");
  return r.data?.terminals ?? r.terminals ?? [];
}

export async function ponerTerminalEnPdv(cx: ConexionCobro, terminalId: string): Promise<Terminal[]> {
  if (cx.simulado) return [{ id: terminalId, operating_mode: "PDV" }];
  const r = await mpFetch<{ terminals?: Terminal[] }>(token(cx), "/terminals/v1/setup", {
    method: "PATCH",
    body: { terminals: [{ id: terminalId, operating_mode: "PDV" }] },
  });
  return r.terminals ?? [];
}

const ESTADO_POR_MP: Record<string, EstadoOrden> = {
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

/** Una orden de Point, normalizada a lo que entiende la capa de cobro. */
export function normalizarOrdenPoint(orden: OrdenPoint, estadoPrevio: string): EstadoRemoto {
  const estadoMp = String(orden.status);
  const estado = ESTADO_POR_MP[estadoMp] ?? (estadoPrevio as EstadoOrden);
  const pago = orden.transactions?.payments?.[0];
  const monto = Number(pago?.paid_amount ?? orden.total_paid_amount ?? pago?.amount ?? NaN);
  const inst = Number(pago?.payment_method?.installments ?? 1);
  return {
    estado,
    pago:
      estado === "pagada"
        ? {
            paymentId: pago?.id ?? null,
            monto: Number.isFinite(monto) && monto > 0 ? Math.round(monto * 100) / 100 : null,
            installments: Number.isFinite(inst) && inst > 0 ? inst : 1,
            tipo: pago?.payment_method?.type ?? null,
          }
        : null,
    detalle: ["cancelada", "expirada", "fallida", "reembolsada"].includes(estado)
      ? describirEstadoOrden(estadoMp, orden.status_detail ?? pago?.status_detail)
      : null,
    cuentaId: orden.user_id != null ? String(orden.user_id) : null,
    referencia: orden.external_reference ?? null,
    crudo: orden,
  };
}
