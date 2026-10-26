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
//   alta          negocio en prueba contrata el plan único ($649 + IVA) mensual
//                 desde «Módulos y plan»: no se cobra hoy, sigue en prueba
//   renovacion    termina la prueba (primer cobro) y se renueva un mes
//   facturacion   captura sus datos de facturación (se guardan en el cliente de Stripe) y el siguiente pago
//                 queda en «Facturas por emitir» de la plataforma, que la marca emitida
//   sucursal      abre una sucursal desde «Módulos y plan»: la suscripción suma «Sucursal adicional»
//                 ($325 + IVA) con cobro proporcional hoy; la sucursal hereda el estado de cobro, sale
//                 junto a la primera en «Tus negocios» y se entra a ella sin volver a escribir la contraseña
//   fallo         la tarjeta falla al renovar: gracia, aviso y recordatorio
//   solo-lectura  al día 8 de gracia el negocio queda en solo lectura
//   reactivacion  paga la factura pendiente y se reactiva solo
//   subir, bajar, subir-sin-pagar  RETIRADOS (22 de octubre de 2026): con el plan único no hay a qué plan subir ni bajar
//   cancelacion   cancela (portal): sigue hasta fin de periodo y luego cancelado
//   recontratar   un negocio cancelado vuelve a contratar y se reactiva
//   subir-sin-pagar  con una tarjeta que el banco rechaza, subir de plan no
//                 cambia nada (ni en Stripe ni en la base)
//   baja-sucursal (QA S17) desde «Módulos y plan» → Sucursales da de baja la sucursal: queda en solo lectura
//                 90 días, sale de «Tus negocios», «Sucursal adicional» baja en uno en Stripe (la parte
//                 proporcional a favor), la primera no tiene «Dar de baja» y la base no la suspende con
//                 sucursales activas. Después de «recontratar» (con la sucursal abierta).
//   plataforma    /plataforma/cobro: estado, historial de pagos e ingreso
//                 mensual recurrente
//   limpiar       AL TERMINAR la serie (o si se abandona a medias): borra el negocio, su sucursal,
//                 las cuentas que quedan sin negocio y el reloj de prueba de Stripe (con su cliente
//                 y su suscripción de modo prueba), y el estado guardado. Ninguna auditoría deja
//                 negocios en desarrollo.
//
// Sale con 1 al primer paso que falle. El estado entre escenarios se guarda
// en la carpeta temporal del sistema (nada de secretos).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { claveAleatoria } from "../lib/clave.mjs";

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
// estado_cobro_en es de peludesk_definer (solo ve el negocio de la petición): se llama con el encabezado del negocio.
const estadoCobro = async () => {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": est.negocio } } });
  return exigir(await c.rpc("estado_cobro_en", { p_negocio_id: est.negocio }), "estado_cobro_en");
};
const suscripcion = async () => (await A.from("suscripciones").select("*").eq("negocio_id", est.negocio).is("deleted_at", null).maybeSingle()).data;
const negocio = async () => (await A.from("negocios").select("plan, plan_id, complementos, prueba_termina_at").eq("id", est.negocio).single()).data;
const planId = async (clave) => (await A.from("planes").select("id").eq("clave", clave).is("deleted_at", null).single()).data.id;
const conNegocio = (id) => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": id } } });
const estadoCobroDe = async (id) => exigir(await conNegocio(id).rpc("estado_cobro_en", { p_negocio_id: id }), "estado_cobro_en");
const facturasPorEmitir = async () => (await A.from("facturas_peludesk_por_emitir").select("*").eq("negocio_afectado", est.negocio).is("deleted_at", null).order("created_at")).data ?? [];
const pagos = async () => (await A.from("pagos_suscripcion").select("*").eq("negocio_id", est.negocio).order("created_at")).data ?? [];

