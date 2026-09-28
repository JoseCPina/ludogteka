"use server";

import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioActual, urlDelNegocio } from "@/lib/negocio/actual";
import { stripe, mensajeDeErrorStripe, modoStripe } from "@/lib/cobro/stripe";
import { precioParaCobrar } from "@/lib/cobro/precios";
import { configuracionPortal } from "@/lib/cobro/portal";
import { METADATA_NEGOCIO, aplicarSuscripcion, guardarCliente } from "@/lib/cobro/suscripcion";
import { tipoDeCambio } from "@/lib/cobro/cambio";
import { esCorreoSintetico } from "@/lib/auth/identidad";
import type { MiCobro, ModuloQueSeApaga, PlanOferta, ResultadoCobro, Seleccion } from "@/lib/cobro/tipos";

// La suscripción del negocio a PeluDesk, desde «Módulos y plan». Solo el
// admin (la sesión y mi_cobro() lo comprueban). Ninguna de estas acciones
// escribe "pagado" ni cambia el plan en la base: mandan a Stripe (Checkout,
// portal) o le piden el cambio a Stripe, y lo que quede se aplica leyendo la
// suscripción de Stripe (aplicarSuscripcion), igual que el webhook.

const VIVAS = new Set(["trialing", "active", "past_due", "unpaid"]);
const HORAS_MIN_PRUEBA = 49; // Stripe pide que el fin de la prueba esté a 48 h o más.

async function contexto() {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") return null;
  const negocio = await negocioActual();
  const supabase = await createSupabaseServerClient();
  const { data: cobro, error } = await supabase.rpc("mi_cobro");
  if (error || !cobro) return null;
  const admin = createSupabaseAdminClient(negocio.id);
  const { data: fila } = await admin
    .from("suscripciones")
    .select("modo, stripe_customer_id, stripe_subscription_id, estado_stripe")
    .eq("negocio_id", negocio.id)
    .is("deleted_at", null)
    .maybeSingle();
  return { sesion, negocio, supabase, admin, cobro: cobro as MiCobro, fila };
}
type Contexto = NonNullable<Awaited<ReturnType<typeof contexto>>>;

const SIN_PERMISO: ResultadoCobro = { error: "Solo el admin del negocio contrata o cambia el plan." };

async function catalogo(ctx: Contexto): Promise<PlanOferta[]> {
  const { data } = await ctx.supabase
    .from("planes")
    .select("id, clave, nombre, descripcion, tipo, precio_mensual, modulos")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("orden");
  return ((data ?? []) as PlanOferta[]).map((p) => ({ ...p, precio_mensual: Number(p.precio_mensual) }));
}

// Los precios de Stripe de lo que escogió, comprobando que el importe es el
// de la base (lo que vio en pantalla).
async function preciosDeSeleccion(ctx: Contexto, sel: Seleccion): Promise<{ plan: Stripe.Price; web: Stripe.Price | null; oferta: PlanOferta }> {
  const planes = await catalogo(ctx);
  const oferta = planes.find((p) => p.clave === sel.plan && p.tipo === "plan" && p.precio_mensual > 0);
  if (!oferta) throw new Error("Ese plan no está disponible.");
  if (sel.periodicidad !== "mensual" && sel.periodicidad !== "anual") throw new Error("Escoge mensual o anual.");
  const plan = await precioParaCobrar(oferta.clave, oferta.precio_mensual, sel.periodicidad);
  // La página web ganada en la prueba nunca se cobra.
  let web: Stripe.Price | null = null;
  if (sel.web && !ctx.cobro.web_gratis && !oferta.modulos.includes("pagina_web")) {
    const complemento = planes.find((p) => p.tipo === "complemento" && p.modulos.includes("pagina_web"));
    if (!complemento) throw new Error("La página web no está disponible como complemento.");
    web = await precioParaCobrar(complemento.clave, complemento.precio_mensual, sel.periodicidad);
  }
  return { plan, web, oferta };
}

