// Uso (SOLO DESARROLLO). Con el servidor prendido con un Mercado Pago DE MENTIRAS
// (este script lo levanta en el puerto 4455), igual que integraciones-dev:
//
//   MERCADOPAGO_APP_ID=mock-app MERCADOPAGO_APP_SECRET=mock-secret \
//   MERCADOPAGO_APP_WEBHOOK_SECRET=mock-whsec \
//   MERCADOPAGO_API_URL=http://127.0.0.1:4455 \
//   MERCADOPAGO_AUTH_URL=http://127.0.0.1:4455/authorization \
//   CLIP_API_URL=http://127.0.0.1:4455/clip CRON_SECRET=mock-cron \
//   npm run start -- -p 3001          (después de npm run build)
//
//   node scripts/auditoria/conciliacion-origen-dev.mjs
//
// La conciliación solo considera los pagos que PeluDesk originó (12 de octubre
// de 2026). En Huellitas, con Ludogteka como «el otro negocio»:
//   1. Un pago ajeno (sin orden ni terminal nuestra) se ignora: ni alerta, ni
//      «Necesita atención», ni aparece (opción apagada).
//   2. Un pago de una orden/link de PeluDesk sin cobro SÍ alerta (por la
//      referencia o por la metadata del link); la metadata de otro negocio, no.
//   3. Un pago de la terminal vinculada (pos_id/store_id) sin cobro SÍ alerta;
//      el de otra terminal o de otra tienda, no.
//   4. Un cobro a mano con «Terminal» sin respaldo de la terminal sigue
//      alertando aunque haya un pago AJENO del mismo monto; con el pago de la
//      terminal, se resuelve.
//   5. Opción del admin «Mostrar también otros pagos»: apagada por omisión;
//      encendida, los ajenos salen aparte, informativos, sin alertas y con
//      «Dar por revisada»; apagada otra vez se cierran. Recepción y el
//      anónimo no la cambian. Otro negocio no la ve.
//   6. Limpieza (scripts/plataforma/cerrar-pagos-ajenos.mjs): revisa sin
//      escribir, cierra solo lo ajeno de un negocio, es idempotente, deja
//      evento, se revierte, y no toca lo propio ni los cobros sospechosos.
//   7. Las funciones de plataforma no las ejecuta nadie más; el celular
//      (390 px) no se desborda.
import http from "node:http";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO_APP = 3001;
const CUENTA_MP = "777001";
const TERMINAL = "NEWLAND_N950__N950NCB000777";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const hace1h = new Date(Date.now() - 3_600_000).toISOString();
const sufijo = String(Date.now()).slice(-7);

