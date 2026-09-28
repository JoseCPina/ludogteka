import Stripe from "stripe";
import type { Periodicidad } from "./iva";

// El ÚNICO archivo que crea el cliente de Stripe. La cuenta es la de
// Menteo, S.A.S. (la comparte con Menteo y Checaíto): todo lo de PeluDesk
// lleva lookup keys `peludesk_*` y metadata `peludesk_*`, y nada de aquí
// toca productos, precios ni ajustes de cuenta de los otros dos.
//
// Variables (solo servidor, nunca NEXT_PUBLIC_):
//   STRIPE_SECRET_KEY      sk_test_… en desarrollo, sk_live_… en producción
//   STRIPE_WEBHOOK_SECRET  whsec_… del endpoint https://peludesk.mx/api/stripe/webhook

// Fijada a mano: una actualización del SDK no cambia la forma de las
// respuestas en un despliegue que nadie relacionó con cobros.
export const STRIPE_API_VERSION = "2026-08-26.dahlia";

/** Los eventos que se dan de alta en el endpoint del webhook. */
export const EVENTOS_STRIPE = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export class CobroNoConfigurado extends Error {
  constructor() {
    super("El cobro en línea todavía no está configurado. Escríbenos y lo activamos.");
  }
}

let cliente: Stripe | null = null;

export function stripeConfigurado(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  if (cliente) return cliente;
  const llave = process.env.STRIPE_SECRET_KEY;
  if (!llave) throw new CobroNoConfigurado();
  cliente = new Stripe(llave, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 20_000 });
  return cliente;
}

/** test o live, por la llave. Se guarda en cada fila para no mezclar. */
export function modoStripe(): "test" | "live" {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_") ? "live" : "test";
}

/** La clave estable de cada precio: `peludesk_<plan>_<mensual|anual>`. */
export function lookupKey(clavePlan: string, periodicidad: Periodicidad): string {
  return `peludesk_${clavePlan}_${periodicidad}`;
}

/** De un lookup key de PeluDesk, el plan y la periodicidad. */
export function deLookupKey(key: string | null | undefined): { clave: string; periodicidad: Periodicidad } | null {
  const m = /^peludesk_([a-z0-9_]+)_(mensual|anual)$/.exec(key ?? "");
  return m ? { clave: m[1], periodicidad: m[2] as Periodicidad } : null;
}

/** Segundos de Stripe → ISO. */
export function iso(segundos: number | null | undefined): string | null {
  return segundos ? new Date(segundos * 1000).toISOString() : null;
}

/** Un error de Stripe en español para la pantalla (el original va a console.error). */
export function mensajeDeErrorStripe(e: unknown): string {
  if (e instanceof CobroNoConfigurado) return e.message;
  console.error("[stripe]", e);
  if (e instanceof Stripe.errors.StripeCardError) return "El banco rechazó la tarjeta. Prueba con otra o cámbiala en el portal de pagos.";
  if (e instanceof Stripe.errors.StripeConnectionError) return "No pudimos conectar con el procesador de pagos. Intenta de nuevo en un momento.";
  return "No pudimos completar la operación con el procesador de pagos. Intenta de nuevo; si sigue, escríbenos.";
}