async function clienteStripe(ctx: Contexto): Promise<string> {
  // Se reutiliza el cliente guardado solo si es de este modo (una llave de
  // prueba no ve los clientes de producción, ni al revés) y sigue existiendo.
  const guardado = ctx.fila?.modo === modoStripe() ? (ctx.fila?.stripe_customer_id as string | null) : null;
  if (guardado) {
    const c = await stripe().customers.retrieve(guardado).catch((e) => {
      if ((e as { code?: string }).code === "resource_missing") return null;
      throw e;
    });
    if (c && !c.deleted) return guardado;
  }
  const { data: persona } = await ctx.supabase.auth.getUser();
  const c = await stripe().customers.create(
    {
      name: ctx.negocio.nombre,
      // El correo interno de una cuenta por teléfono no recibe nada: Stripe pide uno en el Checkout.
      email: persona.user?.email && !esCorreoSintetico(persona.user.email) ? persona.user.email : undefined,
      metadata: { [METADATA_NEGOCIO]: ctx.negocio.id, peludesk_slug: ctx.negocio.slug },
    },
    { idempotencyKey: `peludesk-cliente:${ctx.negocio.id}:${modoStripe()}:${guardado ?? "primero"}` }
  );
  await guardarCliente(ctx.negocio.id, c.id);
  return c.id;
}

/** Stripe Checkout para contratar. Devuelve la URL a la que se manda al admin. */
export async function contratar(sel: Seleccion): Promise<ResultadoCobro> {
  const ctx = await contexto();
  if (!ctx) return SIN_PERMISO;
  if (ctx.cobro.exento) return { error: "Este negocio está fuera del cobro de PeluDesk." };
  if (ctx.fila?.stripe_subscription_id && VIVAS.has(String(ctx.fila.estado_stripe))) {
    return { error: "Ya tienes una suscripción. Para cambiar de plan usa «Cambiar a este plan»." };
  }
  try {
    const { plan, web } = await preciosDeSeleccion(ctx, sel);
    const customer = await clienteStripe(ctx);
    // Durante la prueba no pierde días: el primer cobro es al terminar.
    let trialEnd: number | undefined;
    const fin = ctx.cobro.plan === "prueba" && ctx.cobro.prueba_termina_at ? new Date(ctx.cobro.prueba_termina_at).getTime() : 0;
    if (fin > Date.now()) {
      trialEnd = Math.ceil(Math.max(fin, Date.now() + HORAS_MIN_PRUEBA * 3600_000) / 1000);
    }
    const base = urlDelNegocio(ctx.negocio);
    const metadata = { [METADATA_NEGOCIO]: ctx.negocio.id, peludesk_plan: sel.plan, periodicidad: sel.periodicidad };
    const sesion = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: plan.id, quantity: 1 }, ...(web ? [{ price: web.id, quantity: 1 }] : [])],
      subscription_data: { metadata, ...(trialEnd ? { trial_end: trialEnd } : {}) },
      payment_method_collection: "always",
      metadata,
      client_reference_id: ctx.negocio.id,
      locale: "es-419",
      // Siempre en pesos: la cuenta (de Menteo) tiene la conversión de moneda
      // automática, que le enseñaría dólares a quien pague desde fuera de México.
      adaptive_pricing: { enabled: false },
      custom_text: {
        submit: {
          message: trialEnd
            ? "Precios con IVA incluido. No se te cobra hoy: el primer cobro es al terminar tu prueba gratis."
            : "Precios con IVA incluido.",
        },
      },
      success_url: `${base}/admin/modulos/pago?sesion={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/admin/modulos?pago=cancelado`,
    });
    if (!sesion.url) return { error: "No se pudo abrir la página de pago." };
    return { error: null, url: sesion.url };
  } catch (e) {
    return { error: e instanceof Error && e.message.startsWith("Los precios") ? e.message : mensajeDeErrorStripe(e) };
  }
}

