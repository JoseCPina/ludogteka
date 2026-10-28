"use server";

import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioActual, urlDelNegocio, zonaActual } from "@/lib/negocio/actual";
import { stripe, mensajeDeErrorStripe, modoStripe } from "@/lib/cobro/stripe";
import { precioParaCobrar, sincronizarPreciosPlan } from "@/lib/cobro/precios";
import { configuracionPortal } from "@/lib/cobro/portal";
import { METADATA_NEGOCIO, aplicarSuscripcion, guardarCliente } from "@/lib/cobro/suscripcion";
import { tipoDeCambio } from "@/lib/cobro/cambio";
import { AVISO_COBRO_MENTEO, CHECKOUT_FIJO, textoCheckout, trialEndAlContratar } from "@/lib/cobro/prueba";
import { esCorreoSintetico } from "@/lib/auth/identidad";
import { ajustarSucursales, esItemSucursal, precioSucursal, sucursalesActivas } from "@/lib/cobro/sucursales";
import { guardarEnCliente, validarDatosFacturacion, type DatosFacturacion } from "@/lib/cobro/facturacion";
import type { MiCobro, ModuloQueSeApaga, PlanOferta, ResultadoCobro, Seleccion } from "@/lib/cobro/tipos";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { ConRegistros, RegistroFinal } from "@/lib/concurrencia/tipos";

// La suscripción del negocio a PeluDesk, desde «Módulos y plan». Solo el
// admin (la sesión y mi_cobro() lo comprueban). Ninguna de estas acciones
// escribe "pagado" ni cambia el plan en la base: mandan a Stripe (Checkout,
// portal) o le piden el cambio a Stripe, y lo que quede se aplica leyendo la
// suscripción de Stripe (aplicarSuscripcion), igual que el webhook.

const VIVAS = new Set(["trialing", "active", "past_due", "unpaid"]);

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

// Cómo quedó la suscripción del negocio (y el negocio: plan, estado) después de un cambio.
async function registrosSuscripcion(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, negocioId: string): Promise<RegistroFinal[]> {
  const { data } = await supabase.from("suscripciones").select("id").eq("negocio_id", negocioId).is("deleted_at", null).maybeSingle();
  return registrosDe(supabase, [{ t: "suscripciones", i: (data as { id: string } | null)?.id }, { t: "negocios", i: negocioId }]);
}

async function catalogo(ctx: Contexto): Promise<PlanOferta[]> {
  const { data } = await ctx.supabase
    .from("planes")
    .select("id, clave, nombre, descripcion, tipo, precio_mensual, modulos")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("orden");
  return ((data ?? []) as PlanOferta[]).map((p) => ({ ...p, precio_mensual: Number(p.precio_mensual) }));
}

// El precio de Stripe de un plan. Si la plataforma cambió el precio en la base y
// Stripe todavía no lo tiene (un plan nuevo, o el cambio al plan único), se crea
// aquí el precio nuevo con la misma lookup key —el anterior no se toca— y se
// vuelve a comprobar: lo que se cobra es siempre lo que dice la base.
async function precioDeStripe(oferta: PlanOferta, periodicidad: Seleccion["periodicidad"]): Promise<Stripe.Price> {
  try {
    return await precioParaCobrar(oferta.clave, oferta.precio_mensual, periodicidad);
  } catch {
    await sincronizarPreciosPlan({ id: oferta.id, clave: oferta.clave, nombre: oferta.nombre, tipo: oferta.tipo, precio_mensual: oferta.precio_mensual, activo: true });
    return precioParaCobrar(oferta.clave, oferta.precio_mensual, periodicidad);
  }
}

