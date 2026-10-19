import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { iso, modoStripe, stripe } from "./stripe";

// La factura (CFDI) de la suscripción a PeluDesk, que emite Menteo, S.A.S.
//
// Los datos fiscales del negocio se capturan en «Módulos y plan» y viven en SU cliente de Stripe (metadata
// `peludesk_fact_*`, más el RFC como tax id y el código postal en la dirección): la base no los guarda.
// Mientras la emisión automática no esté conectada, cada pago de un negocio con esos datos deja una tarea en
// /plataforma/facturas («Facturas por emitir») con los datos y el monto; la factura le llega por correo en los
// días siguientes al pago.

export type DatosFacturacion = {
  rfc: string;
  razon_social: string;
  regimen_fiscal: string;
  codigo_postal: string;
  uso_cfdi: string;
  correo: string;
};

const META: Record<keyof DatosFacturacion, string> = {
  rfc: "peludesk_fact_rfc",
  razon_social: "peludesk_fact_razon_social",
  regimen_fiscal: "peludesk_fact_regimen",
  codigo_postal: "peludesk_fact_cp",
  uso_cfdi: "peludesk_fact_uso_cfdi",
  correo: "peludesk_fact_correo",
};

/** Lo que se le dice a quien paga, en la app y en el bot. */
export const AVISO_FACTURA = "La factura (CFDI) la emite Menteo, S.A.S., la empresa que opera PeluDesk, y te llega por correo en los días siguientes a cada pago.";

/** Limpia y revisa lo capturado. Devuelve el error para la pantalla, o los datos listos. */
export function validarDatosFacturacion(d: Partial<DatosFacturacion>): { error: string } | { datos: DatosFacturacion } {
  const datos: DatosFacturacion = {
    rfc: (d.rfc ?? "").trim().toUpperCase().replace(/[\s-]/g, ""),
    razon_social: (d.razon_social ?? "").trim().replace(/\s+/g, " "),
    regimen_fiscal: (d.regimen_fiscal ?? "").trim(),
    codigo_postal: (d.codigo_postal ?? "").trim(),
    uso_cfdi: (d.uso_cfdi ?? "").trim().toUpperCase(),
    correo: (d.correo ?? "").trim().toLowerCase(),
  };
  if (datos.rfc === "XAXX010101000" || datos.rfc === "XEXX010101000") return { error: "Escribe el RFC de tu negocio, no el genérico: con el genérico no hace falta capturar datos." };
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(datos.rfc)) return { error: "El RFC tiene 12 caracteres (empresa) o 13 (persona física), como viene en tu constancia de situación fiscal." };
  if (datos.razon_social.length < 2 || datos.razon_social.length > 250) return { error: "Escribe la razón social o el nombre tal cual viene en tu constancia, sin «S.A. de C.V.»." };
  if (!/^\d{3}$/.test(datos.regimen_fiscal)) return { error: "Escoge tu régimen fiscal." };
  if (!/^\d{5}$/.test(datos.codigo_postal)) return { error: "El código postal fiscal tiene 5 dígitos." };
  if (!/^[A-Z]\d{2}$/.test(datos.uso_cfdi)) return { error: "Escoge el uso del CFDI." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(datos.correo)) return { error: "Escribe el correo donde quieres recibir la factura." };
  return { datos };
}

/** Los datos de facturación guardados en un cliente de Stripe (o null si no los capturó). */
export function datosDeCliente(c: Stripe.Customer | Stripe.DeletedCustomer | null | undefined): DatosFacturacion | null {
  if (!c || c.deleted) return null;
  const m = c.metadata ?? {};
  const d = Object.fromEntries(Object.entries(META).map(([k, v]) => [k, m[v] ?? ""])) as DatosFacturacion;
  return d.rfc && d.razon_social && d.correo ? d : null;
}

/** Guarda los datos en el cliente de Stripe: metadata, RFC como tax id (mx_rfc) y el código postal. */
export async function guardarEnCliente(customerId: string, d: DatosFacturacion): Promise<void> {
  const s = stripe();
  await s.customers.update(customerId, {
    metadata: Object.fromEntries(Object.entries(META).map(([k, v]) => [v, d[k as keyof DatosFacturacion]])),
    address: { country: "MX", postal_code: d.codigo_postal },
  });
  const ids = await s.customers.listTaxIds(customerId, { limit: 20 });
  const rfcs = ids.data.filter((t) => t.type === "mx_rfc");
  if (!rfcs.some((t) => t.value === d.rfc)) {
    await s.customers.createTaxId(customerId, { type: "mx_rfc", value: d.rfc });
  }
  for (const t of rfcs) if (t.value !== d.rfc) await s.customers.deleteTaxId(customerId, t.id);
}

/** Los datos de facturación de un negocio (lee su cliente de Stripe). Nunca rompe la pantalla. */
export async function datosFacturacionDeNegocio(negocioId: string): Promise<DatosFacturacion | null> {
  try {
    const admin = createSupabaseAdminClient(negocioId);
    const { data } = await admin
      .from("suscripciones")
      .select("modo, stripe_customer_id")
      .eq("negocio_id", negocioId)
      .is("deleted_at", null)
      .maybeSingle();
    const id = data?.modo === modoStripe() ? (data?.stripe_customer_id as string | null) : null;
    if (!id) return null;
    return datosDeCliente(await stripe().customers.retrieve(id));
  } catch (e) {
    console.error("[facturacion] no se pudieron leer los datos de facturación", e);
    return null;
  }
}

/**
 * Un pago de la suscripción (factura de Stripe pagada) de un negocio con datos de facturación: queda en
 * «Facturas por emitir» de la plataforma, con la foto de los datos y el monto. Idempotente por factura.
 */
export async function registrarFacturaPorEmitir(negocioId: string, f: Stripe.Invoice): Promise<void> {
  if (f.status !== "paid" || !f.amount_paid) return;
  const customerId = typeof f.customer === "string" ? f.customer : f.customer?.id;
  if (!customerId) return;
  const datos = datosDeCliente(await stripe().customers.retrieve(customerId));
  if (!datos) return;
  const admin = createSupabaseAdminClient(negocioId);
  const { data: n } = await admin.from("negocios").select("nombre").eq("id", negocioId).maybeSingle();
  const concepto = (f.lines?.data ?? [])
    .filter((l) => l.amount !== 0)
    .map((l) => l.description ?? "")
    .filter(Boolean)
    .join(" · ")
    .slice(0, 1000);
  const { error } = await admin.from("facturas_peludesk_por_emitir").insert({
    negocio_afectado: negocioId,
    negocio_nombre: (n?.nombre as string | undefined) ?? "—",
    modo: modoStripe(),
    stripe_invoice_id: f.id,
    stripe_customer_id: customerId,
    numero_stripe: f.number ?? null,
    monto_centavos: f.amount_paid,
    concepto: concepto || null,
    pagado_at: iso(f.status_transitions?.paid_at),
    ...datos,
  });
  // 23505: esa factura ya estaba (el webhook y el regreso del Checkout llegan los dos).
  if (error && error.code !== "23505") throw new Error(`facturas por emitir: ${error.message}`);
}
