import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripe, stripeConfigurado } from "@/lib/cobro/stripe";
import { METADATA_NEGOCIO } from "@/lib/cobro/suscripcion";
import { centavosConIva } from "./precio";

/**
 * El excedente de recordatorios por WhatsApp en la factura mensual de Stripe: uso medido sobre la suscripción que el
 * negocio ya tiene (la de la principal, si es sucursal).
 *
 * - Un medidor (Billing Meter) `peludesk_recordatorios_whatsapp` que suma por cliente de Stripe.
 * - Un precio mensual medido, MXN, IVA incluido, producto «Recordatorios de WhatsApp adicionales», con el precio por
 *   mensaje vigente de `wa_precios` (lookup key con guiones para que el código de planes no lo confunda con un plan).
 *   Si el precio de la base cambia, se crea otro con la misma lookup key y el concepto de la suscripción se mueve a él.
 * - Cada mensaje excedente (wa_recordatorios_cobro.excedente) es un evento del medidor con identificador = su id:
 *   Stripe no cuenta dos veces el mismo identificador, así que reintentar es seguro.
 * - La suscripción se pasa a «billing mode flexible» al agregar el concepto: así una anual (o una mensual que después
 *   pase a anual) puede llevar el concepto mensual (Stripe lo exige para mezclar periodicidades).
 */
export const EVENTO_MEDIDOR = "peludesk_recordatorios_whatsapp";
export const LOOKUP_RECORDATORIOS = "peludesk-recordatorios-whatsapp-mensual";
const TIPO = "recordatorios";

export function esItemRecordatorios(i: Stripe.SubscriptionItem): boolean {
  return i.price.metadata?.peludesk_tipo === TIPO || i.price.lookup_key === LOOKUP_RECORDATORIOS;
}

let medidorEnMemoria: string | null = null;

async function medidor(): Promise<string> {
  if (medidorEnMemoria) return medidorEnMemoria;
  const s = stripe();
  for await (const m of s.billing.meters.list({ limit: 100 })) {
    if (m.event_name === EVENTO_MEDIDOR && m.status === "active") {
      medidorEnMemoria = m.id;
      return m.id;
    }
  }
  const m = await s.billing.meters.create(
    {
      display_name: "PeluDesk · Recordatorios de WhatsApp adicionales",
      event_name: EVENTO_MEDIDOR,
      default_aggregation: { formula: "sum" },
      customer_mapping: { type: "by_id", event_payload_key: "stripe_customer_id" },
      value_settings: { event_payload_key: "value" },
    },
    { idempotencyKey: `peludesk-medidor:${EVENTO_MEDIDOR}` }
  );
  medidorEnMemoria = m.id;
  return m.id;
}

/** El precio medido vigente (lo crea si la base tiene otro importe). */
export async function precioRecordatorios(precioMxn: number): Promise<Stripe.Price> {
  const s = stripe();
  const centavos = centavosConIva(precioMxn);
  const decimal = centavos.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const actuales = await s.prices.list({ lookup_keys: [LOOKUP_RECORDATORIOS], active: true, limit: 1 });
  const actual = actuales.data[0];
  if (actual && Number(String(actual.unit_amount_decimal ?? actual.unit_amount ?? -1)) === Number(decimal)) return actual;
  const idMedidor = await medidor();
  let producto = typeof actual?.product === "string" ? actual.product : actual?.product?.id;
  if (!producto) {
    for await (const p of s.products.list({ limit: 100 })) {
      if (p.metadata?.peludesk_tipo === TIPO) {
        producto = p.id;
        break;
      }
    }
  }
  if (!producto) {
    producto = (
      await s.products.create(
        { name: "Recordatorios de WhatsApp adicionales", metadata: { peludesk_tipo: TIPO } },
        { idempotencyKey: `peludesk-producto:${TIPO}` }
      )
    ).id;
  }
  return s.prices.create(
    {
      product: producto,
      currency: "mxn",
      unit_amount_decimal: Stripe.Decimal.from(decimal),
      tax_behavior: "inclusive",
      recurring: { interval: "month", usage_type: "metered", meter: idMedidor },
      lookup_key: LOOKUP_RECORDATORIOS,
      transfer_lookup_key: true,
      nickname: `Recordatorio de WhatsApp adicional · $${precioMxn.toFixed(2)} + IVA`,
      metadata: { peludesk_tipo: TIPO, peludesk_precio_sin_iva: precioMxn.toFixed(2) },
    },
    { idempotencyKey: `peludesk-precio:${TIPO}:${decimal}` }
  );
}