// Los precios de Stripe de lo que escogió, comprobando que el importe es el
// de la base (lo que vio en pantalla).
async function preciosDeSeleccion(ctx: Contexto, sel: Seleccion): Promise<{ plan: Stripe.Price; web: Stripe.Price | null; oferta: PlanOferta }> {
  const planes = await catalogo(ctx);
  const oferta = planes.find((p) => p.clave === sel.plan && p.tipo === "plan" && p.precio_mensual > 0);
  if (!oferta) throw new Error("Ese plan no está disponible.");
  if (sel.periodicidad !== "mensual" && sel.periodicidad !== "anual") throw new Error("Escoge mensual o anual.");
  const plan = await precioDeStripe(oferta, sel.periodicidad);
  // La página web ganada en la prueba nunca se cobra.
  let web: Stripe.Price | null = null;
  if (sel.web && !ctx.cobro.web_gratis && !oferta.modulos.includes("pagina_web")) {
    const complemento = planes.find((p) => p.tipo === "complemento" && p.modulos.includes("pagina_web"));
    if (!complemento) throw new Error("La página web no está disponible como complemento.");
    web = await precioDeStripe(complemento, sel.periodicidad);
  }
  return { plan, web, oferta };
}

// PeluDesk cobra a negocios en México: el cliente de Stripe nace con ese país (lo cambia «Datos de facturación»).
const PAIS_CLIENTE = "MX";

async function clienteStripe(ctx: Contexto): Promise<string> {
  // Se reutiliza el cliente guardado solo si es de este modo (una llave de
  // prueba no ve los clientes de producción, ni al revés) y sigue existiendo.
  const guardado = ctx.fila?.modo === modoStripe() ? (ctx.fila?.stripe_customer_id as string | null) : null;
  if (guardado) {
    const c = await stripe().customers.retrieve(guardado).catch((e) => {
      if ((e as { code?: string }).code === "resource_missing") return null;
      throw e;
    });
    if (c && !c.deleted) {
      // El país del Checkout sale de la dirección del cliente: sin ella Stripe proponía «Estados Unidos» (QA S27).
      if (!c.address?.country) await stripe().customers.update(guardado, { address: { country: PAIS_CLIENTE } });
      return guardado;
    }
  }
  const { data: persona } = await ctx.supabase.auth.getUser();
  const c = await stripe().customers.create(
    {
      name: ctx.negocio.nombre,
      // El correo interno de una cuenta por teléfono no recibe nada: Stripe pide uno en el Checkout.
      email: persona.user?.email && !esCorreoSintetico(persona.user.email) ? persona.user.email : undefined,
      metadata: { [METADATA_NEGOCIO]: ctx.negocio.id, peludesk_slug: ctx.negocio.slug },
      // El país del Checkout sale de aquí: sin dirección Stripe proponía «Estados Unidos» (QA S27).
      address: { country: PAIS_CLIENTE },
    },
    { idempotencyKey: `peludesk-cliente:${ctx.negocio.id}:${modoStripe()}:${guardado ?? "primero"}` }
  );
  await guardarCliente(ctx.negocio.id, c.id);
  return c.id;
}

