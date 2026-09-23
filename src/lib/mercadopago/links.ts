import { mpFetch } from "./api";
import { LINK_VIGENCIA_DIAS, modoSimulacion, urlPublica, urlWebhook } from "./config";

/**
 * Links de pago por Checkout Pro: una preferencia con el monto y la
 * cuenta, y Mercado Pago devuelve init_point, que es el link que se le
 * manda al cliente por WhatsApp. Cuando paga, llega la notificación
 * (topic payment) y con GET /v1/payments/{id} se lee external_reference
 * (nuestra orden), el monto y el estado.
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
};

export async function crearLinkPago(args: {
  ordenId: string;
  monto: number;
  titulo: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  expiraAt: Date;
}): Promise<PreferenciaMp> {
  if (modoSimulacion()) {
    return {
      id: `SIM-PREF-${args.ordenId.slice(0, 8)}`,
      init_point: `${urlPublica()}/api/mercadopago/simulacion/${args.ordenId}`,
    };
  }
  const desde = new Date();
  const cuerpo = {
    items: [
      {
        id: args.ordenId,
        title: args.titulo.slice(0, 120),
        description: "Ludogteka — guardería, hotel y estética canina",
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
    notification_url: urlWebhook(),
    back_urls: {
      success: `${urlPublica()}/portal`,
      pending: `${urlPublica()}/portal`,
      failure: `${urlPublica()}/portal`,
    },
    auto_return: "approved",
    expires: true,
    expiration_date_from: desde.toISOString(),
    expiration_date_to: args.expiraAt.toISOString(),
    statement_descriptor: "LUDOGTEKA",
    metadata: { orden_id: args.ordenId },
  };
  return mpFetch<PreferenciaMp>("/checkout/preferences", { method: "POST", body: cuerpo, idempotencia: `pref-${args.ordenId}` });
}

export async function consultarPago(paymentId: string): Promise<PagoMp> {
  return mpFetch<PagoMp>(`/v1/payments/${encodeURIComponent(paymentId)}`);
}

export function vigenciaLink(): Date {
  return new Date(Date.now() + LINK_VIGENCIA_DIAS * 24 * 60 * 60 * 1000);
}
