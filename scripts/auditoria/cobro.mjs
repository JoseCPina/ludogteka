// Uso: STRIPE_WEBHOOK_SECRET=<el del servidor> node scripts/auditoria/cobro.mjs   (SOLO DESARROLLO)
//
// El cobro de la suscripción, del lado de quien quiere hacer trampa. Con JWT
// reales (admin, recepción y cliente de un negocio A; admin de un negocio B)
// y la llave anónima, contra la base; y contra el webhook y la página de
// regreso del Checkout del servidor de desarrollo (next dev en el 3001):
//   · un negocio no puede marcarse pagado: ni escribir su suscripción ni su
//     historial de pagos, ni llamar cobro_aplicar / cobro_registrar_pago, ni
//     cambiar su plan, su prueba o salirse del cobro en `negocios`;
//   · no puede cambiarse el plan sin pagar (lo mismo, más el webhook: aun
//     firmado, un evento inventado no cambia nada porque se le pregunta a
//     Stripe);
//   · no puede ver ni tocar la suscripción de otro negocio (con su encabezado
//     o suplantando el de B), ni aplicar el pago de otro en la página de
//     regreso;
//   · recepción y el cliente no ven la suscripción ni montos; nadie del
//     negocio ve los precios de Stripe ni los eventos del webhook;
//   · el webhook rechaza sin firma, con firma de otro secreto, vieja o con el
//     cuerpo cambiado; es idempotente; ignora (sin guardar) lo que no es de
//     PeluDesk.
// Sale con 1 si algo que debía rechazarse pasó.
import fs from "node:fs";
import http from "node:http";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const LLAVE = process.env.STRIPE_SECRET_KEY;
if (!LLAVE?.startsWith("sk_test_")) throw new Error("Hace falta STRIPE_SECRET_KEY de MODO PRUEBA.");
const SECRETO = process.env.STRIPE_WEBHOOK_SECRET;
if (!SECRETO) throw new Error("Hace falta STRIPE_WEBHOOK_SECRET (el mismo con el que corre el servidor de desarrollo).");
const stripe = new Stripe(LLAVE, { apiVersion: "2026-08-26.dahlia" });
const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };
const A = createClient(URL, env.SUPABASE_SECRET_KEY, sinSesion);

let hallazgos = 0;
const bien = (que) => console.log(`  ✔ ${que}`);
const mal = (que) => { hallazgos++; console.log(`  ✘ ${que}`); };
const exigir = (r, que) => { if (r.error) throw new Error(`${que}: ${r.error.message}`); return r.data; };
const rechazada = (r) => Boolean(r.error) || (Array.isArray(r.data) && r.data.length === 0);
const veredicto = (cond, siBien, siMal) => (cond ? bien(siBien) : mal(siMal));
const debeRechazar = (r, que) => veredicto(rechazada(r), `${que}${r.error ? ` — ${r.error.message}` : " — 0 filas"}`, `${que}: PASÓ`);

// ── Dos negocios en prueba, con su gente ──
async function negocio(slug, nombre) {
  let { data: n } = await A.from("negocios").select("id").eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (!n) n = { id: exigir(await A.rpc("crear_negocio", { p_slug: slug, p_nombre: nombre, p_zona_horaria: "America/Mexico_City", p_ciudad: "Querétaro", p_dominio: null }), `crear ${slug}`) };
  exigir(await A.from("negocios").update({ plan: "prueba", prueba_termina_at: new Date(Date.now() + 10 * 86_400_000).toISOString(), cobro_exento: false }).eq("id", n.id), "en prueba");
  return n.id;
}
async function cuenta(email) {
  const { data: ya } = await A.rpc("usuario_por_email", { p_email: email });
  if (ya) return ya;
  return exigir(await A.auth.admin.createUser({ email, password: `Prueba-${crypto.randomUUID()}`, email_confirm: true }), email).user.id;
}
async function miembro(negocioId, email, rol, clienteId = null) {
  const id = await cuenta(email);
  const { data: m } = await A.from("membresias").select("id").eq("negocio_id", negocioId).eq("profile_id", id).is("deleted_at", null).maybeSingle();
  if (!m) {
    if (rol === "admin") exigir(await A.rpc("agregar_admin_negocio", { p_negocio_id: negocioId, p_profile_id: id }), "admin");
    else exigir(await A.from("membresias").insert({ negocio_id: negocioId, profile_id: id, rol, cliente_id: clienteId }), `membresía ${rol}`);
  }
  return id;
}
async function como(id, negocioId) {
  const { data: u } = await A.auth.admin.getUserById(id);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const { data: s } = await createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, sinSesion).auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  const hacia = (n) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { ...sinSesion, global: { headers: { Authorization: `Bearer ${s.session.access_token}`, "x-negocio-id": n } } });
  return { propio: hacia(negocioId), hacia };
}

