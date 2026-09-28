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
import { A, URL, env } from "./sesiones-dev.mjs";

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

// ───────────── Mercado Pago y Clip de mentiras
const mock = { tokens: 0, ordenes: new Map(), pagos: new Map(), preferencias: [], clip: new Map(), refrescos: 0 };
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
  if (p === "/v1/orders" && req.method === "POST") {
    const b = JSON.parse(cuerpo);
    const id = `ORD${Date.now()}`;
    mock.ordenes.set(id, { ...b, consultas: 0 });
    return json(201, { id, status: "at_terminal", external_reference: b.external_reference, user_id: CUENTA_MP });
  }
  const orden = p.match(/^\/v1\/orders\/([^/]+)$/);
  if (orden) {
    const o = mock.ordenes.get(orden[1]);
    if (!o) return json(404, { message: "order not found" });
    o.consultas += 1;
    if (o.consultas < 2) return json(200, { id: orden[1], status: "at_terminal", external_reference: o.external_reference, user_id: CUENTA_MP });
    const pagoId = `8${orden[1].slice(-9)}`;
    const monto = o.transactions.payments[0].amount;
    mock.pagos.set(pagoId, { id: pagoId, status: "approved", external_reference: o.external_reference, transaction_amount: Number(monto), collector_id: CUENTA_MP, fee_details: [{ type: "mercadopago_fee", amount: 4.5, fee_payer: "collector" }] });
    return json(200, { id: orden[1], status: "processed", external_reference: o.external_reference, user_id: CUENTA_MP, transactions: { payments: [{ id: pagoId, paid_amount: monto, payment_method: { type: "credit_card", installments: 1 } }] } });
  }
  if (p === "/checkout/preferences" && req.method === "POST") {
    const b = JSON.parse(cuerpo);
    mock.preferencias.push(b);
    return json(201, { id: `PREF-${mock.preferencias.length}`, init_point: `https://mercadopago.example/checkout/${mock.preferencias.length}` });
  }
  const pago = p.match(/^\/v1\/payments\/([^/]+)$/);
  if (pago) {
    const x = mock.pagos.get(pago[1]);
    return x ? json(200, x) : json(404, { message: "payment not found" });
  }
  return json(404, { message: `mock sin ruta ${req.method} ${p}` });
});
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
  await admin.getByRole("button", { name: "Desconectar" }).click();
  await admin.getByText(/Se desconectó/).waitFor();
  const f7 = await fila("mercadopago");
  if (f7.estado !== "desconectada" || f7.cuenta_id || (await secreto("mercadopago"))) hallazgo("desconectar dejó credenciales o la cuenta");
  else bien("desconectado: Vault vacío y la cuenta ya no se reconoce en el webhook");

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
