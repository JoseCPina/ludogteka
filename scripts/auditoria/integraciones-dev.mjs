// Uso (SOLO DESARROLLO), con el servidor prendido con un Mercado Pago y un
// Clip DE MENTIRAS (este script los levanta en el puerto 4455):
//
//   MERCADOPAGO_APP_ID=mock-app MERCADOPAGO_APP_SECRET=mock-secret \
//   MERCADOPAGO_APP_WEBHOOK_SECRET=mock-whsec \
//   MERCADOPAGO_API_URL=http://127.0.0.1:4455 \
//   MERCADOPAGO_AUTH_URL=http://127.0.0.1:4455/authorization \
//   CLIP_API_URL=http://127.0.0.1:4455/clip CRON_SECRET=mock-cron \
//   npm run start -- -p 3001          (después de npm run build)
//
//   node scripts/auditoria/integraciones-dev.mjs
//
// Con PROBAR_LEGADO=1 (y el servidor prendido además con
// MERCADOPAGO_ACCESS_TOKEN=APP_USR-mock-legado MERCADOPAGO_WEBHOOK_SECRET=legado-whsec
// MERCADOPAGO_TERMINAL_ID=NEWLAND_N950__LEGADO01) se prueba también la
// conexión ANTERIOR de Ludogteka (la llave del entorno): cobra igual que
// antes, y un webhook firmado con su secreto solo alcanza a Ludogteka.
//
// Recorre, con el navegador y las pantallas reales, en Huellitas (negocio
// REAL, plan activo) y con Ludogteka como "el otro negocio":
//   1. Conectar Mercado Pago por OAuth (autorizar → regreso firmado → Vault).
//   2. Escoger terminal (una Point Smart y una que no es compatible).
//   3. Cobro en terminal → pagado → cobro registrado + comisión como gasto.
//   4. Link de pago → webhook FIRMADO → cobro registrado + comisión.
//  4b. Devoluciones con Mercado Pago: parcial en terminal (comisión
//      proporcional), rechazada por Mercado Pago (nada en caja), más de lo
//      cobrado (se frena antes), total del link (comisión cancelada), hecha
//      en el panel (webhook → caja + «Necesita atención» + «Enterado»),
//      recepción sin permiso y el admin de Huellitas contra un cobro de
//      Ludogteka. En el 8, Clip dice que su devolución se hace en Clip; en
//      el 9, la devolución simulada queda marcada.
//   5. Webhook cruzado (pago de la cuenta de Huellitas que apunta a una orden
//      de Ludogteka), firma mala, cuenta desconocida → rechazados.
//   6. Renovación del token por el cron (y el cron sin secreto, rechazado).
//   7. Desconectar (Vault vacío).
//   8. Clip con credenciales reales (contra el Clip de mentiras) y su webhook.
//   9. Negocio en prueba: cobro simulado marcado "Simulación: no mueve dinero".
// Todo lo que las APIs de verdad no dejan probar aquí (la red de la sesión
// no llega a Mercado Pago ni a Clip) lo contesta el servidor de mentiras con
// la forma documentada de cada API.
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO_APP = 3001;
const SECRETO_WEBHOOK = "mock-whsec";
const CUENTA_MP = "777001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const { data: huellitas } = await A.from("negocios").select("id, slug").eq("slug", "huellitas").single();
const { data: ludogteka } = await A.from("negocios").select("id").eq("slug", "ludogteka").single();
const H = huellitas.id;
const BASE = `http://huellitas.localhost:${PUERTO_APP}`;
const PLATAFORMA = `http://plataforma.localhost:${PUERTO_APP}`;
const conNegocio = (id) => createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": id } } });
const servicioH = conNegocio(H);
// Una sesión real (JWT) en Huellitas.
const sesion = async (profileId) =>
  createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(profileId)}`, "x-negocio-id": H } },
  });

// ───────────── Mercado Pago y Clip de mentiras
const mock = { tokens: 0, ordenes: new Map(), pagos: new Map(), preferencias: [], clip: new Map(), refrescos: 0, idempotencia: [], guion: new Map(), busqueda: [], cancelaciones: [], setup: [] };
const servidor = http.createServer(async (req, res) => {
  const u = new globalThis.URL(req.url, "http://127.0.0.1:4455");
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const json = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  const p = u.pathname;
  if (p === "/authorization") {
    const back = new globalThis.URL(u.searchParams.get("redirect_uri"));
    back.searchParams.set("code", "TG-mock-code");
    back.searchParams.set("state", u.searchParams.get("state"));
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }
  if (p === "/oauth/token") {
    const f = new URLSearchParams(cuerpo);
    if (f.get("client_id") !== "mock-app" || f.get("client_secret") !== "mock-secret") return json(401, { message: "invalid client" });
    if (f.get("grant_type") === "authorization_code" && (f.get("code") !== "TG-mock-code" || !f.get("code_verifier"))) return json(400, { message: "invalid_grant" });
    if (f.get("grant_type") === "refresh_token") mock.refrescos += 1;
    mock.tokens += 1;
    return json(200, { access_token: `APP_USR-mock-${mock.tokens}`, refresh_token: `TG-refresh-${mock.tokens}`, user_id: Number(CUENTA_MP), expires_in: 10 * 86400, live_mode: false, public_key: "APP_USR-pk" });
  }
  const token = (req.headers.authorization ?? "").replace("Bearer ", "");
  if (p.startsWith("/clip/")) {
    if (!req.headers.authorization?.startsWith("Basic ")) return json(401, { message: "no auth" });
    if (p === "/clip/f2f/pinpad/v1/payment" && req.method === "POST") {
      const b = JSON.parse(cuerpo);
      const id = `pinpad-${randomUUID().slice(0, 8)}`;
      mock.clip.set(id, { ...b, consultas: 0 });
      return json(200, { pinpad_request_id: id, reference: b.reference, status: "PENDING" });
    }
    const id = u.searchParams.get("pinpadRequestId");
    const c = mock.clip.get(id);
    if (!c) return json(404, { message: "not found" });
    if (req.method === "DELETE") return json(200, { status: "CANCELED" });
    c.consultas += 1;
    return json(200, c.consultas < 2 ? { pinpad_request_id: id, reference: c.reference, status: "IN_PROGRESS" } : { pinpad_request_id: id, reference: c.reference, status: "COMPLETED", amount: c.amount, receipt_no: `R${id.slice(-6)}`, installments: 1, card_type: "debit_card", fee: 2.9 });
  }
  if (!token.startsWith("APP_USR-mock-")) return json(401, { message: "invalid access token" });
  if (p === "/users/me") return json(200, { id: Number(CUENTA_MP), nickname: "HUELLITAS_PRUEBA", site_id: "MLM" });
  if (p.startsWith("/terminals/v1/list")) return json(200, { data: { terminals: [{ id: "NEWLAND_N950__N950NCB000777", operating_mode: "PDV" }, { id: "MPOS_AIR__AIR000123", operating_mode: "STANDALONE" }] } });
  if (p === "/terminals/v1/setup" && req.method === "PATCH") {
    const b = JSON.parse(cuerpo);
    mock.setup.push(b);
    return json(200, { terminals: b.terminals });
  }
  // Conciliación: los pagos de la cuenta (los controla la prueba).
  if (p === "/v1/payments/search") {
    const desde = Number(u.searchParams.get("offset") ?? 0);
    return json(200, { results: mock.busqueda.slice(desde, desde + 100), paging: { total: mock.busqueda.length } });
  }
  const cancelacion = p.match(/^\/v1\/orders\/([^/]+)\/cancel$/);
  if (cancelacion && req.method === "POST") {
    mock.cancelaciones.push(cancelacion[1]);
    const guion = mock.guion.get(cancelacion[1]);
    if (guion) guion.status = "canceled";
    return json(200, { id: cancelacion[1], status: "canceled", status_detail: "canceled_by_api" });
  }
  if (p === "/v1/orders" && req.method === "POST") {
    const b = JSON.parse(cuerpo);
    const id = `ORD${Date.now()}`;
    mock.ordenes.set(id, { ...b, consultas: 0 });
    return json(201, { id, status: "at_terminal", external_reference: b.external_reference, user_id: CUENTA_MP });
  }
  // Reembolso de una orden de la terminal (total sin cuerpo; parcial con la
  // transacción). Un monto con .66 centavos lo rechaza Mercado Pago.
  const reembolsoOrden = p.match(/^\/v1\/orders\/([^/]+)\/refund$/);
  if (reembolsoOrden && req.method === "POST") {
    const o = mock.ordenes.get(reembolsoOrden[1]);
    if (!o?.pagada) return json(404, { message: "order not found" });
    const b = cuerpo ? JSON.parse(cuerpo) : {};
    mock.idempotencia.push(req.headers["x-idempotency-key"]);
    const pagado = Number(o.transactions.payments[0].amount);
    const ya = o.refunds.reduce((a, r) => a + Number(r.amount), 0);
    const monto = b.transactions?.[0]?.amount != null ? Number(b.transactions[0].amount) : Math.round((pagado - ya) * 100) / 100;
    if (Math.round(monto * 100) % 100 === 66) return json(400, { errors: [{ code: "refund_not_allowed", message: "The refund could not be processed" }] });
    if (monto > pagado - ya + 0.001) return json(400, { errors: [{ code: "invalid_amount", message: "amount exceeds" }] });
    o.refunds.push({ id: `REF01${randomUUID().slice(0, 8)}`, transaction_id: o.pagada.pagoId, amount: monto.toFixed(2), status: "processed" });
    return json(200, respuestaOrden(reembolsoOrden[1], o));
  }
  const orden = p.match(/^\/v1\/orders\/([^/]+)$/);
  // Órdenes con un guion: la prueba decide qué dice Mercado Pago de ellas.
  if (orden && mock.guion.has(orden[1])) return json(200, mock.guion.get(orden[1]));
  if (orden) {
    const o = mock.ordenes.get(orden[1]);
    if (!o) return json(404, { message: "order not found" });
    o.consultas += 1;
    if (o.consultas < 2 && !o.pagada) return json(200, { id: orden[1], status: "at_terminal", external_reference: o.external_reference, user_id: CUENTA_MP });
    if (!o.pagada) {
      const pagoId = `8${orden[1].slice(-9)}`;
      const monto = o.transactions.payments[0].amount;
      mock.pagos.set(pagoId, { id: pagoId, status: "approved", transaction_amount: Number(monto), collector_id: CUENTA_MP, fee_details: [{ type: "mercadopago_fee", amount: 4.5, fee_payer: "collector" }] });
      o.pagada = { pagoId };
      o.refunds = [];
    }
    return json(200, respuestaOrden(orden[1], o));
  }
  if (p === "/checkout/preferences" && req.method === "POST") {
    const b = JSON.parse(cuerpo);
    mock.preferencias.push(b);
    return json(201, { id: `PREF-${mock.preferencias.length}`, init_point: `https://mercadopago.example/checkout/${mock.preferencias.length}` });
  }
  const reembolsoPago = p.match(/^\/v1\/payments\/([^/]+)\/refunds$/);
  if (reembolsoPago && req.method === "POST") {
    const x = mock.pagos.get(reembolsoPago[1]);
    if (!x) return json(404, { message: "payment not found" });
    mock.idempotencia.push(req.headers["x-idempotency-key"]);
    const b = cuerpo ? JSON.parse(cuerpo) : {};
    x.refunds ??= [];
    const ya = x.refunds.reduce((a, r) => a + r.amount, 0);
    const monto = b.amount != null ? Number(b.amount) : Math.round((x.transaction_amount - ya) * 100) / 100;
    if (Math.round(monto * 100) % 100 === 66) return json(400, { message: "refund_not_allowed", cause: [{ description: "The refund could not be processed" }] });
    const r = { id: Number(`7${Date.now()}`.slice(0, 13)), payment_id: x.id, amount: monto, status: "approved" };
    x.refunds.push(r);
    x.transaction_amount_refunded = ya + monto;
    if (x.transaction_amount_refunded >= x.transaction_amount - 0.001) x.status = "refunded";
    return json(201, r);
  }
  const pago = p.match(/^\/v1\/payments\/([^/]+)$/);
  if (pago) {
    const x = mock.pagos.get(pago[1]);
    return x ? json(200, x) : json(404, { message: "payment not found" });
  }
  console.log("MOCK sin ruta", req.method, p); return json(404, { message: `mock sin ruta ${req.method} ${p}` });
});
function respuestaOrden(id, o) {
  const monto = o.transactions.payments[0].amount;
  const reembolsado = o.refunds.reduce((a, r) => a + Number(r.amount), 0);
  return {
    id,
    status: reembolsado >= Number(monto) - 0.001 ? "refunded" : "processed",
    status_detail: "accredited",
    external_reference: o.external_reference,
    user_id: CUENTA_MP,
    transactions: {
      payments: [{ id: `PAY01${o.pagada.pagoId}`, reference_id: o.pagada.pagoId, amount: monto, paid_amount: monto, status: "processed", status_detail: "accredited", payment_method: { type: "credit_card", installments: 1 } }],
      refunds: o.refunds,
    },
  };
}
await new Promise((r) => servidor.listen(4455, "127.0.0.1", r));

