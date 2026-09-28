import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deLookupKey, iso, modoStripe, stripe } from "./stripe";
import type { Periodicidad } from "./iva";

// Lo que se guarda del cobro, en un solo sitio. Tres caminos llegan aquí
// (el regreso del Checkout, el webhook y las acciones del admin) y los tres
// hacen lo mismo: PREGUNTARLE a Stripe por el estado ACTUAL de la
// suscripción y aplicarlo con cobro_aplicar() (solo service_role). Nunca se
// deduce del tipo de evento: Stripe no garantiza el orden y un
// payment_failed viejo que llega después de un paid dejaría al negocio en
// gracia estando al corriente.

export const METADATA_NEGOCIO = "peludesk_negocio_id";
const VIVAS = new Set(["trialing", "active", "past_due", "unpaid"]);

type Admin = ReturnType<typeof createSupabaseAdminClient>;

type ItemDePlan = { clave: string; periodicidad: Periodicidad; tipo: string };

function itemDePrecio(p: Stripe.Price): ItemDePlan | null {
  const porKey = deLookupKey(p.lookup_key);
  const clave = p.metadata?.peludesk_plan ?? porKey?.clave;
  if (!clave) return null;
  const periodicidad = (p.metadata?.periodicidad as Periodicidad | undefined) ?? porKey?.periodicidad ?? (p.recurring?.interval === "year" ? "anual" : "mensual");
  return { clave, periodicidad, tipo: p.metadata?.peludesk_tipo ?? "plan" };
}

/** Los módulos que da cada complemento contratado (su plan de tipo complemento). */
async function modulosDeComplementos(admin: Admin, claves: string[]): Promise<string[]> {
  if (!claves.length) return [];
  const { data } = await admin.from("planes").select("clave, modulos").in("clave", claves).eq("tipo", "complemento").is("deleted_at", null);
  return [...new Set((data ?? []).flatMap((p) => (p.modulos as string[]) ?? []))];
}

export function negocioDeSuscripcion(sub: Stripe.Subscription): string | null {
  return sub.metadata?.[METADATA_NEGOCIO] ?? null;
}

async function cambioProgramado(sub: Stripe.Subscription): Promise<Record<string, unknown> | null> {
  const id = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  if (!id) return null;
  const sch = await stripe().subscriptionSchedules.retrieve(id, { expand: ["phases.items.price"] });
  // La fase que sigue a la actual (por las fechas del schedule, no por el
  // reloj de este servidor: en pruebas Stripe corre con un reloj adelantado).
  const finActual = sch.current_phase?.end_date ?? null;
  const siguiente = finActual ? sch.phases.find((f) => f.start_date >= finActual) : undefined;
  if (!siguiente) return null;
  let plan: string | null = null;
  let periodicidad: Periodicidad | null = null;
  const complementos: string[] = [];
  for (const it of siguiente.items) {
    const precio = typeof it.price === "string" ? await stripe().prices.retrieve(it.price) : (it.price as Stripe.Price);
    const d = itemDePrecio(precio);
    if (!d) continue;
    if (d.tipo === "complemento") complementos.push(d.clave);
    else {
      plan = d.clave;
      periodicidad = d.periodicidad;
    }
  }
  return { plan, periodicidad, complementos, desde: iso(siguiente.start_date), schedule: sch.id };
}

/** De la suscripción de Stripe a lo que recibe cobro_aplicar(). */
export async function cargaDeSuscripcion(admin: Admin, sub: Stripe.Subscription): Promise<Record<string, unknown>> {
  let plan: ItemDePlan | null = null;
  const complementos: string[] = [];
  let monto = 0;
  let inicio: number | null = null;
  let fin: number | null = null;
  for (const it of sub.items.data) {
    const d = itemDePrecio(it.price);
    monto += (it.price.unit_amount ?? 0) * (it.quantity ?? 1);
    inicio ??= it.current_period_start;
    fin ??= it.current_period_end;
    if (!d) continue;
    if (d.tipo === "complemento") complementos.push(d.clave);
    else plan = d;
  }
  let facturaPendiente: string | null = null;
  let falloAt: string | null = null;
  if (sub.status === "past_due" || sub.status === "unpaid") {
    const factura =
      typeof sub.latest_invoice === "string" ? await stripe().invoices.retrieve(sub.latest_invoice) : (sub.latest_invoice ?? null);
    if (factura && factura.status === "open") {
      facturaPendiente = factura.hosted_invoice_url ?? null;
      falloAt = iso(factura.status_transitions?.finalized_at ?? factura.created);
    }
  }
  return {
    modo: modoStripe(),
    customer: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    subscription: sub.id,
    estado_stripe: sub.status,
    plan_clave: plan?.clave ?? null,
    periodicidad: plan?.periodicidad ?? null,
    complementos: await modulosDeComplementos(admin, complementos),
    monto_centavos: monto,
    periodo_inicio: iso(inicio),
    periodo_fin: iso(fin),
    prueba_hasta: iso(sub.trial_end),
    cancela_al_terminar: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    cancelada_at: iso(sub.ended_at ?? sub.canceled_at),
    fallo_at: falloAt,
    factura_pendiente_url: facturaPendiente,
    cambio_programado: await cambioProgramado(sub),
  };
}