const NA = await negocio("cobro-auditoria-a", "Cobro Auditoría A");
const NB = await negocio("cobro-auditoria-b", "Cobro Auditoría B");
const SA = createClient(URL, env.SUPABASE_SECRET_KEY, { ...sinSesion, global: { headers: { "x-negocio-id": NA } } });
let { data: cli } = await SA.from("clientes").select("id").eq("negocio_id", NA).limit(1).maybeSingle();
if (!cli) cli = exigir(await SA.from("clientes").insert({ negocio_id: NA, nombre: "Cliente Cobro", telefono: "4420980001" }).select("id").single(), "cliente");
const admA = await como(await miembro(NA, "admin@cobro-a.prueba", "admin"), NA);
const recA = await como(await miembro(NA, "recepcion@cobro-a.prueba", "recepcion"), NA);
const cliA = await como(await miembro(NA, "cliente@cobro-a.prueba", "cliente", cli.id), NA);
await miembro(NB, "admin@cobro-b.prueba", "admin");
const ANON = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { ...sinSesion, global: { headers: { "x-negocio-id": NA } } });

// Una suscripción de B en la base (como la dejaría el webhook) para intentar alcanzarla.
exigir(await A.rpc("cobro_aplicar", { p_negocio_id: NB, p: { modo: "test", customer: "cus_auditoria_b", subscription: "sub_auditoria_b", estado_stripe: "past_due", plan_clave: "estetica", periodicidad: "mensual", complementos: [], monto_centavos: 52084, fallo_at: new Date().toISOString() } }), "suscripción de B");
const estadoB = async () => exigir(await A.rpc("estado_cobro_en", { p_negocio_id: NB }), "estado B");
const antesB = await estadoB();
const huellaB = async () => JSON.stringify((await A.from("suscripciones").select("*").eq("negocio_id", NB).single()).data) + JSON.stringify((await A.from("negocios").select("plan, plan_id, complementos, prueba_termina_at, cobro_exento").eq("id", NB).single()).data);
const huellaInicialB = await huellaB();
const planCompleto = (await A.from("planes").select("id").eq("clave", "completo").single()).data.id;
// Un plan DISTINTO al que tiene A (nace en Completo): si fuera el mismo, el UPDATE no cambiaría nada.
const planAjeno = (await A.from("planes").select("id").eq("clave", "estetica").single()).data.id;
const ahora = new Date().toISOString();