/** Stripe Checkout para contratar. Devuelve la URL a la que se manda al admin. */
// registro-final: solo abre Stripe Checkout (la pantalla navega a la URL); el plan lo aplica el webhook
export async function contratar(sel: Seleccion): Promise<ResultadoCobro> {
  const ctx = await contexto();
  if (!ctx) return SIN_PERMISO;
  if (ctx.cobro.exento) return { error: "Este negocio está fuera del cobro de PeluDesk." };
  if (ctx.cobro.sucursal_de) return { error: "Esta sucursal se paga en la suscripción de tu primera sucursal: contrata desde ahí." };
  if (ctx.fila?.stripe_subscription_id && VIVAS.has(String(ctx.fila.estado_stripe))) {
    return { error: "Ya tienes una suscripción. Para cambiar de plan usa «Cambiar a este plan»." };
  }
  try {
    const { plan, web } = await preciosDeSeleccion(ctx, sel);
    // Si ya tenía sucursales (volvió a contratar después de cancelar), van en la misma suscripción.
    const sucursales = await sucursalesActivas(ctx.negocio.id);
    const sucursal = sucursales > 0 ? await precioSucursal(sel.periodicidad) : null;
    const customer = await clienteStripe(ctx);
    // Durante la prueba no pierde días: el primer cobro es al terminar. La fecha es la misma que ve en el banner
    // y en «Módulos y plan» (el último día de la prueba en la zona del negocio), y Stripe recibe el instante exacto.
    const zona = await zonaActual();
    const finPrueba = ctx.cobro.plan === "prueba" ? trialEndAlContratar(ctx.cobro.prueba_termina_at, zona) : null;
    const trialEnd = finPrueba ? finPrueba.getTime() / 1000 : undefined;
    // Para que el cobro de Stripe no sorprenda: sus facturas y recibos dicen a nombre de quién sale.
    await stripe().customers.update(customer, { invoice_settings: { footer: AVISO_COBRO_MENTEO } });
    const base = urlDelNegocio(ctx.negocio);
    const metadata = { [METADATA_NEGOCIO]: ctx.negocio.id, peludesk_plan: sel.plan, periodicidad: sel.periodicidad };
    const sesion = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [
        { price: plan.id, quantity: 1 },
        ...(web ? [{ price: web.id, quantity: 1 }] : []),
        ...(sucursal ? [{ price: sucursal.id, quantity: sucursales }] : []),
      ],
      subscription_data: { metadata, description: `Suscripción a PeluDesk de ${ctx.negocio.nombre}. ${AVISO_COBRO_MENTEO}`, ...(trialEnd ? { trial_end: trialEnd } : {}) },
      ...CHECKOUT_FIJO,
      payment_method_types: [...CHECKOUT_FIJO.payment_method_types],
      metadata,
      client_reference_id: ctx.negocio.id,
      // Con `trial_end` Stripe pone «Comenzar prueba» en el botón y no deja cambiarlo (submit_type no aplica con prueba;
      // comprobado en modo prueba en QA S36): el texto de junto dice que no se cobra hoy y cuándo es el primer cobro.
      custom_text: { submit: { message: textoCheckout(trialEnd ? new Date(trialEnd * 1000) : null, zona) } },
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

function totalDe(conceptos: { price: Stripe.Price | null; quantity?: number | null }[]): number {
  return conceptos.reduce((a, c) => a + (c.price?.unit_amount ?? 0) * (c.quantity ?? 1), 0);
}

/** Cambiar de plan, de periodicidad o la página web. Subir: hoy; bajar: al siguiente periodo. */
export async function cambiarPlanSuscripcion(sel: Seleccion): Promise<ResultadoCobro & ConRegistros> {
  const ctx = await contexto();
  if (!ctx) return { error: SIN_PERMISO.error };
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
    const itemSucursal = sub.items.data.find(esItemSucursal);
    // El concepto medido de recordatorios de WhatsApp tampoco es el plan.
  const itemPlan = sub.items.data.find((i) => !esItemSucursal(i) && i.price.metadata?.peludesk_tipo !== "complemento" && i.price.metadata?.peludesk_tipo !== "recordatorios");
    const itemWeb = sub.items.data.find((i) => i.price.metadata?.peludesk_tipo === "complemento");
    if (!itemPlan) throw new Error("No encontramos el plan en tu suscripción. Escríbenos.");
    const periodicidadActual = itemPlan.price.recurring?.interval === "year" ? "anual" : "mensual";
    // Las sucursales adicionales cambian de periodicidad junto con el plan (Stripe no mezcla mensual y anual).
    const sucursal = itemSucursal ? { price: await precioSucursal(sel.periodicidad), quantity: itemSucursal.quantity ?? 1 } : null;
    const tipo = tipoDeCambio(
      { total: totalDe(sub.items.data), periodicidad: periodicidadActual },
      { total: totalDe([{ price: plan }, { price: web }, ...(sucursal ? [sucursal] : [])]), periodicidad: sel.periodicidad }
    );
    const items: Stripe.SubscriptionUpdateParams.Item[] = [
      { id: itemPlan.id, price: plan.id, quantity: 1 },
      ...(web ? [itemWeb ? { id: itemWeb.id, price: web.id, quantity: 1 } : { price: web.id, quantity: 1 }] : []),
      ...(!web && itemWeb ? [{ id: itemWeb.id, deleted: true }] : []),
      ...(sucursal && itemSucursal ? [{ id: itemSucursal.id, price: sucursal.price.id, quantity: sucursal.quantity }] : []),
    ];

    if (sub.status === "trialing") {
      // En la prueba no hay nada que prorratear: cambia lo que se cobrará al terminar.
      await s.subscriptions.update(sub.id, { items, proration_behavior: "none" });
      await aplicarSuscripcion(ctx.negocio.id, sub.id);
      revalidatePath("/", "layout");
      return { error: null, exito: "Listo: al terminar tu prueba se cobra el plan que escogiste.", registros: await registrosSuscripcion(ctx.supabase, ctx.negocio.id) };
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
      return {
        error: null,
        exito: "Listo: tu plan cambió hoy. Se cobró la diferencia proporcional a lo que queda del periodo.",
        registros: await registrosSuscripcion(ctx.supabase, ctx.negocio.id),
      };
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
          items: [
            { price: plan.id, quantity: 1 },
            ...(web ? [{ price: web.id, quantity: 1 }] : []),
            ...(sucursal ? [{ price: sucursal.price.id, quantity: sucursal.quantity }] : []),
          ],
          duration: { interval: sel.periodicidad === "anual" ? "year" : "month", interval_count: 1 },
          metadata: meta,
        },
      ],
    });
    await aplicarSuscripcion(ctx.negocio.id, sub.id);
    revalidatePath("/", "layout");
    return {
      error: null,
      exito: "Listo: el cambio se aplica al terminar tu periodo pagado. Hasta entonces sigues con tu plan actual.",
      registros: await registrosSuscripcion(ctx.supabase, ctx.negocio.id),
    };
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
      locale: CHECKOUT_FIJO.locale,
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
export async function marcarRecordatorioVisto(): Promise<ResultadoCobro & ConRegistros> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cobro_recordatorio_visto");
  if (error) return { error: error.message };
  revalidatePath("/admin");
  return { error: null, registros: await registrosSuscripcion(supabase, (await negocioActual()).id) };
}

