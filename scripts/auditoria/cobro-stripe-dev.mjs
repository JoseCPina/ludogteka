// Uso: node scripts/auditoria/cobro-stripe-dev.mjs <escenario>
//
// SOLO DESARROLLO y Stripe en MODO PRUEBA. Necesita, prendidos:
//   · `next dev -p 3001` (o next start) con STRIPE_SECRET_KEY (sk_test_) y
//     STRIPE_WEBHOOK_SECRET = el de `stripe listen --print-secret`;
//   · `stripe listen --forward-to http://127.0.0.1:3001/api/stripe/webhook
//      --headers "Host: plataforma.localhost:3001" --events <los de EVENTOS_STRIPE>`
//     (los eventos llegan firmados al webhook de verdad, como en producción).
//
// El cobro de punta a punta, como lo vive el negocio: pantallas reales,
// Checkout de Stripe con tarjetas de prueba y el tiempo avanzado con un
// test clock de Stripe (renovaciones y fallos sin esperar un mes). Cada
// escenario revisa lo que dejó el anterior; se corren UNO POR UNO, en orden:
//
//   precios       la plataforma sincroniza los planes con Stripe; cambiar un
//                 precio crea uno nuevo y NO toca el anterior
//   alta          negocio en prueba contrata Guardería y hotel mensual + web
//                 desde «Módulos y plan»: no se cobra hoy, sigue en prueba
//   renovacion    termina la prueba (primer cobro) y se renueva un mes
//   fallo         la tarjeta falla al renovar: gracia, aviso y recordatorio
//   solo-lectura  al día 8 de gracia el negocio queda en solo lectura
//   reactivacion  paga la factura pendiente y se reactiva solo
//   subir         sube a Completo: inmediato, con prorrateo cobrado hoy
//   bajar         baja a Estética: se programa y aplica al siguiente periodo
//   cancelacion   cancela (portal): sigue hasta fin de periodo y luego cancelado
//   recontratar   un negocio cancelado vuelve a contratar y se reactiva
//   subir-sin-pagar  con una tarjeta que el banco rechaza, subir de plan no
//                 cambia nada (ni en Stripe ni en la base)
//   plataforma    /plataforma/cobro: estado, historial de pagos e ingreso
//                 mensual recurrente
//
// Sale con 1 al primer paso que falle. El estado entre escenarios se guarda
// en la carpeta temporal del sistema (nada de secretos).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const LLAVE = process.env.STRIPE_SECRET_KEY ?? env.STRIPE_SECRET_KEY;
if (!LLAVE?.startsWith("sk_test_")) throw new Error("Esto solo corre con una llave de Stripe de MODO PRUEBA (sk_test_).");
const stripe = new Stripe(LLAVE, { apiVersion: "2026-08-26.dahlia" });
const A = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PLATAFORMA = "http://plataforma.localhost:3001";
const ESTADO = path.join(os.tmpdir(), "peludesk-cobro-e2e.json");
const est = fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, "utf8")) : {};
const guardar = () => fs.writeFileSync(ESTADO, JSON.stringify(est, null, 2));
const escenario = process.argv[2];

const ok = (cond, que) => {
  console.log(`  ${cond ? "✔" : "✘"} ${que}`);
  if (!cond) throw new Error(que);
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, que, ms = 90_000) {
  const fin = Date.now() + ms;
  let ultimo;
  while (Date.now() < fin) {
    ultimo = await fn();
    if (ultimo) return ultimo;
    await espera(2000);
  }
  ok(false, `${que} (no pasó en ${ms / 1000} s)`);
}
const exigir = (r, que) => {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
};
const base = () => `http://${est.slug}.localhost:3001`;
const neg = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": est.negocio } } });
const estadoCobro = async () => exigir(await A.rpc("estado_cobro_en", { p_negocio_id: est.negocio }), "estado_cobro_en");
const suscripcion = async () => (await A.from("suscripciones").select("*").eq("negocio_id", est.negocio).is("deleted_at", null).maybeSingle()).data;
const negocio = async () => (await A.from("negocios").select("plan, plan_id, complementos, prueba_termina_at").eq("id", est.negocio).single()).data;
const planId = async (clave) => (await A.from("planes").select("id").eq("clave", clave).is("deleted_at", null).single()).data.id;
const pagos = async () => (await A.from("pagos_suscripcion").select("*").eq("negocio_id", est.negocio).order("created_at")).data ?? [];

