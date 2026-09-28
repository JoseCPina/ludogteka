import type Stripe from "stripe";
import { stripe } from "./stripe";

// La configuración del portal de cliente de Stripe PROPIA de PeluDesk. La
// configuración por omisión de la cuenta es de Menteo; esta se reconoce por
// su metadata y se crea una vez. Deja cambiar la tarjeta, ver y descargar
// facturas y cancelar (al terminar el periodo pagado). Cambiar de plan NO:
// se hace en «Módulos y plan», donde se aplican las reglas de módulos.
let cache: string | null = null;

export async function configuracionPortal(): Promise<string> {
  if (cache) return cache;
  const s = stripe();
  for await (const c of s.billingPortal.configurations.list({ limit: 100, active: true })) {
    if (c.metadata?.peludesk === "suscripcion") {
      cache = c.id;
      return c.id;
    }
  }
  const params: Stripe.BillingPortal.ConfigurationCreateParams = {
    name: "PeluDesk",
    business_profile: { headline: "PeluDesk: tu suscripción" },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "name", "address", "tax_id"] },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
        cancellation_reason: {
          enabled: true,
          options: ["too_expensive", "missing_features", "switched_service", "unused", "other"],
        },
      },
      subscription_update: { enabled: false },
    },
    metadata: { peludesk: "suscripcion" },
  };
  const c = await s.billingPortal.configurations.create(params, { idempotencyKey: "peludesk-portal-v1" });
  cache = c.id;
  return c.id;
}