/** Los datos de facturación (CFDI de la suscripción): se guardan en el cliente de Stripe del negocio. */
export async function guardarDatosFacturacion(d: Partial<DatosFacturacion>): Promise<ResultadoCobro> {
  const ctx = await contexto();
  if (!ctx) return SIN_PERMISO;
  if (ctx.cobro.exento) return { error: "Este negocio está fuera del cobro de PeluDesk: no hay factura que emitir." };
  if (ctx.cobro.sucursal_de) return { error: "La factura sale a nombre de tu primera sucursal, que es la que paga: captura los datos desde ahí." };
  const v = validarDatosFacturacion(d);
  if ("error" in v) return { error: v.error };
  try {
    const customer = await clienteStripe(ctx);
    await guardarEnCliente(customer, v.datos);
    revalidatePath("/admin/modulos");
    return { error: null, exito: "Guardado. Con cada pago te llega la factura por correo en los días siguientes." };
  } catch (e) {
    if ((e as { code?: string }).code === "tax_id_invalid") return { error: "Stripe no aceptó ese RFC. Revísalo contra tu constancia de situación fiscal." };
    return { error: mensajeDeErrorStripe(e) };
  }
}

/**
 * Abre otra sucursal: un negocio nuevo ligado a la cuenta del dueño, con su propia caja, agenda, personal y
 * página. Primero se revisa nombre y subdominio, luego se cobra en Stripe la parte proporcional de la sucursal
 * adicional (si el banco rechaza, no se abre nada) y al final se crea. Si crear falla, se regresa el cobro.
 */