// Webhook firmado como lo firma Mercado Pago.
function pedirApp(host, ruta, { method = "GET", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO_APP, path: ruta, method, headers: { host, ...(body ? { "content-type": "application/json" } : {}), ...headers } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, cuerpo: d }));
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}
async function webhookMp({ tipo, id, cuenta = CUENTA_MP, secreto = SECRETO_WEBHOOK, host = `plataforma.localhost:${PUERTO_APP}` }) {
  const ts = Math.floor(Date.now() / 1000);
  const rid = randomUUID();
  const v1 = createHmac("sha256", secreto).update(`id:${String(id).toLowerCase()};request-id:${rid};ts:${ts};`).digest("hex");
  const r = await pedirApp(host, `/api/mercadopago/webhook?data.id=${id}&type=${tipo}`, {
    method: "POST",
    body: JSON.stringify({ type: tipo, user_id: cuenta, data: { id } }),
    headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": rid },
  });
  let j = {};
  try { j = JSON.parse(r.cuerpo); } catch { /* */ }
  return { status: r.status, ...j };
}

// ───────────── sesiones del navegador
async function cookiesDe(rol, negocioId = H, dominio = "huellitas.localhost") {
  const { data: m } = await A.from("membresias").select("profile_id").eq("negocio_id", negocioId).eq("rol", rol).is("deleted_at", null).order("created_at").limit(1).single();
  const { data: u } = await A.auth.admin.getUserById(m.profile_id);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: dominio, path: "/" }));
}

// Deja a Huellitas sin integraciones y en plan activo.
async function limpiar() {
  for (const p of ["mercadopago", "clip"]) await servicioH.rpc("integracion_borrar_secreto", { p_proveedor: p });
  await A.from("integraciones_cobro").delete().eq("negocio_id", H);
  await A.from("integraciones_oauth").delete().eq("negocio_id", H);
  await A.from("negocios").update({ plan: "activo" }).eq("id", H);
}
await limpiar();

const nav = await abrirNavegador();
const ctxAdmin = await nav.newContext();
await ctxAdmin.addCookies(await cookiesDe("admin"));
const admin = await ctxAdmin.newPage();
admin.on("dialog", (d) => d.accept());
const ctxRecep = await nav.newContext();
await ctxRecep.addCookies(await cookiesDe("recepcion"));
const recep = await ctxRecep.newPage();

const { data: reserva } = await A.from("reservas").select("id").eq("negocio_id", H).order("created_at").limit(1).single();
const fila = async (proveedor) => (await A.from("integraciones_cobro").select("*").eq("negocio_id", H).eq("proveedor", proveedor).maybeSingle()).data;
const secreto = async (proveedor) => (await servicioH.rpc("integracion_leer_secreto", { p_proveedor: proveedor })).data;

async function cobrarEnTerminal(monto, pagina = recep, url = `${BASE}/reservas/${reserva.id}/cobrar`) {
  const recep_ = pagina;
  await recep_.goto(url, { waitUntil: "networkidle" });
  const panel = recep_.locator("[data-cobro-integrado]");
  await panel.getByRole("button", { name: "Cobrar con terminal" }).click();
  await panel.getByLabel("Monto", { exact: true }).fill(String(monto));
  await panel.getByRole("button", { name: "Mandar a la terminal" }).click();
  await recep_.getByText(/Pago confirmado|No se pudo completar/).first().waitFor({ timeout: 60_000 });
  return (await recep_.getByText(/Pago confirmado/).count()) > 0;
}
const ordenPorMonto = async (monto) =>
  (await A.from("mp_ordenes").select("id, estado, cobro_id, proveedor, simulado, cuenta_id").eq("negocio_id", H).eq("monto", monto).order("created_at", { ascending: false }).limit(1).single()).data;
const comisionDe = async (ordenId) => (await A.from("gastos").select("concepto, monto").eq("negocio_id", H).eq("mp_orden_id", ordenId).maybeSingle()).data;