/** Deja el concepto medido en la suscripción (con el precio vigente) y devuelve el cliente de Stripe. */
export async function asegurarConcepto(subId: string, negocioId: string, precioMxn: number): Promise<string> {
  const s = stripe();
  let sub = await s.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
  if (sub.metadata?.[METADATA_NEGOCIO] !== negocioId) throw new Error("Esa suscripción no es de este negocio.");
  const precio = await precioRecordatorios(precioMxn);
  const item = sub.items.data.find(esItemRecordatorios);
  if (item?.price.id === precio.id) return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  // Siempre en modo flexible: hoy puede ser mensual, pero si mañana pasa a anual el concepto mensual tiene que caber.
  if (sub.billing_mode?.type !== "flexible") {
    sub = await s.subscriptions.migrate(sub.id, { billing_mode: { type: "flexible" } });
  }
  await s.subscriptions.update(sub.id, {
    items: [item ? { id: item.id, price: precio.id } : { price: precio.id }],
    proration_behavior: "none",
  });
  return typeof sub.customer === "string" ? sub.customer : sub.customer.id;
}

/**
 * Reporta a Stripe los mensajes excedentes que falten (la tarea de recordatorios y el webhook después de cada
 * entrega). Sin Stripe configurado no hace nada (quedan pendientes).
 */
export async function reportarExcedentesPendientes(): Promise<{ reportados: number; fallidos: number }> {
  if (!stripeConfigurado()) return { reportados: 0, fallidos: 0 };
  const global = createSupabaseAdminClient();
  const { data, error } = await global.rpc("recordatorios_cobro_por_reportar", { p_limite: 200 });
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as { id: string; negocio_id: string; paga_id: string; created_at: string }[];
  let reportados = 0;
  let fallidos = 0;
  const clientes = new Map<string, string>();
  for (const f of filas) {
    try {
      let cliente = clientes.get(f.paga_id);
      if (!cliente) {
        const admin = createSupabaseAdminClient(f.paga_id);
        const { data: sus } = await admin.from("suscripciones").select("stripe_subscription_id").eq("negocio_id", f.paga_id).is("deleted_at", null).maybeSingle();
        const subId = sus?.stripe_subscription_id as string | undefined;
        if (!subId) throw new Error("El negocio no tiene suscripción en Stripe.");
        const { data: cobro } = await global.from("wa_recordatorios_cobro").select("precio_mxn").eq("id", f.id).maybeSingle();
        cliente = await asegurarConcepto(subId, f.paga_id, Number(cobro?.precio_mxn ?? 0));
        clientes.set(f.paga_id, cliente);
      }
      await stripe().billing.meterEvents.create({
        event_name: EVENTO_MEDIDOR,
        identifier: f.id,
        timestamp: Math.floor(Date.parse(f.created_at) / 1000),
        payload: { stripe_customer_id: cliente, value: "1" },
      });
      await global.rpc("recordatorio_cobro_reportado", { p_id: f.id, p_ok: true, p_error: null });
      reportados++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Un identificador repetido es que Stripe ya lo tenía: cuenta como reportado.
      const repetido = /identifier.*(already|duplicate)|duplicate.*identifier/i.test(msg);
      await global.rpc("recordatorio_cobro_reportado", { p_id: f.id, p_ok: repetido, p_error: repetido ? null : msg });
      if (repetido) reportados++;
      else {
        fallidos++;
        console.error("[recordatorios] stripe", msg);
      }
    }
  }
  return { reportados, fallidos };
}