/** Lee la suscripción en Stripe y la aplica al negocio. Devuelve el estado de cobro. */
export async function aplicarSuscripcion(negocioId: string, subId: string): Promise<string> {
  const admin = createSupabaseAdminClient(negocioId);
  let sub = await stripe().subscriptions.retrieve(subId, { expand: ["latest_invoice"] });
  const dueño = negocioDeSuscripcion(sub);
  // La metadata la pone nuestro servidor al crear el Checkout: si no es de
  // este negocio, no se aplica (nadie aplica la suscripción de otro).
  if (dueño !== negocioId) throw new Error(`La suscripción ${sub.id} no es del negocio ${negocioId}.`);
  // Un cambio a un plan menor ya aplicado: el schedule ya no tiene nada por
  // delante y se suelta. Mientras siguiera pegado, Stripe no dejaría cancelar
  // (ni desde el portal) ni cambiar de plan.
  const idSchedule = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  if (idSchedule && VIVAS.has(sub.status)) {
    const sch = await stripe().subscriptionSchedules.retrieve(idSchedule);
    const finActual = sch.current_phase?.end_date ?? null;
    const quedaAlgo = finActual ? sch.phases.some((f) => f.start_date >= finActual) : true;
    if (sch.status === "active" && !quedaAlgo) {
      await stripe().subscriptionSchedules.release(idSchedule);
      sub = await stripe().subscriptions.retrieve(subId, { expand: ["latest_invoice"] });
    }
  }
  const carga = await cargaDeSuscripcion(admin, sub);
  const { data, error } = await admin.rpc("cobro_aplicar", { p_negocio_id: negocioId, p: carga });
  if (error) throw new Error(`cobro_aplicar: ${error.message}`);
  return String(data);
}

/** Guarda el cliente de Stripe del negocio (antes de tener suscripción). */
export async function guardarCliente(negocioId: string, customerId: string): Promise<void> {
  const admin = createSupabaseAdminClient(negocioId);
  const { error } = await admin.rpc("cobro_aplicar", { p_negocio_id: negocioId, p: { modo: modoStripe(), customer: customerId } });
  if (error) throw new Error(`cobro_aplicar: ${error.message}`);
}

/** El id de la suscripción de una factura (desde 2026-08-26 vive en `parent`). */
export function suscripcionDeFactura(f: Stripe.Invoice): { id: string | null; negocio: string | null } {
  const det = f.parent?.subscription_details;
  const id = typeof det?.subscription === "string" ? det.subscription : (det?.subscription?.id ?? null);
  return { id, negocio: det?.metadata?.[METADATA_NEGOCIO] ?? null };
}

/** Una factura al historial de pagos del negocio. Las de $0 (inicio de la prueba) no. */
export async function registrarFactura(negocioId: string, f: Stripe.Invoice, fallo: boolean): Promise<void> {
  const monto = f.status === "paid" ? f.amount_paid : f.amount_due;
  if (!monto) return;
  const estado =
    f.status === "paid" ? "pagado" : f.status === "void" || f.status === "uncollectible" ? "anulado" : fallo || (f.attempt_count ?? 0) > 0 ? "fallido" : "pendiente";
  const linea = f.lines?.data?.[0];
  const admin = createSupabaseAdminClient(negocioId);
  const { error } = await admin.rpc("cobro_registrar_pago", {
    p_negocio_id: negocioId,
    p: {
      modo: modoStripe(),
      invoice: f.id,
      numero: f.number ?? null,
      estado,
      monto_centavos: monto,
      periodo_inicio: iso(linea?.period?.start ?? f.period_start),
      periodo_fin: iso(linea?.period?.end ?? f.period_end),
      pagado_at: iso(f.status_transitions?.paid_at),
      fallo_at: estado === "fallido" ? new Date().toISOString() : null,
      motivo_fallo: estado === "fallido" ? "El banco rechazó el cobro." : null,
      url_factura: f.hosted_invoice_url ?? null,
    },
  });
  if (error) throw new Error(`cobro_registrar_pago: ${error.message}`);
}
