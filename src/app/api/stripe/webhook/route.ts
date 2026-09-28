import type Stripe from "stripe";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { modoStripe, stripe } from "@/lib/cobro/stripe";
import {
  METADATA_NEGOCIO,
  aplicarSuscripcion,
  registrarFactura,
  suscripcionDeFactura,
} from "@/lib/cobro/suscripcion";

// Webhook de Stripe de la suscripción de PeluDesk. Vive en el dominio de
// la plataforma: https://peludesk.mx/api/stripe/webhook (el middleware no lo
// sirve en el dominio de un negocio).
//
// No negociable:
//  1. Firma ANTES de leer nada (STRIPE_WEBHOOK_SECRET, sobre el cuerpo crudo).
//     Sin eso cualquiera se reactivaría con un curl.
//  2. Idempotente por event.id (eventos_stripe): un reintento no aplica dos
//     veces. Un evento que falló a medias se vuelve a procesar.
//  3. El estado NO sale del evento: se le pregunta a Stripe por la
//     suscripción ACTUAL (aplicarSuscripcion). El orden de llegada no importa.
//  4. La cuenta de Stripe es compartida con Menteo y Checaíto: un evento que
//     no es de PeluDesk se contesta 200 y NO se guarda.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function texto(mensaje: string, status: number) {
  return new NextResponse(mensaje, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

type Destino = { negocio: string | null; suscripcion: string | null; factura: Stripe.Invoice | null };

async function destinoDelEvento(evento: Stripe.Event): Promise<Destino> {
  const o = evento.data.object as unknown as Record<string, unknown>;
  if (evento.type === "checkout.session.completed") {
    const s = o as unknown as Stripe.Checkout.Session;
    return {
      negocio: s.metadata?.[METADATA_NEGOCIO] ?? null,
      suscripcion: typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null),
      factura: null,
    };
  }
  if (evento.type.startsWith("customer.subscription.")) {
    const s = o as unknown as Stripe.Subscription;
    return { negocio: s.metadata?.[METADATA_NEGOCIO] ?? null, suscripcion: s.id, factura: null };
  }
  if (evento.type.startsWith("invoice.")) {
    const f = o as unknown as Stripe.Invoice;
    const { id, negocio } = suscripcionDeFactura(f);
    return { negocio, suscripcion: id, factura: f };
  }
  return { negocio: null, suscripcion: null, factura: null };
}

export async function POST(request: NextRequest) {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  const firma = request.headers.get("stripe-signature");
  const cuerpo = await request.text();
  if (!secreto) {
    console.error("[stripe] webhook recibido sin STRIPE_WEBHOOK_SECRET configurado");
    return texto("Webhook sin configurar.", 500);
  }
  if (!firma) return texto("Falta la firma.", 400);

  let evento: Stripe.Event;
  try {
    evento = await stripe().webhooks.constructEventAsync(cuerpo, firma, secreto);
  } catch (e) {
    console.warn("[stripe] firma inválida:", e instanceof Error ? e.message : e);
    return texto("Firma inválida.", 400);
  }
  // Un evento de modo prueba nunca toca producción, ni al revés.
  if (evento.livemode !== (modoStripe() === "live")) {
    return texto("Evento de otro modo: ignorado.", 200);
  }

  const destino = await destinoDelEvento(evento);
  const admin = createSupabaseAdminClient();

  // ¿Es de PeluDesk? Por la metadata que pone nuestro servidor o porque la
  // suscripción ya está registrada. Lo de Menteo o Checaíto no se guarda.
  let negocio = destino.negocio;
  // (Búsqueda entre negocios a propósito: el evento no trae de quién es.)
  if (!negocio && destino.suscripcion) {
    const { data } = await admin.from("suscripciones").select("negocio_id").eq("stripe_subscription_id", destino.suscripcion).maybeSingle();
    negocio = (data?.negocio_id as string | undefined) ?? null;
  }
  if (!negocio) return texto("No es de PeluDesk: ignorado.", 200);
  const { data: existe } = await admin.from("negocios").select("id, cobro_exento, plan").eq("id", negocio).maybeSingle();
  if (!existe) {
    console.error("[stripe] evento con un negocio que no existe", { evento: evento.id, negocio });
    return texto("Negocio desconocido: ignorado.", 200);
  }

  // Idempotencia: el primero que inserta, procesa.
  const { error: yaEstaba } = await admin.from("eventos_stripe").insert({
    stripe_event_id: evento.id,
    tipo: evento.type,
    modo: modoStripe(),
    objeto_id: (evento.data.object as { id?: string }).id ?? null,
    negocio_afectado: negocio,
    payload: evento as unknown as Record<string, unknown>,
  });
  if (yaEstaba) {
    if (yaEstaba.code !== "23505") {
      console.error("[stripe] no se pudo guardar el evento", yaEstaba);
      return texto("No se pudo guardar el evento.", 500);
    }
    const { data: previo } = await admin.from("eventos_stripe").select("procesado_at").eq("stripe_event_id", evento.id).maybeSingle();
    if (previo?.procesado_at) return texto("Ya procesado.", 200);
  }

  try {
    if (existe.cobro_exento || existe.plan === "demo") {
      await admin.from("eventos_stripe").update({ procesado_at: new Date().toISOString(), error: "negocio fuera del cobro" }).eq("stripe_event_id", evento.id);
      return texto("Negocio fuera del cobro.", 200);
    }
    if (destino.factura) {
      // La factura también se lee de nuevo: el payload puede ser viejo.
      const factura = await stripe().invoices.retrieve(destino.factura.id!);
      await registrarFactura(negocio, factura, evento.type === "invoice.payment_failed");
    }
    let estado = "sin suscripción";
    if (destino.suscripcion) estado = await aplicarSuscripcion(negocio, destino.suscripcion);
    await admin.from("eventos_stripe").update({ procesado_at: new Date().toISOString(), error: null }).eq("stripe_event_id", evento.id);
    return texto(`OK: ${estado}`, 200);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[stripe] error al procesar", evento.id, evento.type, e);
    await admin.from("eventos_stripe").update({ error: mensaje.slice(0, 1000) }).eq("stripe_event_id", evento.id);
    // 500: Stripe lo reintenta.
    return texto("Error al procesar; se reintentará.", 500);
  }
}