try {
  console.log("── El admin de A no se marca pagado ni se cambia el plan");
  const adm = admA.propio;
  debeRechazar(await adm.from("suscripciones").insert({ negocio_id: NA, modo: "test", estado_stripe: "active", plan_id: planCompleto }).select("id"), "crearse una suscripción activa");
  exigir(await A.rpc("cobro_aplicar", { p_negocio_id: NA, p: { modo: "test", customer: "cus_auditoria_a" } }), "cliente de A");
  debeRechazar(await adm.from("suscripciones").update({ estado_stripe: "active", primer_fallo_at: null, periodo_fin: "2099-01-01T00:00:00Z" }).eq("negocio_id", NA).select("id"), "marcar su suscripción como pagada");
  debeRechazar(await adm.from("suscripciones").delete().eq("negocio_id", NA).select("id"), "borrar su suscripción");
  debeRechazar(await adm.from("pagos_suscripcion").insert({ negocio_id: NA, modo: "test", stripe_invoice_id: "in_falsa", estado: "pagado", monto_centavos: 115768, pagado_at: ahora }).select("id"), "registrarse un pago");
  debeRechazar(await adm.rpc("cobro_aplicar", { p_negocio_id: NA, p: { modo: "test", subscription: "sub_falsa", estado_stripe: "active", plan_clave: "completo", periodicidad: "anual", complementos: ["pagina_web"] } }), "llamar cobro_aplicar");
  debeRechazar(await adm.rpc("cobro_registrar_pago", { p_negocio_id: NA, p: { modo: "test", invoice: "in_falsa", estado: "pagado", monto_centavos: 1 } }), "llamar cobro_registrar_pago");
  debeRechazar(await adm.from("negocios").update({ plan: "activo", prueba_termina_at: null }).eq("id", NA).select("id"), "pasarse a activo");
  debeRechazar(await adm.from("negocios").update({ prueba_termina_at: "2099-01-01T00:00:00Z" }).eq("id", NA).select("id"), "alargarse la prueba");
  const planDeA = (await A.from("negocios").select("plan_id").eq("id", NA).single()).data.plan_id;
  debeRechazar(await adm.from("negocios").update({ plan_id: planDeA === planAjeno ? planCompleto : planAjeno }).eq("id", NA).select("id"), "cambiarse de plan");
  debeRechazar(await adm.from("negocios").update({ complementos: ["pagina_web"] }).eq("id", NA).select("id"), "darse la página web");
  debeRechazar(await adm.from("negocios").update({ cobro_exento: true }).eq("id", NA).select("id"), "salirse del cobro");
  debeRechazar(await adm.rpc("plataforma_cambiar_plan", { p_negocio_id: NA, p_plan: "activo", p_prueba_termina_at: null, p_motivo: "yo" }), "activarse por la función de la plataforma");
  debeRechazar(await adm.from("planes_precios_stripe").select("id"), "ver los precios de Stripe");
  debeRechazar(await adm.from("planes_precios_stripe").insert({ plan_id: planCompleto, periodicidad: "mensual", neto: 0, total_centavos: 0, lookup_key: "peludesk_completo_mensual", stripe_price_id: "price_gratis", stripe_product_id: "prod_x", modo: "test" }).select("id"), "darse un precio de $0");
  debeRechazar(await adm.from("eventos_stripe").select("id"), "ver los eventos del webhook");
  debeRechazar(await adm.from("eventos_stripe").insert({ stripe_event_id: "evt_falso", tipo: "invoice.paid", modo: "test", payload: {} }).select("id"), "inyectar un evento");
  debeRechazar(await adm.rpc("plataforma_cobros"), "ver el cobro de todos los negocios");
  debeRechazar(await adm.rpc("plataforma_pagos_negocio", { p_negocio_id: NB }), "ver los pagos de B por la plataforma");
  const mio = exigir(await adm.rpc("mi_cobro"), "mi_cobro");
  veredicto(mio.estado === "prueba", "control: su propio cobro lo ve (mi_cobro)", `mi_cobro raro: ${mio.estado}`);

  console.log("── El admin de A no alcanza la suscripción de B");
  const leeB = await adm.from("suscripciones").select("id").eq("negocio_id", NB);
  veredicto(leeB.data?.length === 0, "con su negocio: 0 filas de B", "ve la suscripción de B");
  const suplanta = admA.hacia(NB);
  debeRechazar(await suplanta.from("suscripciones").select("id"), "suplantando el encabezado de B: leer su suscripción");
  debeRechazar(await suplanta.from("suscripciones").update({ estado_stripe: "canceled" }).eq("negocio_id", NB).select("id"), "suplantando: cancelarle la suscripción");
  debeRechazar(await suplanta.from("pagos_suscripcion").select("id"), "suplantando: ver sus pagos");
  debeRechazar(await suplanta.rpc("mi_cobro"), "suplantando: mi_cobro de B");
  const eB = await adm.rpc("estado_cobro_en", { p_negocio_id: NB });
  veredicto(!eB.error && eB.data === null, "estado_cobro_en(B) desde A: nulo (no lo ve)", `estado_cobro_en(B) desde A: ${JSON.stringify(eB.data ?? eB.error)}`);
  const eBsup = await suplanta.rpc("estado_cobro");
  veredicto(!eBsup.error && eBsup.data === null, "suplantando: estado_cobro de B nulo (no es miembro)", `suplantando: estado_cobro de B = ${JSON.stringify(eBsup.data ?? eBsup.error)}`);

  console.log("── Recepción, el cliente y la llave anónima");
  for (const [quien, c] of [["recepción", recA.propio], ["cliente", cliA.propio], ["anónimo", ANON]]) {
    const s = await c.from("suscripciones").select("*");
    veredicto(rechazada(s), `${quien}: no ve la suscripción`, `${quien}: ve la suscripción`);
    const p = await c.from("pagos_suscripcion").select("*");
    veredicto(rechazada(p), `${quien}: no ve los pagos`, `${quien}: ve los pagos`);
    debeRechazar(await c.rpc("mi_cobro"), `${quien}: mi_cobro`);
    debeRechazar(await c.rpc("cobro_aplicar", { p_negocio_id: NA, p: { subscription: "sub_x", estado_stripe: "active", plan_clave: "completo" } }), `${quien}: cobro_aplicar`);
    debeRechazar(await c.from("suscripciones").update({ estado_stripe: "active" }).eq("negocio_id", NA).select("id"), `${quien}: marcar pagado`);
  }
  const eRec = exigir(await recA.propio.rpc("estado_cobro"), "estado_cobro recepción");
  const sinMontos = (o) => !JSON.stringify(o).match(/monto|precio|centavos/);
  veredicto(eRec?.estado && sinMontos(eRec), `recepción: estado_cobro sin montos (${eRec.estado})`, `recepción: estado_cobro ${JSON.stringify(eRec)}`);
  const eCli = exigir(await cliA.propio.rpc("estado_cobro"), "estado_cobro cliente");
  veredicto(Object.keys(eCli ?? {}).join() === "estado" && eCli.estado === null, "cliente: estado_cobro no dice nada mientras se puede escribir", `cliente: estado_cobro ${JSON.stringify(eCli)}`);
  const eAnon = await ANON.rpc("estado_cobro");
  veredicto(eAnon.error || eAnon.data === null, "anónimo: estado_cobro nada", `anónimo: estado_cobro ${JSON.stringify(eAnon.data)}`);

  console.log("── El webhook");
  // Al dominio de la plataforma (el fetch de Node no deja poner Host).
  const post = (cuerpo, firma) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port: 3001, path: "/api/stripe/webhook", method: "POST", headers: { Host: "plataforma.localhost:3001", "content-type": "application/json", "content-length": Buffer.byteLength(cuerpo), ...(firma ? { "stripe-signature": firma } : {}) } },
        (res) => {
          let texto = "";
          res.on("data", (d) => (texto += d));
          res.on("end", () => resolve({ status: res.statusCode, text: async () => texto }));
        }
      );
      req.on("error", reject);
      req.end(cuerpo);
    });
  const firmar = (cuerpo, secreto = SECRETO, t) => stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: secreto, ...(t ? { timestamp: t } : {}) });
  const evento = (id, tipo, objeto) => JSON.stringify({ id, object: "event", type: tipo, livemode: false, created: Math.floor(Date.now() / 1000), api_version: "2026-08-26.dahlia", data: { object: objeto } });
  const falso = evento(`evt_auditoria_${Date.now()}`, "customer.subscription.updated", { id: "sub_auditoria_b", object: "subscription", status: "active", metadata: { peludesk_negocio_id: NB } });
  let r = await post(falso, null);
  veredicto(r.status === 400, "sin firma: 400", `sin firma: ${r.status}`);
  r = await post(falso, firmar(falso, "whsec_otro_secreto_que_no_es"));
  veredicto(r.status === 400, "firmado con otro secreto: 400", `otro secreto: ${r.status}`);
  r = await post(falso, firmar(falso, SECRETO, Math.floor(Date.now() / 1000) - 3600));
  veredicto(r.status === 400, "firma de hace una hora (repetición): 400", `firma vieja: ${r.status}`);
  const firma = firmar(falso);
  r = await post(falso.replace('"past_due"', '"active"').replace("customer.subscription.updated", "invoice.paid"), firma);
  veredicto(r.status === 400, "cuerpo cambiado después de firmar: 400", `cuerpo cambiado: ${r.status}`);
  // Aun firmado con el secreto correcto, un evento inventado no marca a B pagado:
  // el webhook le pregunta a Stripe por la suscripción, y no existe.
  r = await post(falso, firma);
  veredicto((await huellaB()) === huellaInicialB && (await estadoB()) === antesB, `evento inventado y bien firmado (${r.status}): B sigue igual (${antesB})`, "un evento inventado cambió a B");
  // Un evento de una suscripción real de A que dice ser de B: no se aplica a B.
  const clienteReal = await stripe.customers.create({ name: "Auditoría A", metadata: { peludesk_negocio_id: NA } });
  const precio = (await stripe.prices.list({ lookup_keys: ["peludesk_estetica_mensual"], limit: 1 })).data[0];
  const subReal = await stripe.subscriptions.create({ customer: clienteReal.id, items: [{ price: precio.id }], trial_period_days: 7, metadata: { peludesk_negocio_id: NA } });
  const cruzado = evento(`evt_auditoria_cruzado_${Date.now()}`, "customer.subscription.updated", { ...subReal, metadata: { peludesk_negocio_id: NB } });
  r = await post(cruzado, firmar(cruzado));
  veredicto((await huellaB()) === huellaInicialB, `suscripción de A que dice ser de B (${r.status}): B no cambia`, "la suscripción de A se aplicó a B");
  // Idempotencia: el mismo evento dos veces se aplica una.
  const deA = evento(`evt_auditoria_a_${Date.now()}`, "customer.subscription.updated", subReal);
  const r1 = await post(deA, firmar(deA));
  const r2 = await post(deA, firmar(deA));
  const t2 = await r2.text();
  veredicto(r1.status === 200 && r2.status === 200 && /Ya procesado/.test(t2), "el mismo evento dos veces: la segunda es «Ya procesado»", `idempotencia: ${r1.status} / ${r2.status} ${t2}`);
  // Lo de otros productos de la cuenta (Menteo, Checaíto) no se guarda.
  const ajeno = evento(`evt_auditoria_ajeno_${Date.now()}`, "invoice.paid", { id: "in_ajena", object: "invoice", parent: { subscription_details: { subscription: "sub_de_menteo", metadata: { psychologist_id: "x" } } } });
  r = await post(ajeno, firmar(ajeno));
  const guardado = (await A.from("eventos_stripe").select("id").eq("stripe_event_id", JSON.parse(ajeno).id)).data;
  veredicto(r.status === 200 && guardado.length === 0, "evento de otro producto de la cuenta: 200 y no se guarda", `evento ajeno: ${r.status}, guardado ${guardado.length}`);
  await stripe.subscriptions.cancel(subReal.id);
  await stripe.customers.del(clienteReal.id);

  console.log("── La página de regreso del Checkout");
  // Un checkout de A, abierto con la sesión del admin de B.
  const precioCo = (await stripe.prices.list({ lookup_keys: ["peludesk_completo_mensual"], limit: 1 })).data[0];
  const checkoutA = await stripe.checkout.sessions.create({ mode: "subscription", line_items: [{ price: precioCo.id, quantity: 1 }], metadata: { peludesk_negocio_id: NA }, subscription_data: { metadata: { peludesk_negocio_id: NA } }, success_url: "http://x.localhost/ok", cancel_url: "http://x.localhost/no" });
  const { data: uB } = await A.auth.admin.getUserById(await cuenta("admin@cobro-b.prueba"));
  const pw = `Prueba-${crypto.randomUUID()}`;
  exigir(await A.auth.admin.updateUserById(uB.user.id, { password: pw }), "contraseña admin B");
  const { abrirNavegador } = await import("../lib/navegador.mjs");
  const nav = await abrirNavegador();
  try {
    const page = await (await nav.newContext({ locale: "es-MX" })).newPage();
    await page.goto("http://cobro-auditoria-b.localhost:3001/login");
    await page.getByLabel("Teléfono o correo").fill(uB.user.email);
    await page.getByLabel("Contraseña", { exact: true }).fill(pw);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
    await page.goto(`http://cobro-auditoria-b.localhost:3001/admin/modulos/pago?sesion=${checkoutA.id}`);
    veredicto((await page.getByText("Ese pago no es de este negocio.").waitFor({ timeout: 60_000 }).then(() => true, () => false)), "el pago de A en la página de B: «Ese pago no es de este negocio.»", "la página de regreso aceptó el checkout de otro negocio");
    veredicto((await huellaB()) === huellaInicialB, "B sigue igual", "B cambió");
  } finally {
    await nav.close();
    await stripe.checkout.sessions.expire(checkoutA.id).catch(() => {});
  }
} finally {
  console.log(hallazgos ? `\n✘ ${hallazgos} hallazgo(s)` : "\n✔ Sin hallazgos");
  process.exit(hallazgos ? 1 : 0);
}