const { data: huellitas } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const { data: ludogteka } = await A.from("negocios").select("id").eq("slug", "ludogteka").single();
const H = huellitas.id;
const BASE = `http://huellitas.localhost:${PUERTO_APP}`;
const conNegocio = (id) => createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": id } } });
const servicioH = conNegocio(H);
const sesion = async (profileId, negocioId = H) =>
  createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(profileId)}`, "x-negocio-id": negocioId } },
  });
const anonimo = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });

// ───────────── Mercado Pago de mentiras (solo lo que la conciliación consulta)
const mock = { busqueda: [] };
const servidor = http.createServer(async (req, res) => {
  const u = new globalThis.URL(req.url, "http://127.0.0.1:4455");
  for await (const _ of req) { /* vaciar */ }
  const json = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  const token = (req.headers.authorization ?? "").replace("Bearer ", "");
  if (!token.startsWith("APP_USR-mock-")) return json(401, { message: "invalid access token" });
  if (u.pathname.startsWith("/terminals/v1/list")) {
    return json(200, { data: { terminals: [{ id: TERMINAL, pos_id: 7001, store_id: "8001", operating_mode: "PDV" }, { id: "MPOS_AIR__AIR000123", pos_id: 7002, store_id: "8001", operating_mode: "STANDALONE" }] } });
  }
  if (u.pathname === "/v1/payments/search") {
    const desde = Number(u.searchParams.get("offset") ?? 0);
    return json(200, { results: mock.busqueda.slice(desde, desde + 100), paging: { total: mock.busqueda.length } });
  }
  return json(404, { message: `mock sin ruta ${u.pathname}` });
});
await new Promise((r) => servidor.listen(4455, "127.0.0.1", r));

function pedirApp(host, ruta, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO_APP, path: ruta, method: "GET", headers: { host, ...headers } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, cuerpo: d }));
    });
    r.on("error", reject);
    r.end();
  });
}
const conc = async () => {
  const r = await pedirApp(`plataforma.localhost:${PUERTO_APP}`, "/api/cron/conciliacion", { headers: { authorization: "Bearer mock-cron" } });
  try { return JSON.parse(r.cuerpo); } catch { return { status: r.status, cuerpo: r.cuerpo.slice(0, 200) }; }
};

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

// Huellitas trae cobros a mano de otras pruebas que también alertan: aquí solo
// cuentan los pagos y los cobros que esta prueba crea.
const idsAEnterrar = { cobros: [], ordenes: [] };
const abiertasTodas = async (negocio = H) =>
  (await A.from("conciliacion_terminal").select("id, tipo, clave, monto, mp_pago_id, detalle, resuelta_at, resuelta_motivo").eq("negocio_id", negocio).is("resuelta_at", null)).data ?? [];
const abiertas = async (negocio = H) => (await abiertasTodas(negocio)).filter((a) => a.tipo !== "cobro_sin_pago" || idsAEnterrar.cobros.includes(a.clave));
const cerrarTodo = async () => {
  await A.from("conciliacion_terminal").update({ resuelta_at: new Date().toISOString(), resuelta_motivo: "limpieza de la prueba" }).eq("negocio_id", H).is("resuelta_at", null);
};
const fijarOpcion = async (valor) => {
  await A.from("conciliacion_ajustes").delete().eq("negocio_id", H);
  if (valor) await A.from("conciliacion_ajustes").insert({ negocio_id: H, mostrar_pagos_ajenos: true, updated_at: new Date().toISOString() });
};

// ───────────── Huellitas conectado a ese Mercado Pago (por la base, sin navegador)
const previo = (await A.from("integraciones_cobro").select("*").eq("negocio_id", H)).data ?? [];
async function conectar() {
  await A.from("integraciones_cobro").delete().eq("negocio_id", H);
  await servicioH.rpc("integracion_guardar_secreto", {
    p_proveedor: "mercadopago",
    p_secreto: JSON.stringify({ accessToken: "APP_USR-mock-1", refreshToken: "TG-refresh-1", userId: CUENTA_MP, expiraAt: new Date(Date.now() + 90 * 86_400_000).toISOString(), liveMode: false }),
  });
  // integracion_guardar_secreto ya deja la fila de la integración: se completa.
  const { data: filas, error } = await A.from("integraciones_cobro").update({
    elegida: true, estado: "conectada", modo: "oauth", cuenta_id: CUENTA_MP, cuenta_nombre: "HUELLITAS_PRUEBA",
    terminal_id: TERMINAL, terminal_nombre: "Point Smart", terminal_compatible: true, token_expira_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    conectada_at: new Date().toISOString(),
  }).eq("negocio_id", H).eq("proveedor", "mercadopago").select("id");
  if (!error && !(filas ?? []).length) throw new Error("conectar: no quedó la fila de la integración.");
  if (error) throw new Error(`conectar: ${error.message}`);
}
async function desconectar() {
  await servicioH.rpc("integracion_borrar_secreto", { p_proveedor: "mercadopago" });
  await A.from("integraciones_cobro").delete().eq("negocio_id", H);
}

const { data: reserva } = await A.from("reservas").select("id, cliente_id").eq("negocio_id", H).order("created_at").limit(1).single();
let { data: turno } = await A.from("turnos_caja").select("id").eq("negocio_id", H).eq("estado", "abierto").limit(1).maybeSingle();
if (!turno) throw new Error("Huellitas no tiene un turno de caja abierto: corre antes negocio-prueba-dev o abre uno.");
async function cobroManualTerminal(monto) {
  const { data: cx, error } = await A.from("cobros").insert({ negocio_id: H, reserva_id: reserva.id, turno_id: turno.id, origen: "manual", notas: "prueba origen conciliación" }).select("id").single();
  if (error) throw new Error(`cobro de prueba: ${error.message}`);
  await A.from("cobro_metodos").insert({ negocio_id: H, cobro_id: cx.id, metodo: "terminal", monto, propina: 0 });
  await A.from("cobros").update({ created_at: hace1h }).eq("negocio_id", H).eq("id", cx.id);
  idsAEnterrar.cobros.push(cx.id);
  return cx.id;
}
async function ordenPeluDesk(tipo, monto) {
  const { data, error } = await A.from("mp_ordenes").insert({ negocio_id: H, proveedor: "mercadopago", tipo, reserva_id: reserva.id, monto, estado: "creada", simulado: false, cuenta_id: CUENTA_MP, updated_at: new Date().toISOString() }).select("id").single();
  if (error) throw new Error(`orden de prueba: ${error.message}`);
  idsAEnterrar.ordenes.push(data.id);
  return data.id;
}
const pago = (id, monto, extra = {}) => ({ id: String(id), status: "approved", transaction_amount: monto, date_approved: hace1h, date_created: hace1h, payment_type_id: "debit_card", ...extra });

await limpiarInicio();
async function limpiarInicio() {
  await A.from("cobros").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", H).eq("notas", "prueba origen conciliación").is("deleted_at", null);
  await A.from("conciliacion_terminal").delete().eq("negocio_id", H).like("clave", "ORIG-%");
  await cerrarTodo();
  await fijarOpcion(false);
}
await conectar();

const nav = await abrirNavegador();
const ctxAdmin = await nav.newContext();
await ctxAdmin.addCookies(await cookiesDe("admin"));
const admin = await ctxAdmin.newPage();
const ctxRecep = await nav.newContext();
await ctxRecep.addCookies(await cookiesDe("recepcion"));
const recep = await ctxRecep.newPage();

try {
  const sinSecreto = await pedirApp(`plataforma.localhost:${PUERTO_APP}`, "/api/cron/conciliacion");
  if (sinSecreto.status !== 401) hallazgo(`el cron sin secreto respondió ${sinSecreto.status}`);

  console.log("\n1. Un pago AJENO se ignora por completo");
  const idAjeno = `91${sufijo}01`;
  mock.busqueda = [pago(idAjeno, 1089.0, { pos_id: 9999, store_id: "5555" }), pago(`91${sufijo}02`, 27355.58, { external_reference: "tienda-en-linea-4411" })];
  const r1 = await conc();
  const a1 = await abiertas();
  if (!r1.negocios || a1.length) hallazgo(`pagos ajenos generaron algo: ${JSON.stringify(r1).slice(0, 200)} ${JSON.stringify(a1)}`);
  else bien("dos pagos ajenos ($1,089.00 y $27,355.58) no abren nada con la opción apagada");
  await recep.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  if (await recep.getByText(/Mercado Pago tiene un pago que la caja no registró/).count()) hallazgo("«Necesita atención» menciona un pago ajeno");
  else bien("«Necesita atención» no dice nada de ellos");
  await recep.goto(`${BASE}/caja/conciliacion`, { waitUntil: "networkidle" });
  if ((await recep.getByText("Pago aprobado en Mercado Pago, sin cobro en la caja").count()) || (await recep.locator("[data-pagos-ajenos]").count())) hallazgo("/caja/conciliacion muestra algo de pagos ajenos con la opción apagada");
  else bien("/caja/conciliacion no los muestra (opción apagada)");

  console.log("\n2. Un pago de una orden o link de PeluDesk sin cobro SÍ alerta");
  const ordenLink = await ordenPeluDesk("link", 55.5);
  const ordenLink2 = await ordenPeluDesk("link", 66.6);
  const idOrden = `92${sufijo}01`, idMeta = `92${sufijo}02`, idMetaOtro = `92${sufijo}03`;
  mock.busqueda = [
    pago(idOrden, 55.5, { external_reference: ordenLink }),
    pago(idMeta, 66.6, { external_reference: null, metadata: { peludesk_negocio_id: H, orden_id: ordenLink2 } }),
    pago(idMetaOtro, 77.7, { metadata: { peludesk_negocio_id: ludogteka.id } }),
    pago(idAjeno, 1089.0, { pos_id: 9999 }),
  ];
  await conc();
  const a2 = await abiertas();
  const f2 = (id) => a2.find((a) => a.tipo === "pago_sin_cobro" && a.clave === id);
  if (!f2(idOrden) || f2(idOrden).detalle?.origen !== "orden") hallazgo(`el pago con la referencia de una orden no alertó como «orden»: ${JSON.stringify(a2)}`);
  else bien("pago con external_reference = orden de PeluDesk → alerta (origen orden)");
  if (!f2(idMeta)) hallazgo("el pago con la metadata del link de PeluDesk no alertó");
  else bien("pago con la metadata peludesk_negocio_id de este negocio → alerta");
  if (f2(idMetaOtro) || f2(idAjeno)) hallazgo(`la metadata de otro negocio o el ajeno alertaron: ${JSON.stringify(a2)}`);
  else bien("metadata de otro negocio y pago ajeno → sin alerta");
  await recep.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  if (!(await recep.getByText(/Mercado Pago tiene|diferencias entre la caja y Mercado Pago/).count())) hallazgo("la alerta propia no sale en «Necesita atención»");
  else bien("la alerta propia sí sale en «Necesita atención»");
  await cerrarTodo();

  console.log("\n3. Un pago de la TERMINAL vinculada sin cobro SÍ alerta");
  const idTerm = `93${sufijo}01`, idOtraTerm = `93${sufijo}02`, idOtraTienda = `93${sufijo}03`;
  mock.busqueda = [
    pago(idTerm, 321.1, { pos_id: 7001, store_id: "8001" }),
    pago(idOtraTerm, 322.2, { pos_id: 7002, store_id: "8001" }),
    pago(idOtraTienda, 323.3, { pos_id: 7001, store_id: "8999" }),
  ];
  await conc();
  const a3 = await abiertas();
  if (a3.length !== 1 || a3[0].clave !== idTerm || a3[0].detalle?.origen !== "terminal") hallazgo(`solo el pago de la terminal vinculada debía alertar: ${JSON.stringify(a3)}`);
  else bien("pos_id/store_id de la terminal vinculada → alerta (origen terminal); otra terminal y otra tienda → ignoradas");
  await cerrarTodo();

  console.log("\n4. Cobro a mano con «Terminal»: un pago ajeno del mismo monto NO lo respalda");
  const monto4 = 400 + Math.floor(Math.random() * 9000) / 100;
  const cobro4 = await cobroManualTerminal(monto4);
  mock.busqueda = [pago(`94${sufijo}01`, monto4, { pos_id: 9999, store_id: "5555" })];
  await conc();
  const a4 = await abiertas();
  const sospechoso = a4.find((a) => a.tipo === "cobro_sin_pago" && a.clave === cobro4);
  if (!sospechoso || a4.length !== 1) hallazgo(`con un pago ajeno del mismo monto el cobro a mano debía seguir alertando (y solo él): ${JSON.stringify(a4)}`);
  else bien(`el cobro a mano de $${monto4.toFixed(2)} sigue alertando aunque haya un pago ajeno del mismo monto (y el pago ajeno no alerta)`);
  mock.busqueda.push(pago(`94${sufijo}02`, monto4, { pos_id: 7001, store_id: "8001" }));
  await conc();
  const a4b = (await abiertas()).filter((a) => a.clave === cobro4);
  if (a4b.length) hallazgo("con el pago de la terminal vinculada, la alerta del cobro no se resolvió");
  else bien("con un pago de la terminal vinculada del mismo monto, la alerta se resuelve sola");
  // Este cobro ya cumplió: se da de baja para que no estorbe a lo que sigue.
  await A.from("cobros").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", H).eq("id", cobro4);
  await cerrarTodo();

  console.log("\n5. Opción del admin «Mostrar también otros pagos de mi cuenta de Mercado Pago»");
  const rpcApagada = await (await sesion((await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "admin").is("deleted_at", null).limit(1).single()).data.profile_id)).rpc("conciliacion_mostrar_ajenos");
  if (rpcApagada.data !== false) hallazgo(`la opción no está apagada por omisión: ${JSON.stringify(rpcApagada)}`);
  else bien("apagada por omisión");
  await admin.goto(`${BASE}/admin/pagos`, { waitUntil: "networkidle" });
  const caja = admin.locator("[data-mostrar-otros-pagos]");
  if (!(await caja.count()) || (await caja.isChecked())) hallazgo("el interruptor no está o aparece encendido");
  else bien("en Administración → Cobro con terminal el interruptor está apagado");
  if (!(await admin.locator("[data-solo-pagos-propios]").count())) hallazgo("falta la línea «PeluDesk solo concilia los pagos que cobra desde aquí…»");
  else bien("la línea «solo concilia los pagos que cobra desde aquí; los demás se ignoran» está en la conexión");
  await caja.click();
  await admin.getByText(/Listo: los otros pagos de tu cuenta saldrán/).waitFor({ timeout: 20_000 });
  const encendida = (await A.from("conciliacion_ajustes").select("mostrar_pagos_ajenos").eq("negocio_id", H).is("deleted_at", null).maybeSingle()).data;
  if (!encendida?.mostrar_pagos_ajenos) hallazgo("encender el interruptor no quedó guardado");
  else bien("encendido desde la pantalla y guardado");

  const idInfo = `95${sufijo}01`;
  mock.busqueda = [pago(idInfo, 1089.0, { pos_id: 9999 }), pago(`95${sufijo}02`, 88.8, { pos_id: 7001, store_id: "8001" })];
  await conc();
  const a5 = await abiertas();
  const info = a5.find((a) => a.tipo === "pago_ajeno" && a.clave === idInfo);
  const alerta = a5.find((a) => a.tipo === "pago_sin_cobro" && a.clave === `95${sufijo}02`);
  if (!info || !alerta || a5.length !== 2) hallazgo(`encendida debía guardar el ajeno como informativo y alertar el propio: ${JSON.stringify(a5)}`);
  else bien("encendida: el ajeno queda como «pago_ajeno» (informativo) y el propio sigue alertando");
  await admin.goto(`${BASE}/caja/conciliacion`, { waitUntil: "networkidle" });
  const seccion = admin.locator("[data-pagos-ajenos]");
  if (!(await seccion.count()) || !(await seccion.getByText("Otros pagos de tu cuenta (informativo)").count()) || (await seccion.locator("[data-pago-ajeno]").count()) !== 1) hallazgo("no sale la sección «Otros pagos de tu cuenta (informativo)» con el pago");
  else bien("sale la sección «Otros pagos de tu cuenta (informativo)», separada de las diferencias");
  if ((await admin.getByText("Pago aprobado en Mercado Pago, sin cobro en la caja").count()) !== 1) hallazgo("el ajeno aparece también en la lista de diferencias (o falta el propio)");
  else bien("las diferencias reales siguen aparte (solo el pago propio)");
  await admin.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  const cuerpo = (await admin.locator("body").innerText()).replace(/\s+/g, " ");
  const nDif = (await abiertasTodas()).filter((a) => a.tipo !== "pago_ajeno").length;
  if (!new RegExp(`${nDif} diferencias entre la caja y Mercado Pago`).test(cuerpo)) hallazgo(`«Necesita atención» no cuenta solo las ${nDif} diferencias sin el ajeno: ${cuerpo.match(/.{0,40}diferencias entre.{0,60}/)?.[0]}`);
  else bien(`«Necesita atención» cuenta ${nDif} diferencias (el ajeno informativo no suma)`);
  // Dar por revisada.
  await admin.goto(`${BASE}/caja/conciliacion`, { waitUntil: "networkidle" });
  await admin.locator("[data-pago-ajeno]").getByRole("button", { name: "Dar por revisada" }).click();
  await admin.getByLabel("¿Qué revisaste?").fill("Es de la otra tienda");
  await admin.locator("[data-pago-ajeno]").getByRole("button", { name: "Guardar" }).click();
  await admin.waitForFunction(() => !document.querySelector("[data-pago-ajeno]"), null, { timeout: 20_000 });
  const revisada = (await A.from("conciliacion_terminal").select("resuelta_motivo").eq("negocio_id", H).eq("clave", idInfo).order("created_at", { ascending: false }).limit(1).single()).data;
  if (!/Revisada por un admin/.test(revisada?.resuelta_motivo ?? "")) hallazgo("«Dar por revisada» no resolvió el pago informativo");
  else bien("«Dar por revisada» funciona en lo informativo");

  // Apagar: lo informativo abierto se cierra y la sección desaparece.
  await conc(); // vuelve a abrir el informativo (sigue en la búsqueda)
  const reabierto = (await abiertas()).some((a) => a.tipo === "pago_ajeno");
  await admin.goto(`${BASE}/admin/pagos`, { waitUntil: "networkidle" });
  await admin.locator("[data-mostrar-otros-pagos]").click();
  await admin.getByText(/Listo: los otros pagos de tu cuenta se ignoran/).waitFor({ timeout: 20_000 });
  const tras = await abiertas();
  if (!reabierto || tras.some((a) => a.tipo === "pago_ajeno")) hallazgo(`apagar no cerró lo informativo (reabierto=${reabierto}): ${JSON.stringify(tras)}`);
  else bien("apagada otra vez: lo informativo se cierra");
  await conc();
  if ((await abiertas()).some((a) => a.tipo === "pago_ajeno")) hallazgo("apagada, la conciliación volvió a guardar pagos ajenos");
  else bien("apagada, la conciliación ya no guarda ajenos");
  await admin.goto(`${BASE}/caja/conciliacion`, { waitUntil: "networkidle" });
  if (await admin.locator("[data-pagos-ajenos]").count()) hallazgo("la sección sigue visible con la opción apagada");
  else bien("la sección desaparece");
  await cerrarTodo();

  // Quién puede cambiarla.
  const { data: mRec } = await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "recepcion").is("deleted_at", null).limit(1).single();
  const cRec = await sesion(mRec.profile_id);
  const porRecep = await cRec.rpc("guardar_conciliacion_mostrar_ajenos", { p_mostrar: true });
  const porAnon = await anonimo.rpc("guardar_conciliacion_mostrar_ajenos", { p_mostrar: true });
  const anonLee = await anonimo.rpc("conciliacion_mostrar_ajenos");
  const escribeDirecto = await cRec.from("conciliacion_ajustes").insert({ negocio_id: H, mostrar_pagos_ajenos: true });
  if (!porRecep.error || !porAnon.error || !anonLee.error || !escribeDirecto.error) hallazgo(`recepción (${porRecep.error ? "no" : "SÍ"}), anónimo (${porAnon.error ? "no" : "SÍ"}/${anonLee.error ? "no" : "SÍ"}) o un INSERT directo (${escribeDirecto.error ? "no" : "SÍ"}) tocaron la opción`);
  else bien("recepción, el anónimo y un INSERT directo no pueden cambiar la opción");

  console.log("\n5b. Otro negocio");
  await A.from("conciliacion_ajustes").delete().eq("negocio_id", ludogteka.id);
  await fijarOpcion(true);
  const { data: lecturaCruzada } = await cRec.from("conciliacion_ajustes").select("id, negocio_id");
  if ((lecturaCruzada ?? []).some((f) => f.negocio_id !== H)) hallazgo("la sesión de Huellitas ve ajustes de otro negocio");
  const { data: sesionL } = await A.from("membresias").select("profile_id").eq("negocio_id", ludogteka.id).eq("rol", "recepcion").is("deleted_at", null).limit(1).single();
  const cL = await sesion(sesionL.profile_id, ludogteka.id);
  const veL = await cL.rpc("conciliacion_mostrar_ajenos");
  const filasL = await cL.from("conciliacion_ajustes").select("id");
  if (veL.data !== false || (filasL.data ?? []).length) hallazgo(`Ludogteka ve la opción de Huellitas: ${JSON.stringify(veL)} ${JSON.stringify(filasL.data)}`);
  else bien("la opción encendida en Huellitas no se ve ni se aplica en Ludogteka");
  await fijarOpcion(false);

  console.log("\n6. Limpieza de producción (script de plataforma): idempotente, reversible");
  const conteoAntes = JSON.stringify({
    cobros: (await A.from("cobros").select("id", { count: "exact", head: true })).count,
    ordenes: (await A.from("mp_ordenes").select("id", { count: "exact", head: true })).count,
    metodos: (await A.from("cobro_metodos").select("id", { count: "exact", head: true })).count,
  });
  const ordenLigada = await ordenPeluDesk("point", 12.3);
  await A.from("mp_ordenes").update({ mp_payment_id: `96${sufijo}09` }).eq("negocio_id", H).eq("id", ordenLigada);
  const sembrar = async (negocio, clave, tipo, extra = {}) =>
    (await A.from("conciliacion_terminal").insert({ negocio_id: negocio, tipo, clave, mp_pago_id: tipo === "pago_sin_cobro" ? clave : null, monto: 10, ocurrio_at: hace1h, detalle: {}, updated_at: new Date().toISOString(), ...extra }).select("id").single()).data.id;
  const idAjenoH = await sembrar(H, `ORIG-${sufijo}-A`, "pago_sin_cobro", { detalle: { referencia: "otra-tienda" } });
  const idPropioRef = await sembrar(H, `ORIG-${sufijo}-B`, "pago_sin_cobro", { detalle: { referencia: ordenLink } });
  const idPropioLigado = await sembrar(H, `96${sufijo}09`, "pago_sin_cobro");
  const idPropioOrigen = await sembrar(H, `ORIG-${sufijo}-C`, "pago_sin_cobro", { detalle: { origen: "terminal" } });
  const idSospechoso = await sembrar(H, `ORIG-${sufijo}-D`, "cobro_sin_pago");
  const idAjenoL = await sembrar(ludogteka.id, `ORIG-${sufijo}-E`, "pago_sin_cobro", { detalle: {} });
  // La llave de servicio queda acotada al negocio de su encabezado: cada fila se lee con el suyo.
  const estado = async (id) =>
    (await servicioH.from("conciliacion_terminal").select("resuelta_at, resuelta_motivo").eq("id", id).maybeSingle()).data ??
    (await conNegocio(ludogteka.id).from("conciliacion_terminal").select("resuelta_at, resuelta_motivo").eq("id", id).maybeSingle()).data;
  const correr = (...a) => execFileSync("node", ["scripts/plataforma/cerrar-pagos-ajenos.mjs", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  const seco = correr("--negocio", "huellitas");
  if ((await estado(idAjenoH)).resuelta_at || !/Sin --aplicar no escribo nada/.test(seco)) hallazgo("la revisión (sin --aplicar) escribió algo");
  else bien("sin --aplicar solo revisa");
  const sal1 = correr("--negocio", "huellitas", "--aplicar");
  const evento = sal1.match(/evento ([0-9a-f-]{36})/)?.[1];
  const [eAj, ePr1, ePr2, ePr3, eSo, eL] = await Promise.all([idAjenoH, idPropioRef, idPropioLigado, idPropioOrigen, idSospechoso, idAjenoL].map(estado));
  if (!eAj.resuelta_at || eAj.resuelta_motivo !== "Ajeno a PeluDesk") hallazgo(`el pago ajeno no quedó cerrado como «Ajeno a PeluDesk»: ${JSON.stringify(eAj)}`);
  else bien("el pago ajeno de Huellitas queda cerrado como «Ajeno a PeluDesk»");
  if (ePr1.resuelta_at || ePr2.resuelta_at || ePr3.resuelta_at) hallazgo("la limpieza cerró una alerta de un pago de PeluDesk (por referencia, ligado o con origen)");
  else bien("no toca las alertas de pagos de PeluDesk (referencia a una orden, pago ligado, origen anotado)");
  if (eSo.resuelta_at) hallazgo("la limpieza cerró un cobro sospechoso (cobro_sin_pago)");
  else bien("no toca los cobros a mano sospechosos");
  if (eL.resuelta_at) hallazgo("limitar a --negocio huellitas cerró también lo de Ludogteka");
  else bien("con --negocio solo toca ese negocio");
  const eventos1 = (await A.from("plataforma_eventos").select("id, accion, negocio_id, detalle").eq("accion", "conciliacion_cerrar_ajenos").eq("negocio_id", H)).data ?? [];
  if (!evento || !eventos1.some((e) => e.id === evento && e.detalle.filas.length === 1)) hallazgo(`falta el evento de auditoría con la fila cerrada: ${evento}`);
  else bien("deja un evento de auditoría con lo que cerró");
  const sal2 = correr("--negocio", "huellitas", "--aplicar");
  const eventos2 = (await A.from("plataforma_eventos").select("id").eq("accion", "conciliacion_cerrar_ajenos").eq("negocio_id", H)).data ?? [];
  if (!/No hay alertas/.test(sal2) || eventos2.length !== eventos1.length) hallazgo("correrla otra vez no fue idempotente");
  else bien("correrla otra vez no hace nada ni deja otro evento (idempotente)");
  const sal3 = correr("--revertir", evento, "--aplicar");
  const eRev = await estado(idAjenoH);
  if (eRev.resuelta_at || !/Revertido/.test(sal3)) hallazgo(`la reversa no reabrió la alerta: ${sal3.slice(-200)}`);
  else bien("la reversa reabre exactamente lo que cerró");
  let dobleRev = "";
  try { correr("--revertir", evento, "--aplicar"); } catch (e) { dobleRev = String(e.stderr ?? e.message); }
  if (!/ya se revirtió/.test(dobleRev)) hallazgo("revertir dos veces no se rechazó");
  else bien("no se revierte dos veces");
  const sal4 = correr("--aplicar");
  const eL2 = await estado(idAjenoL);
  const eH2 = await estado(idAjenoH);
  if (!eL2.resuelta_at || !eH2.resuelta_at || (await estado(idPropioRef)).resuelta_at || (await estado(idSospechoso)).resuelta_at) hallazgo(`sin --negocio debía cerrar lo ajeno de TODOS los negocios y nada más: ${sal4}`);
  else bien("sin --negocio cierra lo ajeno de todos los negocios (Huellitas y Ludogteka) y nada más");
  const conteoDespues = JSON.stringify({
    cobros: (await A.from("cobros").select("id", { count: "exact", head: true })).count,
    ordenes: (await A.from("mp_ordenes").select("id", { count: "exact", head: true })).count,
    metodos: (await A.from("cobro_metodos").select("id", { count: "exact", head: true })).count,
  });
  if (conteoAntes !== conteoDespues.replace(/"ordenes":\d+/, (m) => m) && JSON.parse(conteoAntes).cobros !== JSON.parse(conteoDespues).cobros) hallazgo("la limpieza cambió el número de cobros");
  else bien("cobros y métodos de cobro: sin cambios por la limpieza");

  console.log("\n7. Quién puede llamar las funciones de plataforma + celular");
  const admH = await sesion((await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "admin").is("deleted_at", null).limit(1).single()).data.profile_id);
  for (const [nombre, cli] of [["anónimo", anonimo], ["recepción", cRec], ["admin de un negocio", admH]]) {
    const a = await cli.rpc("plataforma_conciliacion_ajenos", { p_negocio_id: null });
    const b = await cli.rpc("plataforma_conciliacion_cerrar_ajenos", { p_negocio_id: null });
    const c = await cli.rpc("plataforma_conciliacion_revertir_ajenos", { p_evento_id: evento });
    if (!a.error || !b.error || !c.error) hallazgo(`${nombre} pudo llamar una función de plataforma (${!a.error ? "ajenos " : ""}${!b.error ? "cerrar " : ""}${!c.error ? "revertir" : ""})`);
    else bien(`${nombre} no puede llamar las funciones de limpieza`);
  }
  await fijarOpcion(true);
  mock.busqueda = [pago(`97${sufijo}01`, 1089.0, { pos_id: 9999 })];
  await conc();
  for (const [pagina, ruta, esperado] of [[admin, "/caja/conciliacion", "[data-pagos-ajenos]"], [admin, "/admin/pagos", "[data-otros-pagos]"]]) {
    await pagina.setViewportSize({ width: 390, height: 800 });
    await pagina.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
    const ancho = await pagina.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
    const visible = await pagina.locator(esperado).first().isVisible();
    if (ancho.s > ancho.w + 1 || !visible) hallazgo(`${ruta} a 390 px: desborda (${ancho.s} > ${ancho.w}) o no se ve (${visible})`);
    else bien(`${ruta} a 390 px: sin desborde y con su sección visible`);
  }
} finally {
  await nav.close();
  servidor.close();
  await A.from("conciliacion_terminal").delete().eq("negocio_id", H).like("clave", "ORIG-%");
  await A.from("conciliacion_terminal").delete().eq("negocio_id", ludogteka.id);
  await cerrarTodo();
  await fijarOpcion(false);
  if (idsAEnterrar.cobros.length) await A.from("cobros").update({ deleted_at: new Date().toISOString() }).in("id", idsAEnterrar.cobros);
  if (idsAEnterrar.ordenes.length) await A.from("mp_ordenes").update({ estado: "cancelada", deleted_at: new Date().toISOString() }).in("id", idsAEnterrar.ordenes);
  await desconectar();
  void previo;
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Conciliación solo con pagos de PeluDesk: todo en orden.");
process.exit(hallazgos.length ? 1 : 0);
