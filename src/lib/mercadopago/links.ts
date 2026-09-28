import { mpFetch } from "./api";
import { LINK_VIGENCIA_DIAS, urlPublicaLegado } from "./config";
import { urlPlataforma } from "@/lib/pagos/urls";
import type { ConexionCobro, EstadoRemoto } from "@/lib/pagos/tipos";

/**
 * Links de pago por Checkout Pro, con el token de la conexión del negocio
 * y a nombre del negocio (título, descripción y lo que sale en el estado de
 * cuenta del cliente). Cuando el cliente paga, llega la notificación
 * (topic payment) y con GET /v1/payments/{id} se lee external_reference
 * (nuestra orden), el monto, el estado y la cuenta que cobró.
 */
export type PreferenciaMp = { id: string; init_point: string; sandbox_init_point?: string };

export type PagoMp = {
  id: number | string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  payment_type_id?: string;
  payment_method_id?: string;
  installments?: number;
  date_approved?: string;
  live_mode?: boolean;
  collector_id?: number | string;
  // Lo que Mercado Pago retuvo del cobro (su comisión, impuestos de la
  // comisión, financiamiento…). fee_payer "collector" = lo pagó el negocio.
  fee_details?: { type?: string; amount?: number; fee_payer?: string }[];
};

// La comisión que le costó al negocio este pago (0 si la API no la trae).
export function comisionDePago(pago: PagoMp): number {
  const total = (pago.fee_details ?? [])
    .filter((f) => (f.fee_payer ?? "collector") !== "payer")
    .reduce((s, f) => s + (Number(f.amount) || 0), 0);
  return Math.round(total * 100) / 100;
}

// Lo que sale en el estado de cuenta del cliente: el nombre del negocio,
// en mayúsculas, sin acentos, 22 caracteres como máximo.
export function descriptorDeCuenta(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, 22) || "PELUDESK";
}

/** Adónde avisa Mercado Pago de un pago de esta conexión. */
export function urlWebhookDe(cx: ConexionCobro): string {
  // La llave del entorno es de la aplicación de Ludogteka: su webhook sigue
  // donde siempre. Todo lo de OAuth va al webhook único de PeluDesk.
  return cx.origen === "llave_entorno"
    ? `${urlPublicaLegado()}/api/mercadopago/webhook`
    : `${urlPlataforma()}/api/mercadopago/webhook`;
}

export async function crearLinkPago(
  cx: ConexionCobro,
  args: { ordenId: string; monto: number; titulo: string; clienteNombre: string; clienteTelefono: string | null; expiraAt: Date }
): Promise<PreferenciaMp> {
  if (cx.simulado) {
    return {
      id: `SIM-PREF-${args.ordenId.slice(0, 8)}`,
      init_point: `${cx.negocio.url}/api/mercadopago/simulacion/${args.ordenId}`,
    };
  }
  const desde = new Date();
  const cuerpo = {
    items: [
      {
        id: args.ordenId,
        title: args.titulo.slice(0, 120),
        description: `${cx.negocio.nombre} — pago de tu cuenta`.slice(0, 250),
        quantity: 1,
        unit_price: Math.round(args.monto * 100) / 100,
        currency_id: "MXN",
      },
    ],
    payer: {
      name: args.clienteNombre,
      ...(args.clienteTelefono ? { phone: { area_code: "52", number: args.clienteTelefono } } : {}),
    },
    external_reference: args.ordenId,
    notification_url: urlWebhookDe(cx),
    back_urls: {
      success: `${cx.negocio.url}/portal`,
      pending: `${cx.negocio.url}/portal`,
      failure: `${cx.negocio.url}/portal`,
    },
    auto_return: "approved",
    expires: true,
    expiration_date_from: desde.toISOString(),
    expiration_date_to: args.expiraAt.toISOString(),
    statement_descriptor: descriptorDeCuenta(cx.negocio.nombre),
    metadata: { orden_id: args.ordenId, peludesk_negocio_id: cx.negocio.id },
  };
  return mpFetch<PreferenciaMp>(cx.mp?.accessToken ?? "", "/checkout/preferences", {
    method: "POST",
    body: cuerpo,
    idempotencia: `pref-${args.ordenId}`,
  });
}

export async function consultarPago(cx: ConexionCobro, paymentId: string): Promise<PagoMp> {
  return mpFetch<PagoMp>(cx.mp?.accessToken ?? "", `/v1/payments/${encodeURIComponent(paymentId)}`);
}

export function vigenciaLink(): Date {
  return new Date(Date.now() + LINK_VIGENCIA_DIAS * 24 * 60 * 60 * 1000);
}

/** Un pago de Checkout Pro, normalizado. */
export function normalizarPagoLink(pago: PagoMp, estadoPrevio: string): EstadoRemoto {
  const monto = Number(pago.transaction_amount ?? NaN);
  const aprobado = pago.status === "approved";
  const reembolsado = pago.status === "refunded" || pago.status === "charged_back";
  return {
    estado: aprobado ? "pagada" : reembolsado ? "reembolsada" : (estadoPrevio as EstadoRemoto["estado"]),
    pago: aprobado
      ? {
          paymentId: String(pago.id),
          monto: Number.isFinite(monto) && monto > 0 ? monto : null,
          installments: Number(pago.installments ?? 1) || 1,
          tipo: pago.payment_type_id ?? null,
        }
      : null,
    detalle:
      pago.status === "rejected" || pago.status === "cancelled"
        ? `Intento ${pago.status}: ${pago.status_detail ?? ""}`
        : reembolsado
          ? `Mercado Pago reportó ${pago.status}.`
          : null,
    cuentaId: pago.collector_id != null ? String(pago.collector_id) : null,
    referencia: pago.external_reference ?? null,
    crudo: pago,
  };
}
