import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripe } from "./stripe";
import { precioParaCobrar, sincronizarPreciosPlan } from "./precios";
import { METADATA_NEGOCIO, aplicarSuscripcion } from "./suscripcion";
import type { Periodicidad } from "./iva";

// Las sucursales adicionales en la suscripción de Stripe de la PRIMERA sucursal (la principal).
//
// Cada sucursal es un negocio (negocios.principal_id = la principal) y la suscripción de la principal lleva un
// concepto «Sucursal adicional» con cantidad = sucursales activas. Su precio sale de `planes` (tipo 'sucursal',
// lo edita la plataforma) con lookup key `peludesk_sucursal_adicional_<mensual|anual>`, en la misma periodicidad
// que el plan. Abrir una sucursal a mitad del periodo cobra hoy la parte proporcional (si el banco rechaza, no
// se abre); quitarla deja el crédito para el siguiente cobro.

export const CLAVE_SUCURSAL = "sucursal_adicional";

type PlanSucursal = { id: string; clave: string; nombre: string; tipo: string; precio_mensual: number };

export async function planSucursal(): Promise<PlanSucursal | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("planes")
    .select("id, clave, nombre, tipo, precio_mensual")
    .eq("tipo", "sucursal")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("orden")
    .limit(1)
    .maybeSingle();
  return data ? { ...(data as PlanSucursal), precio_mensual: Number(data.precio_mensual) } : null;
}

/** El precio de Stripe de la sucursal adicional; si la base cambió y Stripe no lo tiene, se sincroniza aquí. */
export async function precioSucursal(periodicidad: Periodicidad): Promise<Stripe.Price> {
  const plan = await planSucursal();
  if (!plan || plan.precio_mensual <= 0) throw new Error("La sucursal adicional no está disponible. Escríbenos por WhatsApp.");
  try {
    return await precioParaCobrar(plan.clave, plan.precio_mensual, periodicidad);
  } catch {
    await sincronizarPreciosPlan({ ...plan, activo: true });
    return precioParaCobrar(plan.clave, plan.precio_mensual, periodicidad);
  }
}

/** ¿Este concepto de la suscripción es la sucursal adicional? */
export function esItemSucursal(i: Stripe.SubscriptionItem): boolean {
  return i.price.metadata?.peludesk_tipo === "sucursal" || (i.price.lookup_key ?? "").startsWith(`peludesk_${CLAVE_SUCURSAL}_`);
}

/** Cuántas sucursales adicionales activas tiene una principal (según la base). */
export async function sucursalesActivas(principalId: string): Promise<number> {
  const admin = createSupabaseAdminClient(principalId);
  const { data, error } = await admin.rpc("sucursales_activas", { p_principal: principalId });
  if (error) throw new Error(`sucursales_activas: ${error.message}`);
  return Number(data ?? 0);
}

/**
 * Deja la suscripción de la principal cobrando `cantidad` sucursales adicionales. Subir cobra hoy la parte
 * proporcional y SOLO si el banco la aprueba (error_if_incomplete: si no, nada cambia); bajar deja crédito.
 */
export async function ajustarSucursales(principalId: string, cantidad: number): Promise<void> {
  const admin = createSupabaseAdminClient(principalId);
  const { data: fila } = await admin
    .from("suscripciones")
    .select("stripe_subscription_id")
    .eq("negocio_id", principalId)
    .is("deleted_at", null)
    .maybeSingle();
  const subId = fila?.stripe_subscription_id as string | undefined;
  if (!subId) throw new Error("Tu primera sucursal no tiene una suscripción activa.");
  const s = stripe();
  const sub = await s.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
  if (sub.metadata?.[METADATA_NEGOCIO] !== principalId) throw new Error("Esa suscripción no es de este negocio.");
  if (sub.schedule) throw new Error("Tienes un cambio de plan programado. Espera a que se aplique, o quédate con tu plan actual, para cambiar tus sucursales.");
  const itemPlan = sub.items.data.find((i) => !esItemSucursal(i) && i.price.metadata?.peludesk_tipo !== "complemento");
  if (!itemPlan) throw new Error("No encontramos el plan en tu suscripción. Escríbenos por WhatsApp.");
  const periodicidad: Periodicidad = itemPlan.price.recurring?.interval === "year" ? "anual" : "mensual";
  const item = sub.items.data.find(esItemSucursal);
  const actual = item?.quantity ?? 0;
  if (cantidad === actual) return;

  const items: Stripe.SubscriptionUpdateParams.Item[] =
    cantidad <= 0
      ? item
        ? [{ id: item.id, deleted: true }]
        : []
      : item
        ? [{ id: item.id, quantity: cantidad }]
        : [{ price: (await precioSucursal(periodicidad)).id, quantity: cantidad }];
  const aumenta = cantidad > actual;
  await s.subscriptions.update(sub.id, {
    items,
    ...(sub.status === "trialing"
      ? { proration_behavior: "none" as const }
      : aumenta
        ? { proration_behavior: "always_invoice" as const, payment_behavior: "error_if_incomplete" as const }
        : { proration_behavior: "create_prorations" as const }),
  });
  await aplicarSuscripcion(principalId, sub.id);
}
