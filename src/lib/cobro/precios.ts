import type Stripe from "stripe";
import { conIva, netoDe, type Periodicidad } from "./iva";
import { lookupKey, modoStripe, stripe } from "./stripe";

// Los precios de PeluDesk en Stripe salen de `planes` (lo que se edita en
// /plataforma/planes) y se sincronizan al guardar un plan.
//
// Un precio de Stripe NO se edita: si el importe cambia, se crea otro con
// la misma lookup key (transfer_lookup_key) y el anterior se queda como
// estaba, para que quien ya está suscrito siga pagando lo que aceptó.
// Correrlo dos veces no crea nada nuevo: si el precio de la lookup key ya
// tiene el importe correcto, no se toca.
//
// El producto se deduce del precio que ya existe con esa lookup key, y si no
// hay, de la metadata `peludesk_plan` — con products.list, no search (la
// búsqueda va con retraso y en Menteo creó duplicados).

export type PlanParaStripe = {
  id: string;
  clave: string;
  nombre: string;
  tipo: string;
  precio_mensual: number;
  activo: boolean;
};

export type PrecioSincronizado = {
  plan_id: string;
  periodicidad: Periodicidad;
  neto: number;
  total_centavos: number;
  lookup_key: string;
  stripe_price_id: string;
  stripe_product_id: string;
  modo: "test" | "live";
  nuevo: boolean;
};

const INTERVALO: Record<Periodicidad, Stripe.PriceCreateParams.Recurring.Interval> = { mensual: "month", anual: "year" };

async function productoDePlan(plan: PlanParaStripe, desdePrecio: string | null): Promise<Stripe.Product> {
  const s = stripe();
  let producto: Stripe.Product | null = null;
  if (desdePrecio) producto = await s.products.retrieve(desdePrecio);
  if (!producto) {
    for await (const p of s.products.list({ limit: 100 })) {
      if (p.metadata?.peludesk_plan === plan.clave) {
        producto = p;
        break;
      }
    }
  }
  const nombre = `PeluDesk · ${plan.nombre}`;
  if (!producto) {
    return s.products.create(
      { name: nombre, metadata: { peludesk_plan: plan.clave, peludesk_tipo: plan.tipo } },
      { idempotencyKey: `peludesk-producto:${plan.clave}` }
    );
  }
  // El nombre del producto sí se actualiza (sale en el Checkout y en la factura); el precio no.
  if (producto.name !== nombre || !producto.active) {
    producto = await s.products.update(producto.id, { name: nombre, active: true });
  }
  return producto;
}

/** Deja en Stripe los precios mensual y anual de un plan. */
export async function sincronizarPreciosPlan(plan: PlanParaStripe): Promise<PrecioSincronizado[]> {
  const s = stripe();
  const modo = modoStripe();
  const resultado: PrecioSincronizado[] = [];
  let producto: Stripe.Product | null = null;

  for (const periodicidad of ["mensual", "anual"] as const) {
    const neto = netoDe(plan.precio_mensual, periodicidad);
    const { total } = conIva(neto);
    const key = lookupKey(plan.clave, periodicidad);
    const { data } = await s.prices.list({ lookup_keys: [key], limit: 1 });
    const actual = data[0] ?? null;
    const productoActual = actual ? (typeof actual.product === "string" ? actual.product : actual.product.id) : null;
    producto ??= await productoDePlan(plan, productoActual);

    const correcto =
      actual &&
      actual.active &&
      actual.unit_amount === total &&
      actual.currency === "mxn" &&
      actual.tax_behavior === "inclusive" &&
      actual.recurring?.interval === INTERVALO[periodicidad] &&
      productoActual === producto.id;
    if (correcto) {
      resultado.push({ plan_id: plan.id, periodicidad, neto, total_centavos: total, lookup_key: key, stripe_price_id: actual.id, stripe_product_id: producto.id, modo, nuevo: false });
      continue;
    }
    // Un plan sin precio o inactivo no estrena precio en Stripe.
    if (total <= 0 || !plan.activo) continue;

    const nuevo = await s.prices.create(
      {
        product: producto.id,
        currency: "mxn",
        unit_amount: total,
        tax_behavior: "inclusive",
        recurring: { interval: INTERVALO[periodicidad] },
        lookup_key: key,
        transfer_lookup_key: true,
        nickname: `${plan.nombre} ${periodicidad} (IVA incluido)`,
        metadata: {
          peludesk_plan: plan.clave,
          peludesk_tipo: plan.tipo,
          periodicidad,
          neto_centavos: String(conIva(neto).neto),
          iva_centavos: String(conIva(neto).iva),
        },
      },
      // Una transición (este precio reemplaza a aquel) se crea una sola vez.
      { idempotencyKey: `peludesk-precio:${key}:${total}:${actual?.id ?? "primero"}` }
    );
    resultado.push({ plan_id: plan.id, periodicidad, neto, total_centavos: total, lookup_key: key, stripe_price_id: nuevo.id, stripe_product_id: producto.id, modo, nuevo: true });
  }
  return resultado;
}

/**
 * El precio vigente de un plan para cobrar: por lookup key, y SOLO si su
 * importe es el que dice la base. Si no cuadra (se cambió el precio y la
 * sincronización no terminó), no se cobra: se enseñaría un importe y se
 * cobraría otro.
 */
export async function precioParaCobrar(clave: string, precioMensual: number, periodicidad: Periodicidad): Promise<Stripe.Price> {
  const { total } = conIva(netoDe(precioMensual, periodicidad));
  const key = lookupKey(clave, periodicidad);
  const { data } = await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const p = data[0];
  if (!p || p.unit_amount !== total || p.tax_behavior !== "inclusive") {
    console.error(`[cobro] el precio ${key} de Stripe no cuadra con la base`, { stripe: p?.unit_amount ?? null, base: total });
    throw new Error("Los precios se están actualizando. Intenta de nuevo en unos minutos; si sigue, escríbenos.");
  }
  return p;
}