async function sesionAdmin(negocioId = est.negocio) {
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: est.email });
  const { data: s, error } = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}`, "x-negocio-id": negocioId } } });
}
// ¿El admin puede escribir? (una escritura inofensiva que la base rechaza en solo lectura)
async function puedeEscribir(negocioId = est.negocio) {
  const adm = await sesionAdmin(negocioId);
  const r = await adm.from("clientes").insert({ nombre: "Prueba escritura", telefono: `44209${String(Date.now()).slice(-5)}` }).select("id");
  if (!r.error) {
    await conNegocio(negocioId).from("clientes").delete().eq("id", r.data[0].id).eq("negocio_id", negocioId);
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
  // QA S36: el login separa «Soy cliente» y «Soy del equipo».
  await page.locator('[data-entrar-como="equipo"]').click();
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

async function entrarPlataforma(page) {
  const { data: pa } = await A.from("plataforma_admins").select("profile_id").limit(1).single();
  const { data: u } = await A.auth.admin.getUserById(pa.profile_id);
  const pw = claveAleatoria();
  exigir(await A.auth.admin.updateUserById(pa.profile_id, { password: pw }), "contraseña de la cuenta de plataforma de desarrollo");
  await page.goto(`${PLATAFORMA}/plataforma/entrar`);
  await page.getByLabel("Correo").fill(u.user.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(pw);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/plataforma$/, { timeout: 60_000 });
}

// ── Escenarios ──
const ESCENARIOS = {
  async precios() {
    const { data: pa } = await A.from("plataforma_admins").select("profile_id").limit(1).single();
    const { data: u } = await A.auth.admin.getUserById(pa.profile_id);
    const pw = claveAleatoria();
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
      // Cambiar el precio del plan PeluDesk (el único activo) crea un precio nuevo; el anterior no se toca.
      // El plan se deja SIEMPRE como estaba, pase lo que pase (también si un paso falla).
      const LK = "peludesk_completo_mensual";
      const original = Number((await A.from("planes").select("precio_mensual").eq("clave", "completo").single()).data.precio_mensual);
      const nuevoPrecio = original + 40;
      const totalNuevo = Math.round(nuevoPrecio * 100 * 1.16);
      const antes = (await stripe.prices.list({ lookup_keys: [LK], limit: 1 })).data[0];
      const seccion = page.locator("section", { has: page.getByRole("heading", { name: /^PeluDesk/ }) });
      try {
        await seccion.getByLabel("Precio mensual (sin IVA)").fill(String(nuevoPrecio));
        await seccion.getByRole("button", { name: "Guardar plan" }).click();
        await seccion.getByText(/Plan guardado/).waitFor({ timeout: 60_000 });
        const despues = (await stripe.prices.list({ lookup_keys: [LK], limit: 1 })).data[0];
        const viejo = await stripe.prices.retrieve(antes.id);
        ok(despues.id !== antes.id && despues.unit_amount === totalNuevo, `${nuevoPrecio} + IVA: precio NUEVO de $${totalNuevo / 100} con la lookup key`);
        ok(viejo.unit_amount === antes.unit_amount && viejo.active, "el precio anterior sigue igual y activo (quien ya pagaba, sigue pagando eso)");
        const anual = (await A.from("planes").select("precio_anual").eq("clave", "completo").single()).data;
        ok(Number(anual.precio_anual) === nuevoPrecio * 10, "el anual lo calcula la base: 10 mensualidades");
      } finally {
        await seccion.getByLabel("Precio mensual (sin IVA)").fill(String(original));
        await seccion.getByRole("button", { name: "Guardar plan" }).click();
        await seccion.getByText(/Plan guardado/).waitFor({ timeout: 60_000 });
      }
      const vuelta = (await stripe.prices.list({ lookup_keys: [LK], limit: 1 })).data[0];
      ok(vuelta.unit_amount === Math.round(original * 100 * 1.16), `de regreso a ${original}: la lookup key apunta a un precio de $${Math.round(original * 100 * 1.16) / 100}`);
      const filas = (await A.from("planes_precios_stripe").select("stripe_price_id").eq("vigente", true).eq("lookup_key", LK)).data;
      ok(filas.length === 1 && filas[0].stripe_price_id === vuelta.id, "planes_precios_stripe: un solo precio vigente, el de Stripe");
      // Idempotente: sincronizar otra vez no crea nada.
      const cuantos = (await stripe.prices.list({ lookup_keys: ["peludesk_completo_mensual", "peludesk_completo_anual"], limit: 10 })).data.map((p) => p.id).sort().join();
      await page.getByRole("button", { name: "Sincronizar todos con Stripe" }).click();
      await page.getByText(/Stripe ya tenía esos precios/).first().waitFor({ timeout: 90_000 });
      const otraVez = (await stripe.prices.list({ lookup_keys: ["peludesk_completo_mensual", "peludesk_completo_anual"], limit: 10 })).data.map((p) => p.id).sort().join();
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
    exigir(await A.from("negocios").update({ plan: "prueba", prueba_termina_at: new Date(Date.now() + 10 * 86_400_000).toISOString(), plan_id: await planId("completo") }).eq("id", id), "ponerlo en prueba");
    const email = `admin-${sufijo}@cobro.prueba`;
    const password = claveAleatoria();
    // Con nombre: una cuenta del personal sin nombre lo tiene que escribir antes de ver cualquier pantalla (QA N24).
    const u = exigir(await A.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre_completo: `Admin Cobro ${sufijo}` } }), "cuenta admin").user;
    await A.from("profiles").update({ nombre_completo: `Admin Cobro ${sufijo}` }).eq("id", u.id);
    exigir(await A.rpc("agregar_admin_negocio", { p_negocio_id: id, p_profile_id: u.id }), "membresía admin");
    Object.assign(est, { negocio: id, slug, email, password, sucursal: null, factura: null });
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
      await page.getByRole("radio", { name: /PeluDesk/ }).click();
      await page.getByRole("radio", { name: "Mensual", exact: true }).click();
      // Plan único: $649 + IVA = $752.84; la cifra principal sin IVA, el total solo en el resumen.
      await page.getByText("$752.84 al mes").first().waitFor();
      ok(await page.getByText("Sin costo inicial · Todos los módulos").first().isVisible(), "dice «Sin costo inicial · Todos los módulos»");
      ok(await page.getByText("+ IVA").first().isVisible(), "los precios dicen «+ IVA» debajo");
      ok(await page.getByText(/No se te cobra hoy/).isVisible(), "el resumen dice que no se cobra hoy (sigue la prueba)");
      ok(await page.getByText(/El cobro aparece como MENTEO, la empresa que opera PeluDesk/).first().isVisible(), "Módulos y plan dice que el cobro aparece como MENTEO, junto a «Pagar con tarjeta»");
      const diasBanner = await page.getByText(/te quedan \d+ días?/).first().innerText();
      await page.getByRole("button", { name: "Pagar con tarjeta" }).click();
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      const cuerpo = await page.locator("body").innerText();
      ok(/No se te cobra hoy; el primer cobro es el \d{1,2} \w+/.test(cuerpo) && /Contratas PeluDesk/.test(cuerpo), "el Checkout dice «Contratas PeluDesk. No se te cobra hoy; el primer cobro es el <fecha>»");
      ok(/MENTEO, la empresa que opera PeluDesk/.test(cuerpo), "el Checkout dice que el cobro aparece como MENTEO");
      const diasStripe = Number((cuerpo.match(/(\d+)\s+d[ií]as?\s+gratis/i) ?? [])[1]);
      const diasAviso = Number((diasBanner.match(/(\d+)/) ?? [])[1]);
      ok(Number.isFinite(diasStripe) ? diasStripe === diasAviso : true, `Stripe y el aviso dicen los mismos días (${Number.isFinite(diasStripe) ? diasStripe : "Stripe no los muestra"} y ${diasAviso})`);
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
    // El primer cobro es el último día de la prueba (hasta su último segundo en la zona del negocio).
    const finEsperado = Date.parse(n2.prueba_termina_at);
    ok(Date.parse(s.prueba_hasta) >= finEsperado && Date.parse(s.prueba_hasta) - finEsperado < 25 * 3600_000, "y no antes de lo prometido ni más de un día después");
    ok(s.monto_centavos === 75284 && s.periodicidad === "mensual" && s.complementos.length === 0, "PeluDesk mensual: $649 + IVA = $752.84, sin complementos");
    ok(s.plan_id === (await planId("completo")), "el plan contratado es el plan único");
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
    ok(n1.plan === "activo" && n1.plan_id === (await planId("completo")) && n1.complementos.length === 0, "el negocio pasa a activo con el plan único");
    ok((await estadoCobro()) === "al_corriente", "estado: al corriente");
    const p1 = await hasta(async () => (await pagos()).filter((p) => p.estado === "pagado"), "el pago queda en el historial");
    ok(p1.length === 1 && p1[0].monto_centavos === 75284, "primer pago: $752.84");
    const filas = exigir(await (await sesionAdmin()).rpc("mis_modulos"), "módulos");
    const disponibles = filas.filter((m) => m.disponible).map((m) => m.clave);
    ok(["hotel", "empleados", "estetica", "veterinaria", "pagina_web"].every((m) => disponibles.includes(m)), "todos los módulos van incluidos (disponibles)");
    // Un mes después, se renueva solo.
    await avanzarReloj((await finDePeriodo()) - (await stripe.testHelpers.testClocks.retrieve(est.reloj)).frozen_time + 2 * 3600, "un mes después");
    const p2 = await hasta(async () => { const x = (await pagos()).filter((p) => p.estado === "pagado"); return x.length >= 2 ? x : null; }, "se cobra la renovación");
    const s2 = await suscripcion();
    ok(p2.length === 2 && Date.parse(s2.periodo_fin) > Date.parse(s1.periodo_fin), "renovado: nuevo periodo y segundo pago");
    ok((await estadoCobro()) === "al_corriente", "sigue al corriente");
  },

  async facturacion() {
    ok((await estadoCobro()) === "al_corriente", "viene al corriente (renovación)");
    const correo = `facturas-${est.slug}@cobro.prueba`;
    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin/modulos`);
      const seccion = page.locator("[data-datos-facturacion]");
      await seccion.waitFor({ timeout: 30_000 });
      ok(await seccion.getByText(/La factura \(CFDI\) la emite Menteo, S\.A\.S\./).isVisible(), "explica que la factura la emite Menteo, S.A.S. y llega por correo");
      await seccion.getByLabel("RFC").fill("NOESRFC");
      await seccion.getByLabel("Razón social o nombre").fill("ESCUELA KEMPER URGATE");
      await seccion.getByLabel("Régimen fiscal").selectOption("601");
      await seccion.getByLabel("Código postal fiscal").fill("26015");
      await seccion.getByLabel("Uso del CFDI").selectOption("G03");
      await seccion.getByLabel("Correo para recibir la factura").fill(correo);
      await seccion.getByRole("button", { name: "Guardar datos de facturación" }).click();
      await seccion.getByText(/El RFC tiene 12 caracteres/).waitFor({ timeout: 30_000 });
      ok(true, "un RFC mal escrito se rechaza junto al botón");
      await seccion.getByLabel("RFC").fill("eku9003173c9");
      await seccion.getByRole("button", { name: "Guardar datos de facturación" }).click();
      await seccion.getByText(/Guardado\. Con cada pago te llega la factura por correo/).waitFor({ timeout: 60_000 });
      ok(true, "guardado: «con cada pago te llega la factura por correo»");
      await page.reload();
      await page.locator("[data-datos-facturacion]").getByText(/a nombre de ESCUELA KEMPER URGATE \(EKU9003173C9\)/).waitFor({ timeout: 30_000 });
      ok(true, "al volver, dice a nombre de quién sale la factura");
    } finally {
      await n.close();
    }
    const cli = await stripe.customers.retrieve(est.cliente);
    ok(cli.metadata.peludesk_fact_rfc === "EKU9003173C9" && cli.metadata.peludesk_fact_regimen === "601" && cli.metadata.peludesk_fact_cp === "26015"
      && cli.metadata.peludesk_fact_uso_cfdi === "G03" && cli.metadata.peludesk_fact_correo === correo && cli.metadata.peludesk_fact_razon_social === "ESCUELA KEMPER URGATE",
      "Stripe: los datos quedan en la metadata del cliente");
    const tax = (await stripe.customers.listTaxIds(est.cliente)).data;
    ok(tax.some((t) => t.type === "mx_rfc" && t.value === "EKU9003173C9") && cli.address?.postal_code === "26015", "Stripe: el RFC como tax id (mx_rfc) y el código postal");
    // Nadie de un negocio lee la lista de la plataforma.
    const adm = await sesionAdmin();
    const visto = await adm.from("facturas_peludesk_por_emitir").select("id");
    ok(!visto.error && visto.data.length === 0, "el admin del negocio no ve «Facturas por emitir» (RLS)");
    const anon = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).from("facturas_peludesk_por_emitir").select("id");
    ok(Boolean(anon.error) || anon.data.length === 0, "la llave anónima no ve nada");
    const intento = await adm.from("facturas_peludesk_por_emitir").insert({ negocio_nombre: "x", modo: "test", stripe_invoice_id: "in_falsa", monto_centavos: 1, rfc: "X", razon_social: "X", regimen_fiscal: "601", codigo_postal: "00000", uso_cfdi: "G03", correo: "x@x.mx" });
    ok(Boolean(intento.error), "y nadie con sesión puede inventar una");

    const antes = (await facturasPorEmitir()).length;
    await avanzarReloj((await finDePeriodo()) - (await stripe.testHelpers.testClocks.retrieve(est.reloj)).frozen_time + 2 * 3600, "siguiente pago");
    const filas = await hasta(async () => { const x = await facturasPorEmitir(); return x.length > antes ? x : null; }, "el pago deja la factura por emitir");
    const f = filas[filas.length - 1];
    ok(f.estado === "por_emitir" && f.rfc === "EKU9003173C9" && f.correo === correo && f.monto_centavos === 75284 && f.modo === "test",
      `por emitir: ${f.razon_social}, $${f.monto_centavos / 100} con IVA, ${f.correo}`);
    ok((await pagos()).some((p) => p.stripe_invoice_id === f.stripe_invoice_id && p.estado === "pagado"), "es el mismo pago del historial");
    est.factura = f.stripe_invoice_id;
    guardar();

    const { n: n2, page: p2 } = await navegador();
    try {
      await entrarPlataforma(p2);
      ok(await p2.locator("[data-aviso-facturas-por-emitir]").isVisible(), "/plataforma avisa que hay facturas por emitir");
      await p2.goto(`${PLATAFORMA}/plataforma/facturas`);
      const tarjeta = p2.locator(`[data-factura-por-emitir="${f.stripe_invoice_id}"]`);
      await tarjeta.waitFor({ timeout: 30_000 });
      ok(await tarjeta.getByText("$752.84").first().isVisible(), "la tarea trae el monto con IVA");
      ok(await tarjeta.locator('input[value="EKU9003173C9"]').count() === 1, "y el RFC listo para copiar");
      await tarjeta.getByLabel("Folio fiscal (UUID), opcional").fill("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE");
      await tarjeta.getByRole("button", { name: "Marcar como emitida" }).click();
      // Resuelta: sale de «por emitir» y aparece en «Últimas resueltas» con su folio.
      await tarjeta.waitFor({ state: "detached", timeout: 30_000 });
      await p2.getByText(/AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE/).first().waitFor({ timeout: 30_000 });
    } finally {
      await n2.close();
    }
    const hecha = (await facturasPorEmitir()).find((x) => x.stripe_invoice_id === f.stripe_invoice_id);
    ok(hecha.estado === "emitida" && hecha.folio_fiscal === "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" && Boolean(hecha.emitida_por), "la plataforma la marca emitida, con folio y quién");
  },

  async sucursal() {
    ok((await estadoCobro()) === "al_corriente", "viene al corriente");
    const sufijo = String(Date.now()).slice(-5);
    const nombre = `Sucursal Norte ${sufijo}`;
    const slug = `sucursal-norte-${sufijo}`;
    const pagosAntes = (await pagos()).length;
    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin/modulos`);
      const seccion = page.locator("[data-sucursales]");
      await seccion.waitFor({ timeout: 30_000 });
      ok(await seccion.getByText("$325 + IVA al mes").isVisible(), "dice el precio de la sucursal adicional: $325 + IVA al mes (de la base)");
      ok(await seccion.getByText(/La prueba gratis es solo para la primera/).isVisible(), "y que la prueba gratis es solo para la primera");
      await seccion.getByLabel("Nombre de la sucursal").fill(nombre);
      ok((await seccion.getByLabel("Subdominio").inputValue()) === slug, `sugiere el subdominio ${slug}`);
      // Un subdominio ocupado no cobra nada.
      await seccion.getByLabel("Subdominio").fill(est.slug);
      await seccion.getByRole("button", { name: "Abrir sucursal" }).click();
      await seccion.getByText(/Ese subdominio ya está ocupado/).waitFor({ timeout: 60_000 });
      ok((await stripe.subscriptions.retrieve(est.suscripcion)).items.data.length === 1, "un subdominio ocupado: no se abre ni se cobra nada");
      await seccion.getByLabel("Subdominio").fill(slug);
      await seccion.getByRole("button", { name: "Abrir sucursal" }).click();
      await seccion.getByText(/tu sucursal quedó abierta/).waitFor({ timeout: 90_000 });
      ok(true, "«Abrir sucursal»: listo");
      const nueva = (await A.from("negocios").select("id, slug, plan, plan_id, principal_id, prueba_termina_at").eq("slug", slug).single()).data;
      ok(nueva.principal_id === est.negocio && nueva.plan === "activo" && !nueva.prueba_termina_at && nueva.plan_id === (await planId("completo")), "la sucursal es un negocio ligado a la primera, en el plan, sin prueba propia");
      est.sucursal = { id: nueva.id, slug };
      guardar();
      const { data: u } = await A.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const persona = u.users.find((x) => x.email === est.email);
      const m = (await A.from("membresias").select("rol").eq("negocio_id", nueva.id).eq("profile_id", persona.id).is("deleted_at", null)).data;
      ok(m.length === 1 && m[0].rol === "admin", "quien la abrió queda como admin de la sucursal");

      // «Tus negocios»: las dos juntas, y se entra a la sucursal sin volver a escribir la contraseña.
      await page.goto(`${base()}/admin`);
      const selector = page.locator("nav[aria-label='Secciones'] [data-selector-negocio]").first();
      await selector.waitFor({ timeout: 30_000 });
      const grupo = selector.locator(`[data-grupo-negocio="${est.negocio}"]`);
      ok(await grupo.getByText(/y sus sucursales/).isVisible() && await grupo.getByText(nombre).isVisible(), "«Tus negocios»: la sucursal sale junto a la primera");
      await grupo.locator(`[data-ir-negocio="${nueva.id}"]`).click();
      await page.waitForURL((url) => url.hostname.startsWith(`${slug}.`) && url.pathname === "/admin", { timeout: 60_000 });
      ok(true, "entra a la sucursal (su propio subdominio) sin contraseña");
      await page.goto(`http://${slug}.localhost:3001/admin/modulos`);
      await page.locator("[data-es-sucursal]").waitFor({ timeout: 30_000 });
      ok(await page.getByRole("button", { name: "Pagar con tarjeta" }).count() === 0 && await page.locator("[data-datos-facturacion]").count() === 0,
        "en la sucursal: se paga en la suscripción de la primera (sin contratar ni datos de facturación propios)");
    } finally {
      await n.close();
    }
    const sub = await stripe.subscriptions.retrieve(est.suscripcion, { expand: ["items.data.price.product"] });
    const item = sub.items.data.find((i) => i.price.lookup_key === "peludesk_sucursal_adicional_mensual");
    ok(item && item.quantity === 1 && item.price.unit_amount === 37700 && item.price.tax_behavior === "inclusive", "Stripe: concepto «Sucursal adicional» × 1 a $377 con IVA ($325 + IVA), mensual");
    ok(item.price.product.name === "PeluDesk · Sucursal adicional", `el producto en Stripe: «${item.price.product.name}»`);
    const prorrateo = await hasta(async () => { const x = (await pagos()).filter((p) => p.estado === "pagado"); return x.length > pagosAntes ? x[x.length - 1] : null; }, "se cobra hoy la parte proporcional");
    ok(prorrateo.monto_centavos > 0 && prorrateo.monto_centavos <= 37700, `parte proporcional cobrada hoy: $${prorrateo.monto_centavos / 100}`);
    await hasta(async () => (await suscripcion())?.monto_centavos === 75284 + 37700, "la suscripción vale $1,129.84 con IVA");
    ok((await estadoCobroDe(est.sucursal.id)) === "al_corriente", "la sucursal hereda el estado de cobro: al corriente");
    ok(await puedeEscribir(est.sucursal.id), "y en la sucursal se puede guardar");
    // Al renovar: plan + sucursal en una sola factura (y por emitir, con los datos de la primera).
    const antes = (await facturasPorEmitir()).length;
    await avanzarReloj((await finDePeriodo()) - (await stripe.testHelpers.testClocks.retrieve(est.reloj)).frozen_time + 2 * 3600, "renovación con sucursal");
    const filas = await hasta(async () => { const x = await facturasPorEmitir(); return x.length > antes ? x : null; }, "la renovación queda por emitir");
    const f = filas[filas.length - 1];
    ok(f.monto_centavos === 75284 + 37700 && /Sucursal adicional/.test(f.concepto ?? ""), `renovación: $${f.monto_centavos / 100} con «Sucursal adicional» en el concepto`);
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
    if (est.sucursal) {
      ok((await estadoCobroDe(est.sucursal.id)) === "solo_lectura" && !(await puedeEscribir(est.sucursal.id)), "la sucursal también queda en solo lectura");
    }
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
    if (est.sucursal) ok((await estadoCobroDe(est.sucursal.id)) === "al_corriente", "la sucursal también se reactiva");
    ok((await pagos()).find((p) => p.stripe_invoice_id === factura.id)?.estado === "pagado", "la factura que había fallado queda pagada en el historial");
    void s;
  },

  async subir() {
    console.log("  (retirado: con el plan único ya no hay planes entre los que subir o bajar)");
    return;
    // eslint-disable-next-line no-unreachable
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
    console.log("  (retirado: con el plan único ya no hay planes entre los que subir o bajar)");
    return;
    // eslint-disable-next-line no-unreachable
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
    if (est.sucursal) ok((await estadoCobroDe(est.sucursal.id)) === "cancelado", "la sucursal también");
    ok(!(await puedeEscribir()), "queda en solo lectura");
  },

  async recontratar() {
    ok((await estadoCobro()) === "cancelado", "viene de cancelado");
    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin/modulos`);
      await page.getByRole("radio", { name: /PeluDesk/ }).click();
      await page.getByRole("radio", { name: "Anual · 2 meses gratis", exact: true }).click();
      await page.getByText(/Se cobra hoy/).waitFor();
      ok(await page.getByText(/El cobro aparece como MENTEO, la empresa que opera PeluDesk/).first().isVisible(), "Módulos y plan dice que el cobro aparece como MENTEO, junto a «Pagar con tarjeta»");
      await page.getByRole("button", { name: "Pagar con tarjeta" }).click();
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      const cuerpo = await page.locator("body").innerText();
      // Sin prueba: se cobra hoy (y, con sucursal, el Checkout trae su concepto).
      ok(/Contratas PeluDesk\. Se cobra hoy\./.test(cuerpo), "el Checkout dice «Contratas PeluDesk. Se cobra hoy.»");
      if (est.sucursal) ok(/Sucursal adicional/.test(cuerpo), "y trae el concepto «Sucursal adicional»");
      ok(/MENTEO, la empresa que opera PeluDesk/.test(cuerpo), "el Checkout dice que el cobro aparece como MENTEO");
      await pagarEnCheckout(page);
      await page.waitForURL(/\/admin\/modulos\?pago=ok/, { timeout: 90_000 });
    } finally {
      await n.close();
    }
    await hasta(async () => (await estadoCobro()) === "al_corriente", "se reactiva al pagar");
    const s = await suscripcion();
    if (est.sucursal) {
      ok(s.periodicidad === "anual" && s.monto_centavos === 752840 + 377000, "PeluDesk anual + su sucursal: $7,528.40 + $3,770 con IVA (la sucursal vuelve a la suscripción)");
      ok((await estadoCobroDe(est.sucursal.id)) === "al_corriente", "la sucursal se reactiva con la primera");
    } else {
      ok(s.periodicidad === "anual" && s.monto_centavos === 752840, "PeluDesk anual: 10 meses, $7,528.40 con IVA");
    }
    est.suscripcion = s.stripe_subscription_id;
    guardar();
    ok(await puedeEscribir(), "vuelve a poder guardar");
  },

  async "subir-sin-pagar"() {
    console.log("  (retirado: con el plan único ya no hay planes entre los que subir o bajar)");
    return;
    // eslint-disable-next-line no-unreachable
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

  async "baja-sucursal"() {
    if (!est.sucursal) throw new Error("Corre primero «sucursal».");
    ok((await estadoCobro()) === "al_corriente", "viene al corriente");
    // La primera no se suspende con sucursales activas.
    const susp = await A.from("negocios").update({ activo: false }).eq("id", est.negocio);
    ok(Boolean(susp.error) && /sucursales activas/.test(susp.error.message), "la primera no se suspende mientras tenga sucursales activas");
    const subAntes = await stripe.subscriptions.retrieve(est.suscripcion, { expand: ["items.data.price"] });
    const itemAntes = subAntes.items.data.find((i) => (i.price.lookup_key ?? "").startsWith("peludesk_sucursal_adicional_"));
    ok(itemAntes?.quantity === 1, "Stripe trae «Sucursal adicional» × 1");
    const { n, page } = await navegador();
    try {
      await entrarComoAdmin(page);
      await page.goto(`${base()}/admin/modulos`);
      const seccion = page.locator("[data-sucursales]");
      await seccion.waitFor({ timeout: 30_000 });
      ok((await seccion.locator(`[data-dar-baja-sucursal="${est.negocio}"]`).count()) === 0, "la primera no tiene «Dar de baja»");
      await seccion.locator(`[data-dar-baja-sucursal="${est.sucursal.id}"]`).click();
      const conf = seccion.locator("[data-confirmar-baja-sucursal]");
      await conf.getByLabel("Motivo (obligatorio)").fill("Cerramos esa sucursal (prueba)");
      await conf.getByRole("button", { name: "Dar de baja la sucursal" }).click();
      await seccion.getByText(/quedó dada de baja/).waitFor({ timeout: 90_000 });
      const marca = await seccion.locator(`[data-sucursal-baja="${est.sucursal.id}"]`).waitFor({ timeout: 30_000 }).then(() => true, () => false);
      ok(marca, "la lista la enseña «Dada de baja · solo lectura hasta …»");
      // «Tus negocios»: ya no sale.
      await page.goto(`${base()}/admin`);
      ok((await page.locator(`[data-ir-negocio="${est.sucursal.id}"]`).count()) === 0, "sale de «Tus negocios»");
    } finally {
      await n.close();
    }
    const fila = (await A.from("negocios").select("sucursal_baja_at, sucursal_baja_hasta, activo").eq("id", est.sucursal.id).single()).data;
    const dias = Math.round((new Date(fila.sucursal_baja_hasta) - new Date(fila.sucursal_baja_at)) / 86_400_000);
    ok(fila.sucursal_baja_at && dias === 90 && fila.activo, "queda dada de baja con 90 días de consulta (sigue existiendo)");
    ok(!(await puedeEscribir(est.sucursal.id)), "en la sucursal ya no se puede guardar (solo lectura)");
    ok(await puedeEscribir(est.negocio), "la primera sigue escribiendo");
    const subDespues = await stripe.subscriptions.retrieve(est.suscripcion, { expand: ["items.data.price"] });
    ok(!subDespues.items.data.some((i) => (i.price.lookup_key ?? "").startsWith("peludesk_sucursal_adicional_")), "Stripe: «Sucursal adicional» bajó a cero (el concepto sale de la suscripción)");
    const pendientes = await stripe.invoiceItems.list({ customer: est.cliente, pending: true, limit: 20 });
    ok(pendientes.data.some((i) => i.amount < 0 && /Sucursal adicional|Unused time/i.test(i.description ?? "")), "la parte proporcional queda a favor (crédito para el siguiente cobro)");
    // Ya sin sucursales activas, la primera sí se podría suspender (no se hace: se deja como está).
  },

  async plataforma() {
    const { data: pa } = await A.from("plataforma_admins").select("profile_id").limit(1).single();
    const { data: u } = await A.auth.admin.getUserById(pa.profile_id);
    const pw = claveAleatoria();
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
      console.log("  fila:", (await fila.first().innerText()).replace(/\s+/g, " "));
      ok(await fila.first().getByText("Al corriente").first().isVisible(), "el negocio aparece «Al corriente»");
      const ludo = page.locator("tr", { has: page.getByText("ludogteka", { exact: true }) });
      ok(await ludo.getByText("Fuera del cobro").isVisible(), "Ludogteka: fuera del cobro");
      const mrr = await page.locator("div", { has: page.getByText("Ingreso mensual recurrente") }).last().innerText();
      ok(/\$[1-9]/.test(mrr), `ingreso mensual recurrente: ${mrr.replace(/\s+/g, " ")}`);
      await fila.getByRole("link").first().click();
      await page.getByText("Historial de pagos").waitFor({ timeout: 30_000 });
      const pagados = await page.getByText(/pagado el/).count();
      ok(pagados >= 2, `historial de pagos del negocio: ${pagados} pagos`);
    } finally {
      await n.close();
    }
  },
  async limpiar() {
    const { limpiarCorrida } = await import("../lib/limpieza-dev.mjs");
    const { data: n } = await A.from("negocios").select("created_at").eq("id", est.negocio).maybeSingle();
    const sufijo = String(est.slug ?? "").replace(/^cobro-/, "");
    await limpiarCorrida({ desde: new Date(n?.created_at ?? Date.now()), prefijos: [`cobro-${sufijo}`, `sucursal-norte-${sufijo}`] });
    if (est.reloj) {
      try { await stripe.testHelpers.testClocks.del(est.reloj); console.log("  · reloj de prueba de Stripe borrado (con su cliente y su suscripción)"); } catch (e) { console.log(`  · el reloj de Stripe no se pudo borrar: ${e.message}`); }
    }
    fs.rmSync(ESTADO, { force: true });
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