try {
  console.log("\n1. Conectar Mercado Pago por OAuth");
  await admin.goto(`${BASE}/admin/pagos`, { waitUntil: "networkidle" });
  await admin.getByRole("radio", { name: /Mercado Pago/ }).click();
  await admin.getByRole("button", { name: "Conectar Mercado Pago" }).waitFor();
  await admin.getByRole("button", { name: "Conectar Mercado Pago" }).click();
  await admin.waitForURL(/mp=conectado|mp_error/, { timeout: 30_000 });
  if (!admin.url().includes("mp=conectado")) hallazgo(`OAuth no terminó: ${decodeURIComponent(admin.url())}`);
  const f1 = await fila("mercadopago");
  const s1 = JSON.parse((await secreto("mercadopago")) ?? "{}");
  if (f1?.estado !== "conectada" || f1.cuenta_id !== CUENTA_MP || f1.modo !== "oauth") hallazgo(`la conexión no quedó bien: ${JSON.stringify(f1)}`);
  else if (!s1.accessToken?.startsWith("APP_USR-mock-") || !s1.refreshToken) hallazgo("los tokens no quedaron en Vault");
  else bien(`conectada (cuenta ${f1.cuenta_id}, vence ${f1.token_expira_at?.slice(0, 10)}); tokens cifrados en Vault, no en la tabla`);
  // El mismo regreso no se puede reusar.
  const { data: intento } = await A.from("integraciones_oauth").select("usado_at, resultado").eq("negocio_id", H).order("created_at", { ascending: false }).limit(1).single();
  if (!intento?.usado_at) hallazgo("el intento de OAuth no quedó usado");
  const falso = await pedirApp(`plataforma.localhost:${PUERTO_APP}`, `/api/mercadopago/oauth?code=TG-mock-code&state=${encodeURIComponent("xx.yy")}`);
  if (falso.status !== 400) hallazgo(`un state falsificado respondió ${falso.status}`);
  else bien("un state falsificado no conecta nada (400)");

  console.log("\n2. Escoger terminal");
  await admin.getByRole("button", { name: "Ver las terminales de mi cuenta" }).click();
  await admin.getByText("No compatible").first().waitFor();
  bien("la Point Air sale como no compatible");
  await admin.getByRole("button", { name: "Usar esta" }).click();
  await admin.getByText("Terminal escogida.").waitFor();
  if ((await fila("mercadopago")).terminal_id !== "NEWLAND_N950__N950NCB000777") hallazgo("no se guardó la terminal");
  else bien("Point Smart escogida");

  console.log("\n3. Cobro en terminal");
  const pagado = await cobrarEnTerminal(123.45);
  const o3 = await ordenPorMonto(123.45);
  if (!pagado || !o3?.cobro_id) hallazgo(`el cobro en terminal no quedó registrado: ${JSON.stringify(o3)}`);
  else if (o3.simulado || o3.cuenta_id !== CUENTA_MP) hallazgo("la orden quedó simulada o sin la cuenta");
  else {
    const { data: cobro } = await A.from("cobros").select("origen, notas").eq("negocio_id", H).eq("id", o3.cobro_id).single();
    bien(`pagado y registrado (${cobro.origen}: ${cobro.notas})`);
    const c = await comisionDe(o3.id);
    if (!c || Number(c.monto) !== 4.5) hallazgo(`la comisión no quedó como gasto: ${JSON.stringify(c)}`);
    else bien(`comisión como gasto de Huellitas: ${c.concepto} $${c.monto}`);
  }
  const antes = (await A.from("cobros").select("id", { count: "exact", head: true }).eq("negocio_id", H)).count;
  const repetido = await webhookMp({ tipo: "order", id: [...mock.ordenes.keys()].at(-1) });
  const despues = (await A.from("cobros").select("id", { count: "exact", head: true }).eq("negocio_id", H)).count;
  if (repetido.status !== 200 || despues !== antes) hallazgo(`el webhook repetido de la orden duplicó algo (${repetido.status}, ${antes}→${despues})`);
  else bien("el webhook de la misma orden, repetido, no duplica el cobro");

  console.log("\n4. Link de pago + webhook firmado");
  await recep.goto(`${BASE}/reservas/${reserva.id}/cobrar`, { waitUntil: "networkidle" });
  const panelLink = recep.locator("[data-cobro-integrado]");
  await panelLink.getByRole("button", { name: "Mandar link de pago" }).click();
  await panelLink.getByLabel("Monto", { exact: true }).fill("77.10");
  await panelLink.getByLabel("Concepto").fill("Anticipo de hotel");
  await panelLink.getByRole("button", { name: "Generar link" }).click();
  await recep.getByText(/Link listo/).waitFor({ timeout: 30_000 });
  const pref = mock.preferencias.at(-1);
  if (!pref.statement_descriptor?.startsWith("HUELLITAS") || !pref.items[0].description.includes("Huellitas")) hallazgo(`el link no va a nombre del negocio: ${pref.statement_descriptor} / ${pref.items[0].description}`);
  else bien(`link a nombre del negocio («${pref.statement_descriptor}», «${pref.items[0].description}»)`);
  if (!pref.notification_url.startsWith(PLATAFORMA)) hallazgo(`el aviso del link no va al webhook único: ${pref.notification_url}`);
  const o4 = await ordenPorMonto(77.1);
  const pagoLink = `91${Date.now()}`;
  mock.pagos.set(pagoLink, { id: pagoLink, status: "approved", external_reference: o4.id, transaction_amount: 77.1, collector_id: CUENTA_MP, fee_details: [{ type: "mercadopago_fee", amount: 3.02, fee_payer: "collector" }] });
  const w4 = await webhookMp({ tipo: "payment", id: pagoLink });
  const o4b = await ordenPorMonto(77.1);
  if (!w4.registrado || !o4b.cobro_id) hallazgo(`el pago del link no se registró: ${JSON.stringify(w4)}`);
  else {
    bien("webhook firmado → cobro del link registrado");
    const c = await comisionDe(o4.id);
    if (!c || Number(c.monto) !== 3.02) hallazgo(`la comisión del link no quedó: ${JSON.stringify(c)}`);
    else bien(`comisión del link como gasto: $${c.monto}`);
  }

  console.log("\n4b. Devoluciones con Mercado Pago");
  const devolverEnPantalla = async (cobroId, monto, motivo) => {
    await admin.goto(`${BASE}/reservas/${reserva.id}/cobrar`, { waitUntil: "networkidle" });
    const li = admin.locator(`li[data-cobro-id="${cobroId}"]`);
    await li.getByRole("button", { name: "Devolver con Mercado Pago" }).click();
    await li.getByLabel("Monto a devolver").fill(String(monto));
    await li.getByLabel("Motivo").fill(motivo);
    await li.getByRole("button", { name: "Devolver con Mercado Pago" }).click();
    await li.locator("[role=alert], [role=status]").first().waitFor({ timeout: 30_000 });
    return (await li.locator("[role=alert]").count()) ? await li.locator("[role=alert]").first().innerText() : null;
  };
  const devolucionesDe = async (cobroId) =>
    (await A.from("devoluciones").select("id, origen, motivo, devolucion_metodos(metodo, monto)").eq("negocio_id", H).eq("cobro_id", cobroId)).data ?? [];
  const reembolsosDe = async (ordenId) => (await A.from("reembolsos_cobro").select("*").eq("negocio_id", H).eq("orden_id", ordenId).order("created_at")).data ?? [];
  const ordenCompleta = async (id) => (await A.from("mp_ordenes").select("estado, monto, monto_reembolsado, cobro_id, mp_payment_ref").eq("negocio_id", H).eq("id", id).single()).data;

  // Parcial de la terminal: $23.45 de $123.45.
  const e1 = await devolverEnPantalla(o3.cobro_id, 23.45, "Una noche menos");
  const r1 = await reembolsosDe(o3.id);
  const d1 = await devolucionesDe(o3.cobro_id);
  const oo1 = await ordenCompleta(o3.id);
  if (e1 || r1.length !== 1 || r1[0].estado !== "hecho" || d1.length !== 1 || d1[0].origen !== "mercadopago_point" || Number(d1[0].devolucion_metodos[0].monto) !== 23.45)
    hallazgo(`la devolución parcial de la terminal no quedó: ${e1} ${JSON.stringify(r1)} ${JSON.stringify(d1)}`);
  else if (oo1.estado !== "pagada" || Number(oo1.monto_reembolsado) !== 23.45) hallazgo(`la orden no dice que se pagó y se reembolsó en parte: ${JSON.stringify(oo1)}`);
  else if (!mock.idempotencia.at(-1)?.includes(r1[0].id)) hallazgo("el reembolso no se pidió con nuestra llave de idempotencia");
  else bien(`parcial en terminal: Mercado Pago reembolsó $23.45 y la devolución quedó en caja (${d1[0].origen}, ${d1[0].devolucion_metodos[0].metodo}); la orden sigue «pagada» con $23.45 reembolsados`);
  const aj1 = (await A.from("gastos").select("monto, tipo, notas").eq("negocio_id", H).eq("tipo", "ajuste").eq("id", r1[0]?.gasto_ajuste_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle()).data;
  const esperado = -Math.round((4.5 * 23.45 / 123.45) * 100) / 100;
  if (!aj1 || Number(aj1.monto) !== esperado) hallazgo(`la comisión proporcional no se ajustó (esperado ${esperado}): ${JSON.stringify(aj1)}`);
  else bien(`comisión: ajuste proporcional de $${aj1.monto} al gasto «Comisión de Mercado Pago»`);
  await admin.getByText("Pagado · reembolsado $23.45").first().waitFor({ timeout: 10_000 }).then(() => bien("la orden se ve «Pagado · reembolsado $23.45»"), () => hallazgo("la orden no se ve como pagada y reembolsada en parte"));

  // Mercado Pago lo rechaza (.66): en la caja no queda nada.
  const e2 = await devolverEnPantalla(o3.cobro_id, 10.66, "Prueba de rechazo");
  const r2 = (await reembolsosDe(o3.id)).at(-1);
  const d2 = await devolucionesDe(o3.cobro_id);
  if (!e2 || !/Mercado Pago/.test(e2) || r2.estado !== "rechazado" || d2.length !== 1) hallazgo(`un reembolso rechazado dejó algo en caja o no se dijo: ${e2} ${JSON.stringify(r2)} ${d2.length}`);
  else bien(`rechazado por Mercado Pago → no se registra nada y se dice por qué («${e2.slice(0, 90)}…»)`);

  // Más de lo que queda: lo rechaza la base antes de ir a Mercado Pago.
  const antesMp = mock.idempotencia.length;
  const e3 = await devolverEnPantalla(o3.cobro_id, 500, "Demasiado");
  if (!e3 || mock.idempotencia.length !== antesMp) hallazgo(`devolver más de lo cobrado no se frenó antes de Mercado Pago: ${e3}`);
  else bien("devolver más de lo que queda se frena antes de llamar a Mercado Pago");

  // Total del link: se cancela la comisión completa.
  const e4 = await devolverEnPantalla(o4b.cobro_id, 77.1, "Cancelaron el hotel");
  const d4 = await devolucionesDe(o4b.cobro_id);
  const g4 = (await A.from("gastos").select("estado, motivo_cancelacion").eq("negocio_id", H).eq("mp_orden_id", o4.id).single()).data;
  const oo4 = await ordenCompleta(o4.id);
  if (e4 || d4.length !== 1 || d4[0].origen !== "mercadopago_link" || d4[0].devolucion_metodos[0].metodo !== "transferencia") hallazgo(`la devolución total del link no quedó: ${e4} ${JSON.stringify(d4)}`);
  else if (g4.estado !== "cancelado") hallazgo(`la comisión del link no se canceló: ${JSON.stringify(g4)}`);
  else if (Number(oo4.monto_reembolsado) !== 77.1 || oo4.estado !== "pagada") hallazgo(`la orden del link no quedó reembolsada completa: ${JSON.stringify(oo4)}`);
  else bien(`total del link: reembolso + devolución en caja + comisión cancelada («${g4.motivo_cancelacion}»)`);
  const deNuevo = await webhookMp({ tipo: "payment", id: pagoLink });
  if ((await devolucionesDe(o4b.cobro_id)).length !== 1) hallazgo(`el webhook del pago reembolsado duplicó la devolución: ${JSON.stringify(deNuevo)}`);
  else bien("el webhook del mismo pago reembolsado no duplica la devolución");

  // Reembolso hecho en el panel de Mercado Pago (lo que queda de la terminal).
  const idOrdenMp = [...mock.ordenes.entries()].find(([, o]) => o.external_reference === o3.id)[0];
  const om = mock.ordenes.get(idOrdenMp);
  om.refunds.push({ id: "REF01PANEL01", transaction_id: om.pagada.pagoId, amount: "100.00", status: "processed" });
  const w5 = await webhookMp({ tipo: "order", id: idOrdenMp });
  const d5 = await devolucionesDe(o3.cobro_id);
  const r5 = (await reembolsosDe(o3.id)).find((r) => r.id_remoto === "REF01PANEL01");
  const oo5 = await ordenCompleta(o3.id);
  if (!r5 || r5.origen !== "proveedor" || d5.length !== 2 || Number(oo5.monto_reembolsado) !== 123.45) hallazgo(`el reembolso del panel no entró a caja: ${JSON.stringify(w5)} ${JSON.stringify(r5)} ${d5.length}`);
  else bien("reembolso hecho en el panel → llegó por el webhook y quedó en caja (origen «proveedor»)");
  const g5 = (await A.from("gastos").select("estado").eq("negocio_id", H).eq("mp_orden_id", o3.id).single()).data;
  if (g5.estado !== "cancelado") hallazgo(`con la terminal reembolsada completa, la comisión no se canceló: ${g5.estado}`);
  else bien("con eso la terminal quedó reembolsada completa y su comisión (con su ajuste) se canceló");
  await webhookMp({ tipo: "order", id: idOrdenMp });
  if ((await devolucionesDe(o3.cobro_id)).length !== 2) hallazgo("el webhook repetido del panel duplicó la devolución");
  else bien("el webhook repetido no la duplica");
  // Por el pago (topic payment) también se reconoce, sin nuestra referencia.
  const wPago = await webhookMp({ tipo: "payment", id: om.pagada.pagoId });
  if (wPago.motivo === "sin_referencia" || (await devolucionesDe(o3.cobro_id)).length !== 2) hallazgo(`el aviso por el pago de la terminal no se reconoció o duplicó: ${JSON.stringify(wPago)}`);
  else bien("el aviso por el pago de la terminal (sin referencia) se reconoce por su id y no duplica");
  await recep.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  if (!(await recep.getByText(/reembolso desde el panel de Mercado Pago|reembolsos de Mercado Pago por revisar/).count())) hallazgo("el reembolso del panel no sale en «Necesita atención»");
  else bien("sale en «Necesita atención» del tablero");
  await recep.goto(`${BASE}/caja/reembolsos`, { waitUntil: "networkidle" });
  const filaPanel = recep.locator("li", { hasText: "$100.00" }).filter({ has: recep.getByRole("button", { name: "Enterado" }) }).first();
  await filaPanel.getByRole("button", { name: "Enterado" }).click();
  await filaPanel.waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
  const rv = (await reembolsosDe(o3.id)).find((r) => r.id_remoto === "REF01PANEL01");
  if (!rv.revisado_at) hallazgo("«Enterado» no lo marcó");
  else bien("recepción lo marca «Enterado» en Caja → Reembolsos y deja de salir");

  // Recepción no devuelve (lo decide la base, no la pantalla).
  const { data: mRecep } = await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "recepcion").is("deleted_at", null).limit(1).single();
  const cliRecep = await sesion(mRecep.profile_id);
  const pr = await cliRecep.rpc("preparar_reembolso", { p_cobro_id: o4b.cobro_id, p_monto: 1, p_motivo: "x" });
  if (!pr.error) hallazgo("recepción pudo pedir un reembolso");
  else bien(`recepción no puede pedir reembolsos (${pr.error.message})`);

  // Otro negocio: el admin de Huellitas contra un cobro de Ludogteka.
  const { data: cobroL } = await A.from("cobros").select("id").eq("negocio_id", ludogteka.id).limit(1).maybeSingle();
  if (cobroL) {
    const { data: mAdm } = await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "admin").is("deleted_at", null).limit(1).single();
    const cliAdm = await sesion(mAdm.profile_id);
    const x = await cliAdm.rpc("preparar_reembolso", { p_cobro_id: cobroL.id, p_monto: 1, p_motivo: "cruzado" });
    const cuantos = (await A.from("reembolsos_cobro").select("id", { count: "exact", head: true }).eq("negocio_id", ludogteka.id)).count;
    if (!x.error || cuantos) hallazgo(`el admin de Huellitas alcanzó un cobro de Ludogteka: ${JSON.stringify(x)}`);
    else bien(`un negocio no puede reembolsar cobros de otro (${x.error.message})`);
  }

  console.log("\n4c. Terminal verificada: lo ambiguo nunca cuenta como pagado");
  {
    let n = 0;
    const nuevaOrden = async (monto, estado = "en_terminal") => {
      const mpId = `ORDT${Date.now()}X${++n}`;
      const { data, error } = await A.from("mp_ordenes")
        .insert({ negocio_id: H, proveedor: "mercadopago", tipo: "point", reserva_id: reserva.id, monto, estado, terminal_id: "NEWLAND_N950__N950NCB000777", cuenta_id: CUENTA_MP, mp_order_id: mpId, simulado: false, expira_at: new Date(Date.now() + 600_000).toISOString(), updated_at: new Date().toISOString() })
        .select("id")
        .single();
      if (error) throw new Error(`orden de prueba: ${error.message}`);
      return { id: data.id, mpId };
    };
    // Lo que Mercado Pago diría de la orden (forma de la API de Orders).
    const guion = (o, c = {}) => ({
      id: o.mpId, status: c.status ?? "processed", status_detail: c.detalleOrden ?? "accredited", external_reference: c.referencia ?? o.id, user_id: CUENTA_MP,
      transactions: { payments: [{ id: `PAY01${o.mpId.slice(-8)}`, amount: String(c.monto), paid_amount: String(c.cobrado ?? c.monto), status: c.pagoEstado ?? "processed", status_detail: c.detalle ?? "accredited", ...(c.refId ? { reference_id: c.refId } : {}), payment_method: { type: "debit_card", installments: 1 } }] },
    });
    let consecutivo = 0;
    const refNueva = () => `7${Date.now()}${++consecutivo}`.slice(0, 13);
    const aprobado = (refId, monto, extra = {}) => mock.pagos.set(refId, { id: refId, status: "approved", transaction_amount: monto, collector_id: CUENTA_MP, ...extra });
    const leer = async (id) => (await A.from("mp_ordenes").select("estado, cobro_id, detalle_error, mp_payment_ref, verificado_at").eq("negocio_id", H).eq("id", id).single()).data;
    const cuantosCobros = async () => (await A.from("cobros").select("id", { count: "exact", head: true }).eq("negocio_id", H)).count;
    const caso = async (titulo, monto, cfg, esperado) => {
      const o = await nuevaOrden(monto);
      const refId = cfg.refId === undefined ? refNueva() : cfg.refId;
      if (cfg.aprueba !== false && refId) aprobado(refId, cfg.montoPago ?? monto, cfg.pago ?? {});
      mock.guion.set(o.mpId, guion(o, { ...cfg, monto, refId }));
      const antes = await cuantosCobros();
      const w = await webhookMp({ tipo: "order", id: o.mpId });
      const e = await leer(o.id);
      const despues = await cuantosCobros();
      const cobro = Boolean(e.cobro_id);
      if (e.estado !== esperado.estado || cobro !== esperado.cobro || despues - antes !== (esperado.cobro ? 1 : 0)) {
        hallazgo(`${titulo}: debía quedar ${esperado.estado}${esperado.cobro ? " con cobro" : " SIN cobro"} y quedó ${e.estado}${cobro ? " con cobro" : ""} (cobros ${antes}→${despues}; webhook ${w.status} ${JSON.stringify(w).slice(0, 80)}; ${e.detalle_error ?? ""})`);
      } else bien(`${titulo}: ${e.estado}${esperado.cobro ? " y cobro registrado" : ", sin cobro"}${e.estado === "por_confirmar" ? ` («${(e.detalle_error ?? "").slice(0, 70)}»)` : ""}`);
      return { o, e, refId };
    };

    // Estados que NUNCA marcan pagado.
    await caso("orden cancelada en la terminal", 61.01, { status: "canceled", pagoEstado: "canceled", detalle: "cancel_by_terminal", refId: null, aprueba: false }, { estado: "cancelada", cobro: false });
    await caso("orden vencida", 61.02, { status: "expired", pagoEstado: "canceled", refId: null, aprueba: false }, { estado: "expirada", cobro: false });
    await caso("orden fallida", 61.03, { status: "failed", pagoEstado: "failed", refId: null, aprueba: false }, { estado: "fallida", cobro: false });
    await caso("orden en cola (todavía no llega a la terminal)", 61.04, { status: "created", pagoEstado: "created", refId: null, aprueba: false }, { estado: "creada", cobro: false });
    await caso("terminal reiniciada (la orden pide una acción)", 61.05, { status: "action_required", pagoEstado: "action_required", refId: null, aprueba: false }, { estado: "en_terminal", cobro: false });

    // El caso bueno y su duplicado.
    const bueno = await caso("pago aprobado correcto", 61.1, {}, { estado: "pagada", cobro: true });
    const { data: cobroBueno } = await A.from("cobros").select("origen").eq("negocio_id", H).eq("id", bueno.e.cobro_id).single();
    if (cobroBueno.origen !== "mercadopago_point" || !bueno.e.verificado_at || bueno.e.mp_payment_ref !== bueno.refId) hallazgo(`el cobro correcto no quedó verificado y ligado a su pago: ${JSON.stringify({ cobroBueno, ...bueno.e })}`);
    else bien("el cobro correcto quedó con origen mercadopago_point, su pago ligado y la hora de verificación");
    const antesDup = await cuantosCobros();
    await webhookMp({ tipo: "order", id: bueno.o.mpId });
    await webhookMp({ tipo: "payment", id: bueno.refId });
    if ((await cuantosCobros()) !== antesDup) hallazgo("el webhook duplicado de un pago aprobado creó otro cobro");
    else bien("webhook duplicado (de la orden y del pago): un pago aprobado = un solo cobro");

    // Todo lo que no cuadra → por confirmar.
    await caso("pago de la orden sin comprobar (el webhook llegó antes que el pago)", 61.2, { aprueba: false }, { estado: "por_confirmar", cobro: false });
    await caso("monto cobrado distinto al de la orden", 61.21, { cobrado: 60.0 }, { estado: "por_confirmar", cobro: false });
    await caso("la API de pagos dice otro monto", 61.22, { montoPago: 40.0 }, { estado: "por_confirmar", cobro: false });
    await caso("el pago está pendiente en la API de pagos", 61.23, { pago: { status: "pending" } }, { estado: "por_confirmar", cobro: false });
    await caso("el pago fue rechazado en la API de pagos", 61.24, { pago: { status: "rejected" } }, { estado: "por_confirmar", cobro: false });
    await caso("el pago es de otra cuenta", 61.25, { pago: { collector_id: "999999" } }, { estado: "por_confirmar", cobro: false });
    await caso("el pago apunta a otra referencia", 61.26, { pago: { external_reference: "otra-orden-cualquiera" } }, { estado: "por_confirmar", cobro: false });
    await caso("sin id de pago para comprobarlo", 61.27, { refId: "", aprueba: false }, { estado: "por_confirmar", cobro: false });
    await caso("el pago de la orden no está acreditado", 61.28, { detalle: "pending_review_manual" }, { estado: "por_confirmar", cobro: false });
    // El mismo pago aprobado ligado a otra orden.
    const orig = await caso("pago ya usado por otra orden (primera)", 61.3, {}, { estado: "pagada", cobro: true });
    await caso("el mismo pago aprobado en otra orden", 61.3, { refId: orig.refId, aprueba: false }, { estado: "por_confirmar", cobro: false });
    // Referencia ajena en la orden misma: no se aplica nada (500, Mercado Pago reintenta).
    {
      const o = await nuevaOrden(61.4);
      const refId = refNueva();
      aprobado(refId, 61.4);
      mock.guion.set(o.mpId, guion(o, { monto: 61.4, refId, referencia: "orden-de-otro-negocio" }));
      const antes = await cuantosCobros();
      const w = await webhookMp({ tipo: "order", id: o.mpId });
      const e = await leer(o.id);
      if (e.cobro_id || (await cuantosCobros()) !== antes || w.status === 200) hallazgo(`una orden con referencia ajena se aplicó o se dio por buena (${w.status})`);
      else bien("orden con referencia ajena: no se aplica nada");
    }

    // «Revisar con Mercado Pago»: de por confirmar a pagado, desde la pantalla.
    const lento = await nuevaOrden(61.5);
    const refLento = refNueva();
    mock.guion.set(lento.mpId, guion(lento, { monto: 61.5, refId: refLento }));
    await webhookMp({ tipo: "order", id: lento.mpId });
    if ((await leer(lento.id)).estado !== "por_confirmar") hallazgo("la orden del pago adelantado no quedó por confirmar");
    await recep.goto(`${BASE}/reservas/${reserva.id}/cobrar`, { waitUntil: "networkidle" });
    const filaPc = recep.locator("[data-cobro-integrado] li", { hasText: "$61.50" }).first();
    if (!(await filaPc.getByText("Por confirmar con Mercado Pago").count()) || !(await filaPc.getByRole("button", { name: "Revisar con Mercado Pago" }).count())) hallazgo("la orden por confirmar no se ve con su botón «Revisar con Mercado Pago»");
    else {
      bien("la orden por confirmar se ve «Por confirmar con Mercado Pago» con su botón «Revisar con Mercado Pago»");
      await filaPc.getByRole("button", { name: "Revisar con Mercado Pago" }).click();
      await recep.waitForTimeout(3000);
      if ((await leer(lento.id)).estado !== "por_confirmar") hallazgo("«Revisar» confirmó un pago que Mercado Pago todavía no tiene");
      else bien("«Revisar con Mercado Pago» mientras el pago no existe: sigue por confirmar");
      aprobado(refLento, 61.5);
      await recep.goto(`${BASE}/reservas/${reserva.id}/cobrar`, { waitUntil: "networkidle" });
      await recep.locator("[data-cobro-integrado] li", { hasText: "$61.50" }).first().getByRole("button", { name: "Revisar con Mercado Pago" }).click();
      await recep.waitForTimeout(3500);
      const rev = await leer(lento.id);
      if (rev.estado !== "pagada" || !rev.cobro_id) hallazgo(`«Revisar con Mercado Pago» no registró el pago ya aprobado: ${JSON.stringify(rev)}`);
      else bien("«Revisar con Mercado Pago» con el pago ya aprobado: registra el cobro (una sola vez)");
    }
    // Directo a la base: un pago real sin verificación o de otro monto no se registra.
    {
      const o = await nuevaOrden(61.6);
      const sinVerif = await servicioH.rpc("registrar_pago_mercadopago", { p_orden_id: o.id, p_mp_payment_id: null, p_monto: 61.6, p_installments: 1, p_mp_payment_type: null, p_evento: null });
      const otroMonto = await servicioH.rpc("registrar_pago_mercadopago", { p_orden_id: o.id, p_mp_payment_id: null, p_monto: 10, p_installments: 1, p_mp_payment_type: null, p_evento: { verificacion: "aprobado" } });
      if (!sinVerif.error || !otroMonto.error || (await leer(o.id)).cobro_id) hallazgo(`la base registró un pago sin verificar o de otro monto: ${sinVerif.error?.message} / ${otroMonto.error?.message}`);
      else bien("la base rechaza registrar un pago real sin verificación o con otro monto");
    }
    // Una por confirmar que sigue así sale en «Necesita atención».
    const sola = await nuevaOrden(61.7);
    mock.guion.set(sola.mpId, guion(sola, { monto: 61.7, refId: refNueva() }));
    await webhookMp({ tipo: "order", id: sola.mpId });
    await recep.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
    if (!(await recep.getByText(/por confirmar con Mercado Pago/).count())) hallazgo("lo por confirmar no sale en «Necesita atención»");
    else bien("lo por confirmar sale en «Necesita atención» con su antigüedad");
    // Mercado Pago luego dice que se canceló: cierra sin cobro.
    mock.guion.get(sola.mpId).status = "canceled";
    mock.guion.get(sola.mpId).transactions.payments[0].status = "canceled";
    await webhookMp({ tipo: "order", id: sola.mpId });
    if ((await leer(sola.id)).estado !== "cancelada" || (await leer(sola.id)).cobro_id) hallazgo("una orden por confirmar que luego se cancela no quedó cancelada sin cobro");
    else bien("una orden por confirmar que luego se cancela, queda cancelada sin cobro");
    // Las órdenes que se quedaron vivas de estos escenarios no deben estorbar a lo que sigue.
    await A.from("mp_ordenes").update({ estado: "cancelada" }).eq("negocio_id", H).eq("proveedor", "mercadopago").in("estado", ["creada", "en_terminal", "por_confirmar"]);
  }

  console.log("\n4d. «Terminal» a mano ya no se captura con un proveedor elegido; «Marcar como no recibido»");
  {
    const { data: mRec } = await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "recepcion").is("deleted_at", null).order("created_at").limit(1).single();
    const { data: mAdm } = await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "admin").is("deleted_at", null).order("created_at").limit(1).single();
    const { data: mEst } = await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "estetica").is("deleted_at", null).order("created_at").limit(1).single();
    const cRec = await sesion(mRec.profile_id);
    const cAdm = await sesion(mAdm.profile_id);
    const cEst = await sesion(mEst.profile_id);
    const anonimo = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });

    // 1. Capturar «terminal» a mano: rechazado en la base; efectivo sí.
    const t1 = await cRec.rpc("registrar_cobro", { p_reserva_id: reserva.id, p_notas: "prueba terminal a mano", p_metodos: [{ metodo: "terminal", monto: 10, propina: 0 }] });
    if (!t1.error || !/Cobrar con terminal/.test(t1.error.message)) hallazgo(`registrar_cobro aceptó «terminal» a mano con Mercado Pago elegido: ${t1.error?.message ?? "PASÓ"}`);
    else bien("«terminal» a mano se rechaza en la base con un proveedor elegido («usa Cobrar con terminal»)");
    const bloqueada = await cRec.rpc("terminal_manual_bloqueada");
    const anonBloq = await anonimo.rpc("terminal_manual_bloqueada");
    if (bloqueada.data !== true || !anonBloq.error) hallazgo(`terminal_manual_bloqueada: ${bloqueada.data} / anónimo ${anonBloq.error ? "rechazado" : "PASÓ"}`);
    else bien("terminal_manual_bloqueada: true con proveedor elegido; el anónimo no la llama");
    await recep.goto(`${BASE}/reservas/${reserva.id}/cobrar`, { waitUntil: "networkidle" });
    const opciones = await recep.getByLabel("Método").first().locator("option").allInnerTexts();
    if (opciones.some((o) => /Terminal/.test(o)) || !(await recep.locator("[data-terminal-bloqueada]").count())) hallazgo(`la pantalla sigue ofreciendo «Terminal» a mano: ${opciones.join(" | ")}`);
    else bien("la pantalla de cobro no ofrece «Terminal» a mano y dice dónde cobrar con tarjeta");

    // 2. Un cobro viejo a mano con «terminal» (como el de Ludogteka), en el turno abierto.
    const { data: turnoAbierto } = await A.from("turnos_caja").select("id").eq("negocio_id", H).eq("estado", "abierto").limit(1).single();
    const nuevoCobroManual = async (monto, turnoId = turnoAbierto.id, extraMetodo = null) => {
      const { data: c } = await A.from("cobros").insert({ negocio_id: H, reserva_id: reserva.id, turno_id: turnoId, origen: "manual", notas: "prueba no recibido" }).select("id").single();
      await A.from("cobro_metodos").insert({ negocio_id: H, cobro_id: c.id, metodo: "terminal", monto, propina: 0 });
      if (extraMetodo) await A.from("cobro_metodos").insert({ negocio_id: H, cobro_id: c.id, metodo: extraMetodo.metodo, monto: extraMetodo.monto, propina: 0 });
      return c.id;
    };
    const saldo = async () => Number((await cAdm.rpc("cuenta_totales_reserva", { p_reserva_id: reserva.id })).data?.[0]?.saldo ?? NaN);
    const resumenTurno = async (turnoId) => JSON.stringify((await cAdm.rpc("resumen_turno", { p_turno_id: turnoId })).data);
    const cobroA = await nuevoCobroManual(350.35);

    // Quién puede: la base y la pantalla.
    for (const [rol, cli] of [["recepción", cRec], ["estética", cEst], ["anónimo", anonimo]]) {
      const x = await cli.rpc("cobro_marcar_no_recibido", { p_cobro_id: cobroA, p_motivo: "intento", p_actor: mAdm.profile_id, p_evidencia: { mp_sin_pago_aprobado: true } });
      if (!x.error) hallazgo(`${rol} llamó cobro_marcar_no_recibido directo (¡sin pasar por el servidor!)`);
    }
    const xAdmin = await cAdm.rpc("cobro_marcar_no_recibido", { p_cobro_id: cobroA, p_motivo: "intento", p_actor: mAdm.profile_id, p_evidencia: { mp_sin_pago_aprobado: true } });
    if (!xAdmin.error) hallazgo("un admin con su sesión llamó cobro_marcar_no_recibido directo (sin la consulta a Mercado Pago)");
    else bien("la función solo la llama el servidor (que antes consulta a Mercado Pago): ni el admin con su sesión, ni recepción, estética o anónimo");
    const sinEvid = await servicioH.rpc("cobro_marcar_no_recibido", { p_cobro_id: cobroA, p_motivo: "sin evidencia", p_actor: mAdm.profile_id, p_evidencia: {} });
    const actorMalo = await servicioH.rpc("cobro_marcar_no_recibido", { p_cobro_id: cobroA, p_motivo: "actor no admin", p_actor: mRec.profile_id, p_evidencia: { mp_sin_pago_aprobado: true } });
    const sinMotivo = await servicioH.rpc("cobro_marcar_no_recibido", { p_cobro_id: cobroA, p_motivo: " ", p_actor: mAdm.profile_id, p_evidencia: { mp_sin_pago_aprobado: true } });
    if (!sinEvid.error || !actorMalo.error || !sinMotivo.error) hallazgo(`la base aceptó marcar sin evidencia (${sinEvid.error?.message}), con un actor que no es admin (${actorMalo.error?.message}) o sin motivo (${sinMotivo.error?.message})`);
    else bien("la base exige evidencia de Mercado Pago, un admin como actor y un motivo");

    // Pantalla: recepción no ve el botón; el admin sí.
    await recep.goto(`${BASE}/reservas/${reserva.id}/cobrar`, { waitUntil: "networkidle" });
    if (await recep.getByRole("button", { name: "Marcar como no recibido" }).count()) hallazgo("recepción ve «Marcar como no recibido»");
    else bien("recepción no ve «Marcar como no recibido»");

    // Mercado Pago SÍ tiene un pago aprobado del mismo monto → se niega.
    mock.busqueda = [{ id: "9000000000001", status: "approved", transaction_amount: 350.35, date_approved: new Date().toISOString(), date_created: new Date().toISOString(), payment_type_id: "debit_card" }];
    const antesDev = (await A.from("devoluciones").select("id", { count: "exact", head: true }).eq("negocio_id", H)).count;
    const marcarEnPantalla = async (motivo) => {
      await admin.goto(`${BASE}/reservas/${reserva.id}/cobrar`, { waitUntil: "networkidle" });
      const li = admin.locator(`li[data-cobro-id="${cobroA}"]`);
      await li.getByRole("button", { name: "Marcar como no recibido" }).click();
      await li.getByLabel("Motivo (obligatorio)").fill(motivo);
      await li.locator("[data-no-recibido]").getByRole("button", { name: "Marcar como no recibido" }).click();
      // Con éxito el cobro pasa a decir «Devuelto … No recibido: motivo»; si se niega, sale el aviso rojo.
      await Promise.race([li.locator("[role=alert]").first().waitFor({ timeout: 30_000 }), li.getByText(/No recibido:/).first().waitFor({ timeout: 30_000 })]);
      return (await li.locator("[role=alert]").count()) ? await li.locator("[role=alert]").first().innerText() : null;
    };
    const negado = await marcarEnPantalla("No se pasó ninguna tarjeta");
    if (!negado || !/SÍ tiene un pago/.test(negado) || (await A.from("devoluciones").select("id", { count: "exact", head: true }).eq("negocio_id", H)).count !== antesDev) hallazgo(`con un pago aprobado del mismo monto se marcó o no se explicó: ${negado}`);
    else bien(`con un pago aprobado que puede corresponder, se NIEGA y no cambia nada («${negado.slice(0, 80)}…»)`);

    // Sin pago aprobado → se marca: devolución «no_recibido» en el turno abierto y el saldo vuelve.
    mock.busqueda = [];
    const saldoAntes = await saldo();
    const turnoAntes = await resumenTurno(turnoAbierto.id);
    const ok1 = await marcarEnPantalla("No se pasó ninguna tarjeta");
    const dev = (await A.from("devoluciones").select("id, origen, motivo, turno_id, autorizado_por, devolucion_metodos(metodo, monto)").eq("negocio_id", H).eq("cobro_id", cobroA)).data ?? [];
    const corr = (await A.from("cobro_correcciones").select("tipo, motivo, devolucion_id, estado_anterior, evidencia, turno_efecto_id, hecha_por").eq("negocio_id", H).eq("cobro_id", cobroA)).data ?? [];
    if (corr[0] && corr[0].devolucion_id !== dev[0]?.id) hallazgo("la corrección no quedó ligada a su devolución");
    const saldoDespues = await saldo();
    if (ok1 || dev.length !== 1 || dev[0].origen !== "manual" || !dev[0].motivo.startsWith("No recibido:") || dev[0].turno_id !== turnoAbierto.id || Number(dev[0].devolucion_metodos[0].monto) !== 350.35) hallazgo(`«no recibido» no dejó la devolución en el turno abierto: ${ok1} ${JSON.stringify(dev)}`);
    else if (corr.length !== 1 || corr[0].hecha_por !== mAdm.profile_id || !corr[0].estado_anterior?.metodos || corr[0].evidencia?.mp_sin_pago_aprobado !== true) hallazgo(`el historial de la corrección no quedó (quién, estado anterior, evidencia): ${JSON.stringify(corr)}`);
    else bien(`sin pago aprobado: queda «no recibido» (devolución en el turno abierto, historial con quién, motivo, estado anterior y lo que dijo Mercado Pago)`);
    if (!(Math.abs(saldoDespues - (saldoAntes + 350.35)) < 0.01)) hallazgo(`la cuenta no recuperó el saldo: ${saldoAntes} → ${saldoDespues}`);
    else bien(`la cuenta vuelve a tener saldo para cobrarse (+$350.35: ${saldoAntes} → ${saldoDespues})`);
    if ((await resumenTurno(turnoAbierto.id)) === turnoAntes) hallazgo("el turno abierto no refleja que ese dinero ya no se cuenta por terminal");
    else bien("el turno abierto deja de contar ese monto como cobrado por terminal");
    const otraVez = await servicioH.rpc("cobro_marcar_no_recibido", { p_cobro_id: cobroA, p_motivo: "otra vez", p_actor: mAdm.profile_id, p_evidencia: { mp_sin_pago_aprobado: true } });
    if (!otraVez.error) hallazgo("se marcó dos veces como no recibido el mismo cobro");
    else bien("no se marca dos veces el mismo cobro");

    // Un cobro de un turno ya CERRADO: el efecto cae en el turno abierto; el cerrado no cambia.
    const { data: turnoCerrado } = await A.from("turnos_caja").select("*").eq("negocio_id", H).eq("estado", "cerrado").order("cerrado_at", { ascending: false }).limit(1).single();
    const cobroC = await nuevoCobroManual(120.2, turnoCerrado.id);
    const cerradoAntes = JSON.stringify({ t: (await A.from("turnos_caja").select("*").eq("negocio_id", H).eq("id", turnoCerrado.id).single()).data, devs: (await A.from("devoluciones").select("id").eq("negocio_id", H).eq("turno_id", turnoCerrado.id)).data, cortes: (await A.from("cortes_caja").select("*").eq("negocio_id", H).eq("turno_id", turnoCerrado.id)).data });
    const rC = await servicioH.rpc("cobro_marcar_no_recibido", { p_cobro_id: cobroC, p_motivo: "cobro de un turno cerrado", p_actor: mAdm.profile_id, p_evidencia: { mp_sin_pago_aprobado: true } });
    const devC = (await A.from("devoluciones").select("turno_id").eq("negocio_id", H).eq("cobro_id", cobroC)).data ?? [];
    const cerradoDespues = JSON.stringify({ t: (await A.from("turnos_caja").select("*").eq("negocio_id", H).eq("id", turnoCerrado.id).single()).data, devs: (await A.from("devoluciones").select("id").eq("negocio_id", H).eq("turno_id", turnoCerrado.id)).data, cortes: (await A.from("cortes_caja").select("*").eq("negocio_id", H).eq("turno_id", turnoCerrado.id)).data });
    if (rC.error || devC.length !== 1 || devC[0].turno_id !== turnoAbierto.id) hallazgo(`el efecto de un cobro de turno cerrado no cayó en el turno abierto: ${rC.error?.message} ${JSON.stringify(devC)}`);
    else if (cerradoAntes !== cerradoDespues) hallazgo("el turno CERRADO cambió (su fila, sus devoluciones o su corte)");
    else bien("cobro de un turno cerrado: el efecto cae en el turno abierto; el turno cerrado y su corte no cambian");

    // Con propina, integrado, mezclado y de otro negocio: se niega.
    const cobroP = await nuevoCobroManual(80);
    await A.from("cobro_metodos").update({ propina: 5 }).eq("negocio_id", H).eq("cobro_id", cobroP);
    const rP = await servicioH.rpc("cobro_marcar_no_recibido", { p_cobro_id: cobroP, p_motivo: "con propina", p_actor: mAdm.profile_id, p_evidencia: { mp_sin_pago_aprobado: true } });
    const { data: cobroInt } = await A.from("cobros").select("id").eq("negocio_id", H).eq("origen", "mercadopago_point").limit(1).single();
    const rI = await servicioH.rpc("cobro_marcar_no_recibido", { p_cobro_id: cobroInt.id, p_motivo: "integrado", p_actor: mAdm.profile_id, p_evidencia: { mp_sin_pago_aprobado: true } });
    const { data: cobroL } = await A.from("cobros").select("id").eq("negocio_id", ludogteka.id).limit(1).maybeSingle();
    const rL = cobroL ? await servicioH.rpc("cobro_marcar_no_recibido", { p_cobro_id: cobroL.id, p_motivo: "de otro negocio", p_actor: mAdm.profile_id, p_evidencia: { mp_sin_pago_aprobado: true } }) : { error: true };
    if (!rP.error || !rI.error || !rL.error) hallazgo(`se marcó un cobro con propina (${rP.error?.message}), integrado (${rI.error?.message}) o de otro negocio (${rL.error?.message ?? "PASÓ"})`);
    else bien("no se marca un cobro con propina, uno integrado (ese se devuelve con Mercado Pago) ni uno de otro negocio");
    // Recepción con su sesión: la función ni existe para ella; el historial lo ven admin y recepción, no estética ni el anónimo.
    const hist = async (cli) => ((await cli.from("cobro_correcciones").select("id")).data ?? []).length;
    if ((await hist(cEst)) !== 0 || (await hist(anonimo)) !== 0 || (await hist(cAdm)) === 0) hallazgo("el historial de correcciones se ve donde no debe o no se ve donde sí");
    else bien("el historial de correcciones lo ven admin y recepción; estética y el anónimo no");
  }

  console.log("\n4e. Conciliación con Mercado Pago (por hora): marca, no corrige");
  {
    const sinSecreto = await pedirApp(`plataforma.localhost:${PUERTO_APP}`, "/api/cron/conciliacion");
    if (sinSecreto.status !== 401) hallazgo(`el cron de conciliación sin secreto respondió ${sinSecreto.status}`);
    else bien("el cron de conciliación sin secreto → 401");
    const conc = async () => JSON.parse((await pedirApp(`plataforma.localhost:${PUERTO_APP}`, "/api/cron/conciliacion", { headers: { authorization: "Bearer mock-cron" } })).cuerpo);
    const { data: turnoAb } = await A.from("turnos_caja").select("id").eq("negocio_id", H).eq("estado", "abierto").limit(1).single();
    // Un cobro a mano con terminal, de hace una hora, sin pago en Mercado Pago (el caso de Ludogteka).
    const { data: cx } = await A.from("cobros").insert({ negocio_id: H, reserva_id: reserva.id, turno_id: turnoAb.id, origen: "manual", notas: "prueba conciliación" }).select("id").single();
    await A.from("cobro_metodos").insert({ negocio_id: H, cobro_id: cx.id, metodo: "terminal", monto: 350, propina: 0 });
    const hace1h = new Date(Date.now() - 3_600_000).toISOString();
    await A.from("cobros").update({ created_at: hace1h }).eq("negocio_id", H).eq("id", cx.id);
    // Y un pago aprobado en Mercado Pago que la caja no tiene.
    mock.busqueda = [{ id: "9100000000007", status: "approved", transaction_amount: 777.77, date_approved: hace1h, date_created: hace1h, payment_type_id: "debit_card" }];
    const r1 = await conc();
    const abiertas = (await A.from("conciliacion_terminal").select("tipo, clave, monto").eq("negocio_id", H).is("resuelta_at", null)).data ?? [];
    const sinPago = abiertas.find((a) => a.tipo === "cobro_sin_pago" && a.clave === cx.id);
    const sinCobro = abiertas.find((a) => a.tipo === "pago_sin_cobro" && a.clave === "9100000000007");
    if (!sinPago || !sinCobro) hallazgo(`la conciliación no marcó las dos diferencias: ${JSON.stringify(r1)} ${JSON.stringify(abiertas)}`);
    else bien("marca «cobrado en la app sin pago en Mercado Pago» y «pago de Mercado Pago sin cobro en la caja»");
    const { data: cobroIntacto } = await A.from("cobros").select("id, deleted_at").eq("negocio_id", H).eq("id", cx.id).single();
    if (cobroIntacto.deleted_at || (await A.from("devoluciones").select("id", { count: "exact", head: true }).eq("negocio_id", H).eq("cobro_id", cx.id)).count) hallazgo("la conciliación corrigió sola un cobro");
    else bien("no corrige nada: el cobro sigue como estaba");
    await recep.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
    if (!(await recep.getByText(/no aparece como pagado en Mercado Pago|diferencias entre la caja y Mercado Pago/).count())) hallazgo("la diferencia no sale en «Necesita atención»");
    else bien("sale en «Necesita atención» del negocio");
    await recep.goto(`${BASE}/caja/conciliacion`, { waitUntil: "networkidle" });
    if (!(await recep.locator("[data-conciliacion]").count())) hallazgo("/caja/conciliacion no lista las diferencias");
    else bien("/caja/conciliacion las lista con su antigüedad");
    const dos = await conc();
    const siguen = (await A.from("conciliacion_terminal").select("id", { count: "exact", head: true }).eq("negocio_id", H).is("resuelta_at", null)).count;
    if (siguen !== abiertas.length) hallazgo(`correr la conciliación otra vez duplicó diferencias: ${abiertas.length} → ${siguen} ${JSON.stringify(dos)}`);
    else bien("correrla otra vez no duplica");
    // Aparece el pago de $350 → la diferencia del cobro se resuelve sola.
    mock.busqueda.push({ id: "9100000000008", status: "approved", transaction_amount: 350, date_approved: hace1h, date_created: hace1h, payment_type_id: "debit_card" });
    await conc();
    const resuelta = (await A.from("conciliacion_terminal").select("resuelta_at").eq("negocio_id", H).eq("clave", cx.id).order("created_at", { ascending: false }).limit(1).single()).data;
    if (!resuelta.resuelta_at) hallazgo("la diferencia no se resolvió sola al aparecer el pago");
    else bien("cuando Mercado Pago muestra el pago, la diferencia se resuelve sola");
    // Aislamiento: la tabla no se ve ni se escribe desde fuera.
    const { data: mRecC } = await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "recepcion").is("deleted_at", null).limit(1).single();
    const cRecC = await sesion(mRecC.profile_id);
    const sync = await cRecC.rpc("conciliacion_sincronizar", { p_hallazgos: [], p_desde: hace1h, p_hasta: new Date().toISOString() });
    const revisada = await cRecC.rpc("conciliacion_dar_por_revisada", { p_id: sinCobro?.id ?? "00000000-0000-0000-0000-000000000000", p_nota: "intento de recepción" });
    if (!sync.error || !revisada.error) hallazgo(`recepción sincronizó la conciliación (${sync.error ? "no" : "SÍ"}) o la dio por revisada (${revisada.error ? "no" : "SÍ"})`);
    else bien("recepción no sincroniza ni da por revisada una diferencia (solo el servidor y el admin)");
    const { data: filasL } = await A.from("conciliacion_terminal").select("id").eq("negocio_id", ludogteka.id);
    if ((filasL ?? []).length) hallazgo("hay diferencias de conciliación en Ludogteka dev por esta prueba");
    mock.busqueda = [];
  }

  console.log("\n5. Webhooks que NO se aplican");
  const { data: resL } = await A.from("reservas").select("id").eq("negocio_id", ludogteka.id).limit(1).single();
  const { data: ordenL } = await A.from("mp_ordenes").insert({ negocio_id: ludogteka.id, tipo: "link", reserva_id: resL.id, monto: 55, estado: "creada", simulado: false, updated_at: new Date().toISOString() }).select("id").single();
  const pagoCruzado = `99${Date.now()}`;
  mock.pagos.set(pagoCruzado, { id: pagoCruzado, status: "approved", external_reference: ordenL.id, transaction_amount: 55, collector_id: CUENTA_MP });
  const cruzado = await webhookMp({ tipo: "payment", id: pagoCruzado });
  const { data: ordenL2 } = await A.from("mp_ordenes").select("estado, cobro_id").eq("id", ordenL.id).single();
  if (ordenL2.cobro_id || ordenL2.estado !== "creada" || cruzado.motivo !== "pago_a_orden_de_otro_negocio") hallazgo(`el pago cruzado se aplicó o no se reconoció: ${JSON.stringify(cruzado)} ${JSON.stringify(ordenL2)}`);
  else bien("un pago de la cuenta de Huellitas que apunta a una orden de Ludogteka se rechaza");
  await A.from("mp_ordenes").delete().eq("id", ordenL.id);
  const mala = await webhookMp({ tipo: "payment", id: pagoLink, secreto: "otro-secreto" });
  if (mala.status !== 401) hallazgo(`firma mala respondió ${mala.status}`);
  else bien("firma mala → 401");
  const ajena = await webhookMp({ tipo: "payment", id: pagoLink, cuenta: "123456" });
  if (ajena.motivo !== "cuenta_desconocida") hallazgo(`una cuenta que nadie conectó: ${JSON.stringify(ajena)}`);
  else bien("una cuenta de Mercado Pago que no es de ningún negocio → rechazada");

  console.log("\n6. Renovación del permiso (cron)");
  const sinSecreto = await pedirApp(`plataforma.localhost:${PUERTO_APP}`, "/api/cron/integraciones");
  if (sinSecreto.status !== 401) hallazgo(`el cron sin secreto respondió ${sinSecreto.status}`);
  const tokenAntes = JSON.parse(await secreto("mercadopago")).accessToken;
  const cron = JSON.parse((await pedirApp(`plataforma.localhost:${PUERTO_APP}`, "/api/cron/integraciones", { headers: { authorization: "Bearer mock-cron" } })).cuerpo);
  const tokenDespues = JSON.parse(await secreto("mercadopago")).accessToken;
  if (!cron.renovadas || tokenAntes === tokenDespues || mock.refrescos < 1) hallazgo(`no se renovó: ${JSON.stringify(cron)}`);
  else bien(`token renovado (vencía en 10 días; ahora ${(await fila("mercadopago")).token_expira_at.slice(0, 10)})`);

  console.log("\n7. Desconectar");
  await admin.goto(`${BASE}/admin/pagos`, { waitUntil: "networkidle" });
  // Una orden que se quedó en cola en la terminal al momento de desconectar.
  const mpEnCola = `ORD-COLA-${Date.now()}`;
  const { data: enCola } = await A.from("mp_ordenes")
    .insert({ negocio_id: H, proveedor: "mercadopago", tipo: "point", reserva_id: reserva.id, monto: 9, estado: "en_terminal", terminal_id: "NEWLAND_N950__N950NCB000777", cuenta_id: CUENTA_MP, mp_order_id: mpEnCola, simulado: false, expira_at: new Date(Date.now() + 600_000).toISOString(), updated_at: new Date().toISOString() })
    .select("id")
    .single();
  mock.guion.set(mpEnCola, { id: mpEnCola, status: "at_terminal", external_reference: enCola.id, user_id: CUENTA_MP, transactions: { payments: [{ status: "at_terminal", amount: "9.00" }] } });
  const terminalAntes = (await fila("mercadopago")).terminal_id;
  await admin.getByRole("button", { name: "Desconectar" }).click();
  await admin.getByText(/Se desconectó/).waitFor();
  const f7 = await fila("mercadopago");
  if (f7.estado !== "desconectada" || f7.cuenta_id || (await secreto("mercadopago"))) hallazgo("desconectar dejó credenciales o la cuenta");
  else bien("desconectado: Vault vacío y la cuenta ya no se reconoce en el webhook");
  const colaDespues = (await A.from("mp_ordenes").select("estado, cobro_id").eq("negocio_id", H).eq("id", enCola.id).single()).data;
  if (colaDespues.estado !== "cancelada" || colaDespues.cobro_id || !mock.cancelaciones.includes(mpEnCola)) hallazgo(`al desconectar, la orden en cola no se canceló en la app y en Mercado Pago: ${JSON.stringify(colaDespues)} ${mock.cancelaciones.includes(mpEnCola)}`);
  else bien("desconectar cancela las órdenes que se quedaron en cola (en la app y en Mercado Pago)");
  if (f7.terminal_previa_id !== terminalAntes) hallazgo(`la terminal de antes no quedó recordada para reconectar: ${f7.terminal_previa_id} / ${terminalAntes}`);
  // Reconectar la misma cuenta: la terminal vuelve sola y en modo integrado.
  await admin.getByRole("button", { name: "Conectar Mercado Pago" }).click();
  await admin.waitForURL(/mp=conectado|mp_error/, { timeout: 30_000 });
  const f7b = await fila("mercadopago");
  if (f7b.estado !== "conectada" || f7b.terminal_id !== terminalAntes) hallazgo(`al reconectar no volvió la terminal de antes: ${JSON.stringify({ e: f7b.estado, t: f7b.terminal_id, antes: terminalAntes })}`);
  else bien("reconectar la misma cuenta recupera la terminal de antes (y deja el modo integrado)");
  // Una orden atrasada de antes de reconectar no paga nada por su cuenta: aunque Mercado Pago la diera por procesada, entra solo con un pago aprobado verificado.
  const atrasada = `ORDATRASADA${Date.now()}`;
  const { data: oAtr } = await A.from("mp_ordenes")
    .insert({ negocio_id: H, proveedor: "mercadopago", tipo: "point", reserva_id: reserva.id, monto: 19, estado: "cancelada", terminal_id: terminalAntes, cuenta_id: CUENTA_MP, mp_order_id: atrasada, simulado: false, expira_at: new Date(Date.now() - 600_000).toISOString(), updated_at: new Date().toISOString() })
    .select("id")
    .single();
  mock.guion.set(atrasada, { id: atrasada, status: "processed", status_detail: "accredited", external_reference: oAtr.id, user_id: CUENTA_MP, transactions: { payments: [{ id: "PAY01ATRASADA", amount: "19.00", paid_amount: "19.00", status: "processed", status_detail: "accredited", reference_id: "9777000000001", payment_method: { type: "debit_card", installments: 1 } }] } });
  const wAtr = await webhookMp({ tipo: "order", id: atrasada });
  const eAtr = (await A.from("mp_ordenes").select("estado, cobro_id").eq("negocio_id", H).eq("id", oAtr.id).single()).data;
  if (eAtr.cobro_id || eAtr.estado === "pagada") hallazgo(`una orden atrasada sin pago verificable se dio por pagada: ${JSON.stringify(eAtr)} ${JSON.stringify(wAtr)}`);
  else bien(`una orden atrasada que Mercado Pago da por procesada pero sin pago aprobado que lo respalde queda «${eAtr.estado}», sin cobro`);

  console.log("\n8. Clip (credenciales contra el Clip de mentiras)");
  await admin.getByRole("radio", { name: /Clip/ }).click();
  await admin.getByLabel("API key").fill("clip-api-key-prueba");
  await admin.getByLabel("Clave secreta").fill("clip-secreto-prueba");
  await admin.getByLabel("Número de serie de la terminal").fill("P8XY12345");
  await admin.getByLabel("Correo del usuario de Clip").fill("caja@huellitas.test");
  await admin.getByRole("button", { name: "Conectar Clip" }).click();
  await admin.getByText(/Clip quedó conectado|No se pudo completar/).first().waitFor({ timeout: 30_000 });
  const fc = await fila("clip");
  if (fc?.estado !== "conectada" || !fc.webhook_token_hash) hallazgo(`Clip no quedó conectado: ${JSON.stringify(fc)}`);
  else {
    bien("Clip conectado (credenciales en Vault; en la tabla solo el hash del token del webhook)");
    const pagadoClip = await cobrarEnTerminal(88.8);
    const oc = await ordenPorMonto(88.8);
    if (!pagadoClip || !oc.cobro_id || oc.proveedor !== "clip") hallazgo(`el cobro con Clip no quedó: ${JSON.stringify(oc)}`);
    else {
      const { data: cobro } = await A.from("cobros").select("origen").eq("negocio_id", H).eq("id", oc.cobro_id).single();
      const c = await comisionDe(oc.id);
      bien(`cobro con Clip registrado (${cobro.origen}); comisión: ${c ? `${c.concepto} $${c.monto}` : "no la dio Clip"}`);
    }
    await admin.goto(`${BASE}/reservas/${reserva.id}/cobrar`, { waitUntil: "networkidle" });
    const liClip = admin.locator(`li[data-cobro-id="${oc.cobro_id}"]`);
    await liClip.getByRole("button", { name: "Registrar devolución" }).click();
    if (!(await liClip.getByText(/La devolución se hace en Clip/).count()) || (await liClip.getByRole("button", { name: "Devolver con Mercado Pago" }).count()))
      hallazgo("la devolución de un cobro de Clip no dice que se hace en Clip");
    else bien("devolver un cobro de Clip: la pantalla dice que se hace en Clip y aquí solo se registra (a mano)");
    const tokenClip = JSON.parse(await secreto("clip")).webhookToken;
    const wc = await pedirApp(`plataforma.localhost:${PUERTO_APP}`, `/api/clip/webhook/${tokenClip}`, { method: "POST", body: JSON.stringify({ reference: oc.id, status: "COMPLETED" }) });
    if (wc.status !== 200) hallazgo(`el webhook de Clip respondió ${wc.status}`);
    else bien("el webhook de Clip se reconoce por su token y no duplica");
    const wmal = await pedirApp(`plataforma.localhost:${PUERTO_APP}`, `/api/clip/webhook/token-que-no-existe-0000000`, { method: "POST", body: "{}" });
    if (wmal.status !== 404) hallazgo(`un token de Clip inventado respondió ${wmal.status}`);
    else bien("un token de Clip inventado → 404");
  }

  console.log("\n9. Negocio en prueba: simulación marcada");
  await limpiar();
  await A.from("negocios").update({ plan: "prueba" }).eq("id", H);
  await recep.goto(`${BASE}/reservas/${reserva.id}/cobrar`, { waitUntil: "networkidle" });
  if (!(await recep.getByText("Simulación: no mueve dinero").count())) hallazgo("en prueba no se marca «Simulación: no mueve dinero»");
  else bien("en prueba se ve «Simulación: no mueve dinero»");
  const simPagado = await cobrarEnTerminal(5.05);
  const os_ = await ordenPorMonto(5.05);
  if (!simPagado || !os_.simulado || !os_.cobro_id) hallazgo(`el cobro simulado en prueba no se registró: ${JSON.stringify(os_)}`);
  else {
    const { data: cobro } = await A.from("cobros").select("notas").eq("negocio_id", H).eq("id", os_.cobro_id).single();
    if (!cobro.notas.includes("SIMULADO")) hallazgo("el cobro simulado no dice SIMULADO");
    else bien(`cobro simulado registrado y marcado: «${cobro.notas}»`);
  }
  if (os_?.cobro_id) {
    await admin.goto(`${BASE}/reservas/${reserva.id}/cobrar`, { waitUntil: "networkidle" });
    const liSim = admin.locator(`li[data-cobro-id="${os_.cobro_id}"]`);
    await liSim.getByRole("button", { name: "Devolver con Mercado Pago" }).click();
    await liSim.getByLabel("Motivo").fill("Prueba simulada");
    await liSim.getByRole("button", { name: "Devolver con Mercado Pago" }).click();
    await liSim.locator("[role=alert], [role=status]").first().waitFor({ timeout: 30_000 });
    const dSim = (await A.from("devoluciones").select("motivo").eq("negocio_id", H).eq("cobro_id", os_.cobro_id)).data ?? [];
    if (dSim.length !== 1 || !dSim[0].motivo.includes("SIMULADO")) hallazgo(`la devolución simulada en prueba no quedó marcada: ${JSON.stringify(dSim)}`);
    else bien(`devolución simulada en prueba, marcada: «${dSim[0].motivo}»`);
  }
  await A.from("negocios").update({ plan: "activo" }).eq("id", H);
  await recep.goto(`${BASE}/reservas/${reserva.id}/cobrar`, { waitUntil: "networkidle" });
  if (await recep.locator("[data-cobro-integrado]").getByRole("button", { name: "Cobrar con terminal" }).count()) hallazgo("de vuelta en plan activo y sin cuenta conectada, se sigue ofreciendo la terminal");
  else bien("de vuelta en plan activo sin cuenta conectada: sin terminal (solo manual)");

  if (process.env.PROBAR_LEGADO === "1") {
    console.log("\n10. Ludogteka con su conexión anterior (llave del entorno)");
    const L = ludogteka.id;
    const ctxL = await nav.newContext();
    await ctxL.addCookies(await cookiesDe("recepcion", L, "ludogteka.localhost"));
    const recepL = await ctxL.newPage();
    const { data: resLud } = await A.from("reservas").select("id").eq("negocio_id", L).order("created_at", { ascending: false }).limit(1).single();
    const urlL = `http://ludogteka.localhost:${PUERTO_APP}/reservas/${resLud.id}/cobrar`;
    const monto = 31.31;
    const ok = await cobrarEnTerminal(monto, recepL, urlL);
    const { data: oL } = await A.from("mp_ordenes").select("id, cobro_id, terminal_id, simulado, cuenta_id").eq("negocio_id", L).eq("monto", monto).order("created_at", { ascending: false }).limit(1).single();
    if (!ok || !oL.cobro_id || oL.simulado || oL.terminal_id !== "NEWLAND_N950__LEGADO01") hallazgo(`Ludogteka no cobró con su conexión anterior: ${JSON.stringify(oL)}`);
    else bien("Ludogteka cobra en su terminal con la llave del entorno, como antes");
    // Un webhook firmado con el secreto de Ludogteka que apunta a una orden de Huellitas.
    const { data: resH } = await A.from("reservas").select("id").eq("negocio_id", H).limit(1).single();
    const { data: oH } = await A.from("mp_ordenes").insert({ negocio_id: H, tipo: "link", reserva_id: resH.id, monto: 44, estado: "creada", simulado: false, updated_at: new Date().toISOString() }).select("id").single();
    const pagoX = `95${Date.now()}`;
    mock.pagos.set(pagoX, { id: pagoX, status: "approved", external_reference: oH.id, transaction_amount: 44 });
    const wx = await webhookMp({ tipo: "payment", id: pagoX, secreto: "legado-whsec", host: `ludogteka.localhost:${PUERTO_APP}` });
    const { data: oH2 } = await A.from("mp_ordenes").select("cobro_id, estado").eq("negocio_id", H).eq("id", oH.id).single();
    if (oH2.cobro_id || wx.motivo !== "pago_a_orden_de_otro_negocio") hallazgo(`el secreto de Ludogteka alcanzó una orden de Huellitas: ${JSON.stringify(wx)}`);
    else bien("un webhook firmado con el secreto de Ludogteka no alcanza órdenes de otro negocio");
    await A.from("mp_ordenes").delete().eq("negocio_id", H).eq("id", oH.id);
    await ctxL.close();
  }
} catch (e) {
  hallazgo(`el recorrido tronó: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  await admin.screenshot({ path: "/tmp/integraciones-admin.png" }).catch(() => {});
  await recep.screenshot({ path: "/tmp/integraciones-recepcion.png" }).catch(() => {});
} finally {
  await limpiar();
  await nav.close();
  servidor.close();
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