async function sesionAdmin() {
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: est.email });
  const { data: s, error } = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}`, "x-negocio-id": est.negocio } } });
}
// ¿El admin puede escribir? (una escritura inofensiva que la base rechaza en solo lectura)
async function puedeEscribir() {
  const adm = await sesionAdmin();
  const r = await adm.from("clientes").insert({ nombre: "Prueba escritura", telefono: `44209${String(Date.now()).slice(-5)}` }).select("id");
  if (!r.error) {
    await neg().from("clientes").delete().eq("id", r.data[0].id).eq("negocio_id", est.negocio);
    return true;
  }
  if (/solo lectura/.test(r.error.message)) return false;
  throw new Error(`escritura de control: ${r.error.message}`);
}

async function avanzarReloj(segundos, que) {
  const reloj = await stripe.testHelpers.testClocks.retrieve(est.reloj);
  const destino = reloj.frozen_time + segundos;
  await stripe.testHelpers.testClocks.advance(est.reloj, { frozen_time: destino });
  await hasta(async () => (await stripe.testHelpers.testClocks.retrieve(est.reloj)).status === "ready", `el reloj de Stripe avanza (${que})`, 180_000);
  console.log(`  · reloj de Stripe: ${new Date(destino * 1000).toISOString()} (${que})`);
  return destino;
}
async function finDePeriodo() {
  const sub = await stripe.subscriptions.retrieve(est.suscripcion);
  return sub.items.data[0].current_period_end;
}

async function navegador() {
  const n = await abrirNavegador();
  const ctx = await n.newContext({ viewport: { width: 1280, height: 1000 }, locale: "es-MX" });
  return { n, page: await ctx.newPage() };
}
async function entrarComoAdmin(page) {
  await page.goto(`${base()}/login`);
  await page.getByLabel("Teléfono o correo").fill(est.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(est.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
}

// Stripe Checkout con una tarjeta de prueba.
async function pagarEnCheckout(page, tarjeta = "4242424242424242") {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const acordeon = page.locator('[data-testid="card-accordion-item-button"]');
  if (await acordeon.isVisible().catch(() => false)) await acordeon.click();
  const correo = page.locator("#email");
  if (await correo.isVisible().catch(() => false) && (await correo.isEditable().catch(() => false))) await correo.fill(est.email);
  await page.locator("#cardNumber").fill(tarjeta);
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  const nombre = page.locator("#billingName");
  if (await nombre.isVisible().catch(() => false)) await nombre.fill("Negocio de Prueba");
  const pais = page.locator("#billingCountry");
  if (await pais.isVisible().catch(() => false)) await pais.selectOption("MX").catch(() => {});
  const cp = page.locator("#billingPostalCode");
  if (await cp.isVisible().catch(() => false)) await cp.fill("76000");
  const link = page.locator("#enableStripePass");
  if (await link.isChecked().catch(() => false)) await link.uncheck().catch(() => {});
  await page.locator('button[type="submit"], .SubmitButton').first().click();
}

// ── Escenarios ──
const ESCENARIOS = {
  async precios() {
    const { data: pa } = await A.from("plataforma_admins").select("profile_id").limit(1).single();
    const { data: u } = await A.auth.admin.getUserById(pa.profile_id);
    const pw = `Plataforma-${Date.now()}`;
    exigir(await A.auth.admin.updateUserById(pa.profile_id, { password: pw }), "contraseña de la cuenta de plataforma de desarrollo");
    const { n, page } = await navegador();
    try {
      await page.goto(`${PLATAFORMA}/plataforma/entrar`);
      await page.getByLabel("Correo").fill(u.user.email);
      await page.getByLabel("Contraseña", { exact: true }).fill(pw);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.waitForURL(/\/plataforma$/, { timeout: 60_000 });
      await page.goto(`${PLATAFORMA}/plataforma/planes`);
      await page.getByRole("button", { name: "Sincronizar todos con Stripe" }).click();
      await page.getByText(/Estética: /).first().waitFor({ timeout: 90_000 });
      const planes = (await A.from("planes").select("clave, precio_mensual, tipo, activo").is("deleted_at", null)).data;
      for (const p of planes.filter((x) => x.activo && Number(x.precio_mensual) > 0)) {
        for (const [per, meses, intervalo] of [["mensual", 1, "month"], ["anual", 10, "year"]]) {
          const total = Math.round(Math.round(Number(p.precio_mensual) * meses * 100) * 1.16);
          const { data } = await stripe.prices.list({ lookup_keys: [`peludesk_${p.clave}_${per}`], limit: 1 });
          const pr = data[0];
          ok(pr && pr.unit_amount === total && pr.tax_behavior === "inclusive" && pr.recurring.interval === intervalo && pr.currency === "mxn",
            `Stripe: peludesk_${p.clave}_${per} = ${total / 100} MXN con IVA incluido`);
        }
      }
      // Cambiar el precio de Estética crea un precio nuevo; el anterior no se toca.
      const antes = (await stripe.prices.list({ lookup_keys: ["peludesk_estetica_mensual"], limit: 1 })).data[0];
      const seccion = page.locator("section", { has: page.getByRole("heading", { name: /^Estética/ }) });
      await seccion.getByLabel("Precio mensual (sin IVA)").fill("459");
      await seccion.getByRole("button", { name: "Guardar plan" }).click();
      await seccion.getByText(/Plan guardado/).waitFor({ timeout: 60_000 });
      const despues = (await stripe.prices.list({ lookup_keys: ["peludesk_estetica_mensual"], limit: 1 })).data[0];
      const viejo = await stripe.prices.retrieve(antes.id);
      ok(despues.id !== antes.id && despues.unit_amount === 53244, "459 + IVA: precio NUEVO de $532.44 con la lookup key");
      ok(viejo.unit_amount === antes.unit_amount && viejo.active, "el precio anterior sigue igual y activo (quien ya pagaba, sigue pagando eso)");
      const anual = (await A.from("planes").select("precio_anual").eq("clave", "estetica").single()).data;
      ok(Number(anual.precio_anual) === 4590, "el anual lo calcula la base: 10 mensualidades");
      await seccion.getByLabel("Precio mensual (sin IVA)").fill("449");
      await seccion.getByRole("button", { name: "Guardar plan" }).click();
      await seccion.getByText(/Plan guardado/).waitFor({ timeout: 60_000 });
      const vuelta = (await stripe.prices.list({ lookup_keys: ["peludesk_estetica_mensual"], limit: 1 })).data[0];
      ok(vuelta.unit_amount === 52084, "de regreso a 449: la lookup key apunta a un precio de $520.84");
      const filas = (await A.from("planes_precios_stripe").select("stripe_price_id").eq("vigente", true).eq("lookup_key", "peludesk_estetica_mensual")).data;
      ok(filas.length === 1 && filas[0].stripe_price_id === vuelta.id, "planes_precios_stripe: un solo precio vigente, el de Stripe");
      // Idempotente: sincronizar otra vez no crea nada.
      const cuantos = (await stripe.prices.list({ lookup_keys: ["peludesk_estetica_mensual", "peludesk_estetica_anual"], limit: 10 })).data.map((p) => p.id).sort().join();
      await page.getByRole("button", { name: "Sincronizar todos con Stripe" }).click();
      await page.getByText(/Stripe ya tenía esos precios/).first().waitFor({ timeout: 90_000 });
      const otraVez = (await stripe.prices.list({ lookup_keys: ["peludesk_estetica_mensual", "peludesk_estetica_anual"], limit: 10 })).data.map((p) => p.id).sort().join();
      ok(cuantos === otraVez, "sincronizar dos veces no crea precios");
    } finally {
      await n.close();
    }
  },

  async alta() {
    // El reloj de la corrida anterior se borra (con él, su cliente y su suscripción de prueba).
    if (est.reloj) await stripe.testHelpers.testClocks.del(est.reloj).catch(() => {});
    // Un negocio nuevo en prueba (10 días) con su admin.
    const sufijo = String(Date.now()).slice(-6);
    const slug = `cobro-${sufijo}`;
    const id = exigir(await A.rpc("crear_negocio", { p_slug: slug, p_nombre: `Cobro ${sufijo}`, p_zona_horaria: "America/Mexico_City", p_ciudad: "Querétaro", p_dominio: null }), "crear negocio");
    exigir(await A.from("negocios").update({ plan: "prueba", prueba_termina_at: new Date(Date.now() + 10 * 86_400_000).toISOString(), plan_id: await planId("guarderia_hotel") }).eq("id", id), "ponerlo en prueba");
    const email = `admin-${sufijo}@cobro.prueba`;
    const password = `Cobro-${sufijo}-segura`;
    const u = exigir(await A.auth.admin.createUser({ email, password, email_confirm: true }), "cuenta admin").user;
    exigir(await A.rpc("agregar_admin_negocio", { p_negocio_id: id, p_profile_id: u.id }), "membresía admin");
    Object.assign(est, { negocio: id, slug, email, password });
    // El cliente de Stripe nace con un reloj de prueba (para adelantar el tiempo).
    const reloj = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: `PeluDesk ${slug}` });
    const cliente = await stripe.customers.create({ name: `Cobro ${sufijo}`, email, test_clock: reloj.id, metadata: { peludesk_negocio_id: id, peludesk_slug: slug } });
    exigir(await A.rpc("cobro_aplicar", { p_negocio_id: id, p: { modo: "test", customer: cliente.id } }), "guardar cliente");
    Object.assign(est, { reloj: reloj.id, cliente: cliente.id });
    guardar();
    ok((await estadoCobro()) === "prueba", "el negocio nuevo está en prueba");

    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin/modulos`);
      await page.getByRole("radio", { name: /Guardería y hotel/ }).click();
      await page.getByRole("radio", { name: "Mensual", exact: true }).click();
      await page.getByRole("checkbox").check();
      // $849 + $149 = $998 + IVA = $1,157.68: la cifra principal sin IVA, el total solo en el resumen.
      await page.getByText("$1,157.68 al mes").first().waitFor();
      ok(await page.getByText("+ IVA").first().isVisible(), "los precios dicen «+ IVA» debajo");
      ok(await page.getByText(/No se te cobra hoy/).isVisible(), "el resumen dice que no se cobra hoy (sigue la prueba)");
      await page.getByRole("button", { name: "Pagar con tarjeta" }).click();
      await pagarEnCheckout(page);
      await page.waitForURL(/\/admin\/modulos\?pago=ok/, { timeout: 90_000 });
      ok(true, "Checkout pagado con 4242 y de regreso en «Módulos y plan»");
      await page.getByText(/Contrataste el plan/).waitFor({ timeout: 30_000 });
    } finally {
      await n.close();
    }
    const s = await hasta(async () => { const x = await suscripcion(); return x?.estado_stripe === "trialing" ? x : null; }, "la suscripción queda en prueba (trialing)");
    est.suscripcion = s.stripe_subscription_id;
    guardar();
    const n2 = await negocio();
    ok(n2.plan === "prueba", "el negocio sigue en prueba: no perdió días");
    ok(Math.abs(Date.parse(s.prueba_hasta) - Date.parse(n2.prueba_termina_at)) < 60_000, "el primer cobro es al terminar la prueba");
    ok(s.monto_centavos === 115768 && s.periodicidad === "mensual" && s.complementos.includes("pagina_web"), "Guardería y hotel mensual + página web: $1,157.68 con IVA");
    ok(s.plan_id === (await planId("guarderia_hotel")), "el plan contratado es Guardería y hotel");
    ok((await pagos()).length === 0, "no se cobró nada hoy");
    ok(await puedeEscribir(), "el negocio sigue pudiendo guardar");
  },

  async renovacion() {
    const s0 = await suscripcion();
    ok(s0?.estado_stripe === "trialing", "viene de la prueba contratada");
    const fin = Math.floor(Date.parse(s0.prueba_hasta) / 1000);
    const reloj = (await stripe.testHelpers.testClocks.retrieve(est.reloj)).frozen_time;
    await avanzarReloj(fin - reloj + 2 * 3600, "termina la prueba");
    const s1 = await hasta(async () => { const x = await suscripcion(); return x?.estado_stripe === "active" ? x : null; }, "Stripe cobra el primer periodo y queda activa");
    const n1 = await negocio();
    ok(n1.plan === "activo" && n1.plan_id === (await planId("guarderia_hotel")) && n1.complementos.includes("pagina_web"), "el negocio pasa a activo con Guardería y hotel + web");
    ok((await estadoCobro()) === "al_corriente", "estado: al corriente");
    const p1 = await hasta(async () => (await pagos()).filter((p) => p.estado === "pagado"), "el pago queda en el historial");
    ok(p1.length === 1 && p1[0].monto_centavos === 115768, "primer pago: $1,157.68");
    const mods = exigir(await (await sesionAdmin()).rpc("modulos_activos"), "módulos");
    ok(mods.includes("hotel") && !mods.includes("empleados"), "módulos del plan contratado (hotel sí, empleados no)");
    // Un mes después, se renueva solo.
    await avanzarReloj((await finDePeriodo()) - (await stripe.testHelpers.testClocks.retrieve(est.reloj)).frozen_time + 2 * 3600, "un mes después");
    const p2 = await hasta(async () => { const x = (await pagos()).filter((p) => p.estado === "pagado"); return x.length >= 2 ? x : null; }, "se cobra la renovación");
    const s2 = await suscripcion();
    ok(p2.length === 2 && Date.parse(s2.periodo_fin) > Date.parse(s1.periodo_fin), "renovado: nuevo periodo y segundo pago");
    ok((await estadoCobro()) === "al_corriente", "sigue al corriente");
  },

  async fallo() {
    // Una tarjeta que se deja guardar pero cuyo cobro falla.
    const pm = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: est.cliente });
    await stripe.customers.update(est.cliente, { invoice_settings: { default_payment_method: pm.id } });
    await stripe.subscriptions.update(est.suscripcion, { default_payment_method: pm.id });
    await avanzarReloj((await finDePeriodo()) - (await stripe.testHelpers.testClocks.retrieve(est.reloj)).frozen_time + 2 * 3600, "siguiente renovación");
    const s = await hasta(async () => { const x = await suscripcion(); return x?.estado_stripe === "past_due" ? x : null; }, "el cobro falla: past_due");
    ok(Boolean(s.primer_fallo_at) && Boolean(s.factura_pendiente_url), "se guarda cuándo falló y la factura por pagar");
    // El reloj de Stripe va adelantado: la gracia se mide desde hoy.
    exigir(await A.from("suscripciones").update({ primer_fallo_at: new Date().toISOString() }).eq("id", s.id), "fecha del fallo = hoy");
    ok((await estadoCobro()) === "gracia", "estado: gracia");
    ok(await puedeEscribir(), "en gracia todo sigue funcionando");
    await hasta(async () => (await pagos()).find((p) => p.estado === "fallido"), "el pago fallido queda en el historial");
    ok(true, "el pago fallido queda en el historial");
    // Aviso en el tablero y recordatorio cada tercer día.
    const adm = await sesionAdmin();
    const c1 = exigir(await adm.rpc("mi_cobro"), "mi_cobro");
    ok(c1.estado === "gracia" && c1.toca_recordatorio, "toca el recordatorio (día 1)");
    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin`);
      await page.getByText("No pudimos cobrar tu suscripción de PeluDesk.").waitFor({ timeout: 30_000 });
      ok(true, "aviso arriba: todo funciona hasta el día 8");
      ok(await page.getByText("No se pudo cobrar tu suscripción de PeluDesk").isVisible(), "«Necesita atención» en el tablero, con su antigüedad");
      await page.getByRole("alertdialog").getByRole("button", { name: "Recordármelo después" }).click();
      await page.getByRole("alertdialog").waitFor({ state: "detached", timeout: 30_000 });
    } finally {
      await n.close();
    }
    ok(!exigir(await adm.rpc("mi_cobro"), "mi_cobro").toca_recordatorio, "cerrado: no vuelve hasta dentro de tres días");
    exigir(await A.from("suscripciones").update({ recordatorio_visto_at: new Date(Date.now() - 3 * 86_400_000 - 60_000).toISOString() }).eq("id", s.id), "tres días después");
    ok(exigir(await adm.rpc("mi_cobro"), "mi_cobro").toca_recordatorio, "tres días después vuelve a salir");
  },

  async "solo-lectura"() {
    const s = await suscripcion();
    ok(s?.estado_stripe === "past_due", "viene del cobro fallido");
    exigir(await A.from("suscripciones").update({ primer_fallo_at: new Date(Date.now() - 7 * 86_400_000 + 3_600_000).toISOString() }).eq("id", s.id), "día 7 de gracia");
    ok((await estadoCobro()) === "gracia" && (await puedeEscribir()), "día 7: todavía funciona");
    exigir(await A.from("suscripciones").update({ primer_fallo_at: new Date(Date.now() - 7 * 86_400_000 - 60_000).toISOString() }).eq("id", s.id), "día 8");
    ok((await estadoCobro()) === "solo_lectura", "día 8: solo lectura");
    ok(!(await puedeEscribir()), "la base rechaza guardar");
    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin`);
      await page.getByText("El negocio está en solo lectura: no se pudo cobrar la suscripción de PeluDesk.").waitFor({ timeout: 30_000 });
      ok(true, "el aviso lo explica y ofrece pagar");
    } finally {
      await n.close();
    }
  },

  async reactivacion() {
    const s = await suscripcion();
    ok((await estadoCobro()) === "solo_lectura", "viene de solo lectura");
    // Paga la factura pendiente con una tarjeta buena (lo que hace en la página de la factura).
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: est.cliente });
    await stripe.customers.update(est.cliente, { invoice_settings: { default_payment_method: pm.id } });
    await stripe.subscriptions.update(est.suscripcion, { default_payment_method: pm.id });
    const factura = (await stripe.invoices.list({ subscription: est.suscripcion, status: "open", limit: 1 })).data[0];
    ok(Boolean(factura), "hay una factura abierta");
    await stripe.invoices.pay(factura.id, { payment_method: pm.id });
    await hasta(async () => (await suscripcion())?.estado_stripe === "active", "Stripe la marca pagada y activa");
    ok((await estadoCobro()) === "al_corriente", "se reactiva sola: al corriente");
    ok(!(await suscripcion()).primer_fallo_at, "la gracia se limpia");
    ok(await puedeEscribir(), "vuelve a poder guardar");
    ok((await pagos()).find((p) => p.stripe_invoice_id === factura.id)?.estado === "pagado", "la factura que había fallado queda pagada en el historial");
    void s;
  },

  async subir() {
    const antes = (await pagos()).length;
    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin/modulos`);
      await page.getByRole("radio", { name: /Completo/ }).click();
      await page.getByText(/Se aplica hoy/).waitFor();
      await page.getByRole("button", { name: "Cambiar a este plan" }).click();
      await page.getByText(/tu plan cambió hoy/).waitFor({ timeout: 60_000 });
    } finally {
      await n.close();
    }
    const n2 = await negocio();
    ok(n2.plan_id === (await planId("completo")), "el plan cambia al instante a Completo");
    const mods = exigir(await (await sesionAdmin()).rpc("modulos_activos"), "módulos");
    ok(mods.includes("empleados") && mods.includes("inventario"), "se desbloquean empleados e inventario");
    const p = await hasta(async () => { const x = await pagos(); return x.length > antes ? x : null; }, "la diferencia prorrateada se cobra hoy");
    const prorrateo = p[p.length - 1];
    ok(prorrateo.estado === "pagado" && prorrateo.monto_centavos > 0 && prorrateo.monto_centavos < 139084 + 17284, `prorrateo cobrado: $${prorrateo.monto_centavos / 100}`);
    ok((await suscripcion()).monto_centavos === 139084 + 17284, "de aquí en adelante: Completo + web = $1,563.68 con IVA");
  },

  async bajar() {
    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin/modulos`);
      await page.getByRole("radio", { name: /^Estética/ }).click();
      await page.getByText(/Con este cambio se apagan/).waitFor({ timeout: 30_000 });
      ok(await page.getByText(/Guardería/).first().isVisible(), "antes de bajar avisa qué módulos se apagan");
      await page.getByRole("button", { name: "Cambiar a este plan" }).click();
      await page.getByText(/se aplica al terminar tu periodo pagado/).waitFor({ timeout: 60_000 });
    } finally {
      await n.close();
    }
    const s = await suscripcion();
    ok(s.cambio_programado?.plan === "estetica", "queda programado el cambio a Estética");
    ok((await negocio()).plan_id === (await planId("completo")), "mientras tanto sigue en Completo");
    await avanzarReloj((await finDePeriodo()) - (await stripe.testHelpers.testClocks.retrieve(est.reloj)).frozen_time + 2 * 3600, "fin del periodo");
    await hasta(async () => (await negocio()).plan_id === (await planId("estetica")), "al siguiente periodo pasa a Estética");
    const mods = exigir(await (await sesionAdmin()).rpc("modulos_activos"), "módulos");
    ok(!mods.includes("hotel") && !mods.includes("empleados") && mods.includes("estetica"), "hotel y empleados se apagan con las reglas de siempre");
    ok(!(await suscripcion()).cambio_programado, "ya no hay cambio programado");
    ok((await suscripcion()).monto_centavos === 52084 + 17284, "ahora paga Estética + web: $693.68");
  },

  async cancelacion() {
    // El portal de Stripe existe y abre para este cliente (la cancelación del
    // portal es cancel_at_period_end: lo mismo que se hace aquí por la API).
    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin/modulos`);
      await page.getByRole("button", { name: "Tarjeta, facturas y cancelación" }).click();
      await page.waitForURL(/billing\.stripe\.com/, { timeout: 60_000 });
      ok(true, "abre el portal de Stripe de PeluDesk");
    } finally {
      await n.close();
    }
    await stripe.subscriptions.update(est.suscripcion, { cancel_at_period_end: true });
    await hasta(async () => (await suscripcion())?.cancela_al_terminar, "la cancelación llega por el webhook");
    ok((await estadoCobro()) === "al_corriente" && (await puedeEscribir()), "sigue activo hasta el fin del periodo pagado");
    await avanzarReloj((await finDePeriodo()) - (await stripe.testHelpers.testClocks.retrieve(est.reloj)).frozen_time + 3600, "fin del periodo pagado");
    await hasta(async () => (await suscripcion())?.estado_stripe === "canceled", "Stripe la cierra");
    ok((await estadoCobro()) === "cancelado", "estado: cancelado");
    ok(!(await puedeEscribir()), "queda en solo lectura");
  },

  async recontratar() {
    ok((await estadoCobro()) === "cancelado", "viene de cancelado");
    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin/modulos`);
      await page.getByRole("radio", { name: /^Estética/ }).click();
      await page.getByRole("radio", { name: "Anual · 2 meses gratis", exact: true }).click();
      await page.getByRole("checkbox").check();
      await page.getByText(/Se cobra hoy/).waitFor();
      await page.getByRole("button", { name: "Pagar con tarjeta" }).click();
      await pagarEnCheckout(page);
      await page.waitForURL(/\/admin\/modulos\?pago=ok/, { timeout: 90_000 });
    } finally {
      await n.close();
    }
    await hasta(async () => (await estadoCobro()) === "al_corriente", "se reactiva al pagar");
    const s = await suscripcion();
    ok(s.periodicidad === "anual" && s.monto_centavos === 520840 + 172840, "Estética anual + web: 10 meses, $6,936.80 con IVA");
    est.suscripcion = s.stripe_subscription_id;
    guardar();
    ok(await puedeEscribir(), "vuelve a poder guardar");
  },

  async "subir-sin-pagar"() {
    const antes = { neg: JSON.stringify(await negocio()), sub: (await stripe.subscriptions.retrieve(est.suscripcion)).items.data.map((i) => i.price.id).sort().join() };
    const pm = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: est.cliente });
    await stripe.customers.update(est.cliente, { invoice_settings: { default_payment_method: pm.id } });
    await stripe.subscriptions.update(est.suscripcion, { default_payment_method: pm.id });
    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin/modulos`);
      await page.getByRole("radio", { name: /Completo/ }).click();
      await page.getByRole("button", { name: "Cambiar a este plan" }).click();
      await page.getByText(/El banco rechazó la tarjeta/).waitFor({ timeout: 60_000 });
      ok(true, "la pantalla dice que el banco rechazó la tarjeta");
    } finally {
      await n.close();
    }
    await espera(8000);
    const despues = { neg: JSON.stringify(await negocio()), sub: (await stripe.subscriptions.retrieve(est.suscripcion)).items.data.map((i) => i.price.id).sort().join() };
    ok(despues.sub === antes.sub, "en Stripe la suscripción sigue con el mismo plan");
    ok(despues.neg === antes.neg, "en la base el negocio sigue con el mismo plan");
    ok((await estadoCobro()) === "al_corriente", "y sigue al corriente");
    // Deja la tarjeta buena otra vez.
    const buena = await stripe.paymentMethods.attach("pm_card_visa", { customer: est.cliente });
    await stripe.customers.update(est.cliente, { invoice_settings: { default_payment_method: buena.id } });
    await stripe.subscriptions.update(est.suscripcion, { default_payment_method: buena.id });
  },

  async plataforma() {
    const { data: pa } = await A.from("plataforma_admins").select("profile_id").limit(1).single();
    const { data: u } = await A.auth.admin.getUserById(pa.profile_id);
    const pw = `Plataforma-${Date.now()}`;
    exigir(await A.auth.admin.updateUserById(pa.profile_id, { password: pw }), "contraseña de la cuenta de plataforma de desarrollo");
    const { n, page } = await navegador();
    try {
      await page.goto(`${PLATAFORMA}/plataforma/entrar`);
      await page.getByLabel("Correo").fill(u.user.email);
      await page.getByLabel("Contraseña", { exact: true }).fill(pw);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.waitForURL(/\/plataforma$/, { timeout: 60_000 });
      await page.goto(`${PLATAFORMA}/plataforma/cobro`);
      const fila = page.locator("tr", { has: page.getByText(est.slug) });
      await fila.waitFor({ timeout: 30_000 });
      ok(await fila.getByText("Al corriente").isVisible(), "el negocio aparece «Al corriente»");
      const ludo = page.locator("tr", { has: page.getByText("ludogteka", { exact: true }) });
      ok(await ludo.getByText("Fuera del cobro").isVisible(), "Ludogteka: fuera del cobro");
      const mrr = await page.locator("div", { has: page.getByText("Ingreso mensual recurrente") }).last().innerText();
      ok(/\$[1-9]/.test(mrr), `ingreso mensual recurrente: ${mrr.replace(/\s+/g, " ")}`);
      await fila.getByRole("link").first().click();
      await page.getByText("Historial de pagos").waitFor({ timeout: 30_000 });
      const pagados = await page.getByText(/pagado el/).count();
      ok(pagados >= 3, `historial de pagos del negocio: ${pagados} pagos`);
    } finally {
      await n.close();
    }
  },
};

if (!ESCENARIOS[escenario]) {
  console.log(`Escenarios: ${Object.keys(ESCENARIOS).join(", ")}`);
  process.exit(2);
}
if (escenario !== "precios" && escenario !== "alta" && !est.negocio) throw new Error("Corre primero «alta».");
console.log(`── ${escenario}${est.slug ? ` (${est.slug})` : ""}`);
try {
  await ESCENARIOS[escenario]();
  console.log("  listo");
} catch (e) {
  console.error(`\n✘ ${e.message}`);
  process.exit(1);
}