export async function abrirSucursal(nombre: string, subdominio: string): Promise<ResultadoCobro & ConRegistros & { negocioId?: string }> {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") return { error: "Solo el admin abre sucursales." };
  const negocio = await negocioActual();
  const servidor = createSupabaseAdminClient(negocio.id);
  const base = { p_persona_id: sesion.user.id, p_desde_negocio: negocio.id, p_nombre: nombre, p_slug: subdominio };
  const revision = await servidor.rpc("crear_sucursal", { ...base, p_solo_revisar: true });
  if (revision.error) return { error: revision.error.message };
  const principal = (revision.data as { principal_id: string }).principal_id;
  let antes = 0;
  try {
    antes = await sucursalesActivas(principal);
    await ajustarSucursales(principal, antes + 1);
  } catch (e) {
    if (e instanceof Error && !(e as { type?: string }).type) return { error: e.message };
    return { error: mensajeDeErrorStripe(e) };
  }
  const creada = await servidor.rpc("crear_sucursal", base);
  if (creada.error) {
    console.error("[sucursal] se cobró y no se pudo crear; se regresa", creada.error);
    await ajustarSucursales(principal, antes).catch((e) => console.error("[sucursal] no se pudo regresar el cobro", e));
    return { error: `${creada.error.message} No se abrió la sucursal y el cobro se regresa como saldo a favor.` };
  }
  // Por si otra sucursal se abrió al mismo tiempo: la cantidad en Stripe = las que hay en la base.
  await ajustarSucursales(principal, await sucursalesActivas(principal)).catch((e) => console.error("[sucursal] reconciliar", e));
  revalidatePath("/", "layout");
  const nuevaId = (creada.data as { negocio_id: string }).negocio_id;
  // La sucursal nueva es otro negocio (la sesión de aquí no la lee): va lo que ya se sabe de ella.
  const supabase = await createSupabaseServerClient();
  return {
    error: null,
    exito: "Listo: tu sucursal quedó abierta y se sumó a tu suscripción.",
    negocioId: nuevaId,
    registros: await registrosDe(supabase, [{ t: "negocios", i: nuevaId, datos: { nombre, slug: subdominio } }]),
  };
}

/**
 * QA S17: dar de baja una sucursal adicional. Queda en solo lectura 90 días, sale de «Tus negocios» y la cantidad de
 * «Sucursal adicional» en Stripe baja en uno (la parte proporcional queda a favor). Si Stripe no responde, la baja
 * se deshace: nunca queda una sucursal dada de baja que se sigue cobrando sin avisar.
 */
export async function darBajaSucursal(sucursalId: string, motivo: string): Promise<ResultadoCobro & ConRegistros> {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") return { error: "Solo el admin da de baja una sucursal." };
  if (motivo.trim().length < 5) return { error: "Escribe el motivo de la baja (al menos 5 letras)." };
  const negocio = await negocioActual();
  const servidor = createSupabaseAdminClient(negocio.id);
  const baja = await servidor.rpc("dar_baja_sucursal", { p_sucursal: sucursalId, p_actor: sesion.user.id, p_motivo: motivo.trim() });
  if (baja.error) return { error: baja.error.message };
  const principal = (baja.data as { principal_id: string }).principal_id;
  try {
    await ajustarSucursales(principal, await sucursalesActivas(principal));
  } catch (e) {
    await servidor.rpc("revertir_baja_sucursal", { p_sucursal: sucursalId });
    if (e instanceof Error && !(e as { type?: string }).type) return { error: `${e.message} No se dio de baja la sucursal.` };
    return { error: `${mensajeDeErrorStripe(e)} No se dio de baja la sucursal.` };
  }
  revalidatePath("/", "layout");
  const supabase = await createSupabaseServerClient();
  const bajaHasta = (baja.data as { hasta?: string }).hasta ?? null;
  const registros = await registrosDe(supabase, [{ t: "negocios", i: sucursalId, datos: { sucursal_baja_hasta: bajaHasta, sucursal_baja_motivo: motivo.trim() } }]);
  return { registros, error: null, exito: "Listo: la sucursal quedó dada de baja. Se puede consultar en solo lectura 90 días y ya no se cobra; la parte proporcional queda a favor en tu siguiente cobro." };
}