async function suscripcionViva(ctx: Contexto): Promise<Stripe.Subscription> {
  const id = ctx.fila?.stripe_subscription_id as string | undefined;
  if (!id) throw new Error("Todavía no tienes una suscripción.");
  const sub = await stripe().subscriptions.retrieve(id, { expand: ["items.data.price"] });
  if (sub.metadata?.[METADATA_NEGOCIO] !== ctx.negocio.id) throw new Error("Esa suscripción no es de este negocio.");
  if (!VIVAS.has(sub.status)) throw new Error("Tu suscripción ya no está activa: contrata de nuevo.");
  return sub;
}

function totalDe(precios: (Stripe.Price | null)[]): number {
  return precios.reduce((a, p) => a + (p?.unit_amount ?? 0), 0);
}

/** Cambiar de plan, de periodicidad o la página web. Subir: hoy; bajar: al siguiente periodo. */
export async function cambiarPlanSuscripcion(sel: Seleccion): Promise<ResultadoCobro> {
  const ctx = await contexto();
  if (!ctx) return SIN_PERMISO;
  try {
    let sub = await suscripcionViva(ctx);
    const { plan, web } = await preciosDeSeleccion(ctx, sel);
    const s = stripe();
    // Si había un cambio programado, lo nuevo lo reemplaza.
    const idSchedule = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
    if (idSchedule) {
      await s.subscriptionSchedules.release(idSchedule);
      sub = await s.subscriptions.retrieve(sub.id, { expand: ["items.data.price"] });
    }
    const itemPlan = sub.items.data.find((i) => i.price.metadata?.peludesk_tipo !== "complemento");
    const itemWeb = sub.items.data.find((i) => i.price.metadata?.peludesk_tipo === "complemento");
    if (!itemPlan) throw new Error("No encontramos el plan en tu suscripción. Escríbenos.");
    const periodicidadActual = itemPlan.price.recurring?.interval === "year" ? "anual" : "mensual";
    const tipo = tipoDeCambio(
      { total: totalDe(sub.items.data.map((i) => i.price)), periodicidad: periodicidadActual },
      { total: totalDe([plan, web]), periodicidad: sel.periodicidad }
    );
    const items: Stripe.SubscriptionUpdateParams.Item[] = [
      { id: itemPlan.id, price: plan.id, quantity: 1 },
      ...(web ? [itemWeb ? { id: itemWeb.id, price: web.id, quantity: 1 } : { price: web.id, quantity: 1 }] : []),
      ...(!web && itemWeb ? [{ id: itemWeb.id, deleted: true }] : []),
    ];

    if (sub.status === "trialing") {
      // En la prueba no hay nada que prorratear: cambia lo que se cobrará al terminar.
      await s.subscriptions.update(sub.id, { items, proration_behavior: "none" });
      await aplicarSuscripcion(ctx.negocio.id, sub.id);
      revalidatePath("/", "layout");
      return { error: null, exito: "Listo: al terminar tu prueba se cobra el plan que escogiste." };
    }

    if (tipo !== "bajar") {
      // Subir: inmediato, con prorrateo, y SOLO si Stripe logra cobrar la
      // diferencia (error_if_incomplete): si el banco rechaza, nada cambia.
      await s.subscriptions.update(sub.id, {
        items,
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
      });
      await aplicarSuscripcion(ctx.negocio.id, sub.id);
      revalidatePath("/", "layout");
      return { error: null, exito: "Listo: tu plan cambió hoy. Se cobró la diferencia proporcional a lo que queda del periodo." };
    }

    // Bajar: al terminar el periodo pagado, con un subscription schedule.
    const fin = itemPlan.current_period_end;
    const schedule = await s.subscriptionSchedules.create({ from_subscription: sub.id });
    const actual = schedule.phases[schedule.phases.length - 1];
    const meta = { [METADATA_NEGOCIO]: ctx.negocio.id, peludesk_plan: sel.plan, periodicidad: sel.periodicidad };
    await s.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      proration_behavior: "none",
      phases: [
        {
          items: actual.items.map((i) => ({ price: typeof i.price === "string" ? i.price : i.price.id, quantity: i.quantity ?? 1 })),
          start_date: actual.start_date,
          end_date: fin,
          metadata: sub.metadata,
        },
        {
          items: [{ price: plan.id, quantity: 1 }, ...(web ? [{ price: web.id, quantity: 1 }] : [])],
          duration: { interval: sel.periodicidad === "anual" ? "year" : "month", interval_count: 1 },
          metadata: meta,
        },
      ],
    });
    await aplicarSuscripcion(ctx.negocio.id, sub.id);
    revalidatePath("/", "layout");
    return { error: null, exito: "Listo: el cambio se aplica al terminar tu periodo pagado. Hasta entonces sigues con tu plan actual." };
  } catch (e) {
    if (e instanceof Error && !(e as { type?: string }).type) return { error: e.message };
    return { error: mensajeDeErrorStripe(e) };
  }
}

/** Deshacer un cambio a un plan menor que todavía no se aplica. */
export async function cancelarCambioProgramado(): Promise<ResultadoCobro> {
  const ctx = await contexto();
  if (!ctx) return SIN_PERMISO;
  try {
    const sub = await suscripcionViva(ctx);
    const idSchedule = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
    if (idSchedule) await stripe().subscriptionSchedules.release(idSchedule);
    await aplicarSuscripcion(ctx.negocio.id, sub.id);
    revalidatePath("/", "layout");
    return { error: null, exito: "Listo: te quedas con tu plan actual." };
  } catch (e) {
    return { error: e instanceof Error && !(e as { type?: string }).type ? e.message : mensajeDeErrorStripe(e) };
  }
}

/** El portal de Stripe: tarjeta, facturas y cancelar. */
export async function abrirPortalPagos(): Promise<ResultadoCobro> {
  const ctx = await contexto();
  if (!ctx) return SIN_PERMISO;
  const customer = ctx.fila?.stripe_customer_id as string | undefined;
  if (!customer) return { error: "Todavía no tienes una suscripción." };
  try {
    const portal = await stripe().billingPortal.sessions.create({
      customer,
      configuration: await configuracionPortal(),
      locale: "es-419",
      return_url: `${urlDelNegocio(ctx.negocio)}/admin/modulos`,
    });
    return { error: null, url: portal.url };
  } catch (e) {
    return { error: mensajeDeErrorStripe(e) };
  }
}

/** Qué módulos se apagarían con ese plan, y qué queda pendiente en cada uno. */
export async function impactoDeCambio(sel: Seleccion): Promise<{ error: string | null; modulos?: ModuloQueSeApaga[] }> {
  const ctx = await contexto();
  if (!ctx) return SIN_PERMISO;
  const planes = await catalogo(ctx);
  const oferta = planes.find((p) => p.clave === sel.plan && p.tipo === "plan");
  if (!oferta) return { error: "Ese plan no está disponible." };
  const { data: filas } = await ctx.supabase.rpc("mis_modulos");
  const { data: n } = await ctx.admin.from("negocios").select("modulos_cortesia").eq("id", ctx.negocio.id).single();
  const conservan = new Set([
    ...oferta.modulos,
    ...((n?.modulos_cortesia as string[]) ?? []),
    ...(sel.web || ctx.cobro.web_gratis ? ["pagina_web"] : []),
  ]);
  const perdidos = ((filas ?? []) as { clave: string; nombre: string; disponible: boolean }[]).filter(
    (m) => m.disponible && !conservan.has(m.clave)
  );
  const modulos: ModuloQueSeApaga[] = [];
  for (const m of perdidos) {
    const { data } = await ctx.supabase.rpc("impacto_apagar_modulo", { p_modulo: m.clave });
    const d = (data ?? {}) as { pendientes?: number; que?: string | null };
    modulos.push({ clave: m.clave, nombre: m.nombre, pendientes: Number(d.pendientes ?? 0), que: d.que ?? null });
  }
  return { error: null, modulos };
}

/** El admin cerró el recordatorio de pago fallido (vuelve en tres días). */
export async function marcarRecordatorioVisto(): Promise<ResultadoCobro> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cobro_recordatorio_visto");
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { error: null };
}
