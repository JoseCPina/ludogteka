// WhatsApp Flow «PeluDesk · Prueba gratis» de punta a punta (SOLO DESARROLLO, 25 de octubre de 2026).
//
//   npm run build
//   node scripts/auditoria/whatsapp-flow-dev.mjs
//
// Levanta `next start` en el 3001 apuntando a dobles de la Graph API y de Telegram (puerto 4457), con un par de
// llaves RSA hecho para esta corrida. Nunca manda un mensaje real. Hace lo que hace Meta: cifra cada petición con la
// llave pública (RSA-OAEP SHA-256 + AES-128-GCM), la firma con el secreto de la app y descifra la respuesta.
//   1. El bot ofrece el Flow: el saludo de un número nuevo sale como mensaje de Flow (botón «Probar gratis») con el
//      menú; «1» lo vuelve a ofrecer; precio y prueba también; un admin con negocio recibe el menú por texto.
//   2. Endpoint: sin firma 401; cifrado con otra llave 421; ping; aviso de error; token ajeno 427; INIT abre GIRO y
//      marca «abierto»; DATOS con errores regresa con el mensaje en el campo; DATOS bien → CONFIRMACION con resumen;
//      sin la casilla no avanza; «Crear mi cuenta» → SUCCESS.
//   3. La cuenta: negocio en prueba con los servicios del giro, el teléfono de WhatsApp como cuenta del admin (con
//      contraseña por escoger), aceptación con origen whatsapp_flow, origen del registro, el prospecto en_prueba y
//      el mensaje con la liga (sin vista previa), el subdominio y los tres pasos.
//   4. nfm_reply del webhook: no abre otro negocio ni contesta con el bot.
//   5. La liga: GET no la gasta; POST → /auth/entrar del negocio; segundo POST → 410; un token inventado → 404.
//   6. Ya tenía negocio: otro Flow completado manda su acceso y no abre otro.
//   7. Prellenado desde el prospecto (por su teléfono): giro, nombre del negocio y ciudad.
//   8. Respaldo: sin abrirlo en 10 minutos → la prueba por texto (una vez); si Meta rechaza el Flow → texto.
//   9. Las tablas y el resumen cerrados para anon y para un admin de negocio.
import { limpiarAlTerminar } from "../lib/limpieza-dev.mjs";
limpiarAlTerminar({
  prefijos: ["flow-prueba-"],
  bitacoras: ["wa_accesos", "wa_flow_sesiones", "wa_mensajes", "wa_entregas", "wa_hilos", "wa_uso_ia", "prospectos_eventos", "prospectos_contactos", "prospectos", "aceptaciones_legales"],
});
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { createHmac, generateKeyPairSync, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cifrarPeticion, descifrarRespuesta } from "../../src/lib/whatsapp/flow/cifrado.ts";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const A = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PUERTO = 3001;
const PUERTO_DOBLE = 4457;
const PHONE_ID = "PHONE_PRUEBA";
const APP_SECRET = `secreto-app-${randomUUID()}`;
const TG_TOKEN = "tg-prueba";
const CRON = `cron-${randomUUID()}`;
const FLOW_ID = "FLOW_PRUEBA";
const { publicKey: PUBLICA, privateKey: PRIVADA } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const { publicKey: OTRA_PUBLICA } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });

const hallazgos = [];
const comprobar = (ok, t) => (ok ? console.log(`  ✔ ${t}`) : (hallazgos.push(t), console.log(`  ✘ ${t}`)));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const esperarHasta = async (fn, ms = 30000, paso = 500) => { const t = Date.now(); for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t > ms) return null; await espera(paso); } };
const tel = () => `5299${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

// ───────────── dobles de la Graph API y Telegram
const mock = { wa: [], tg: [], rechazarFlow: false };
const doble = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const j = cuerpo && (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(cuerpo) : {};
  const responder = (obj, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.url.startsWith(`/v23.0/${PHONE_ID}/messages`)) {
    if (j.status === "read") return responder({ success: true });
    if (j.type === "interactive" && j.interactive?.type === "flow" && mock.rechazarFlow) return responder({ error: { message: "Flow no disponible", code: 131009 } }, 400);
    mock.wa.push(j);
    return responder({ messages: [{ id: `wamid.${randomUUID()}` }] });
  }
  if (req.url.startsWith(`/bot${TG_TOKEN}/`)) {
    mock.tg.push(j);
    return responder({ ok: true, result: { message_id: mock.tg.length } });
  }
  if (req.url === "/v1/messages") return responder({ content: [{ type: "text", text: "Respuesta de prueba." }], usage: { input_tokens: 10, output_tokens: 5 } });
  responder({ error: "no existe" }, 404);
});
await new Promise((r) => doble.listen(PUERTO_DOBLE, "127.0.0.1", r));

const servidor = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], {
  env: {
    ...process.env,
    WHATSAPP_GRAPH_URL: `http://127.0.0.1:${PUERTO_DOBLE}`,
    TELEGRAM_API_URL: `http://127.0.0.1:${PUERTO_DOBLE}`,
    ANTHROPIC_API_URL: `http://127.0.0.1:${PUERTO_DOBLE}`,
    WHATSAPP_TOKEN: "wa-prueba",
    WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
    WHATSAPP_APP_SECRET: APP_SECRET,
    TELEGRAM_BOT_TOKEN: TG_TOKEN,
    ANTHROPIC_API_KEY: "ia-prueba",
    WHATSAPP_FLOW_ID: FLOW_ID,
    // El menú y las respuestas fijas de antes (el guion de ventas lo prueba whatsapp-ventas-dev.mjs).
    WHATSAPP_GUION_VENTAS: "0",
    WHATSAPP_FLOW_PRIVATE_KEY: PRIVADA,
    CRON_SECRET: CRON,
    PELUDESK_URL_DESARROLLO: `http://{slug}.localhost:${PUERTO}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let bitacora = "";
servidor.stdout.on("data", (d) => (bitacora += d));
servidor.stderr.on("data", (d) => (bitacora += d));
const cerrar = () => { try { servidor.kill(); } catch { /* ya cerró */ } doble.close(); };
process.on("exit", cerrar);

function pedir(ruta, { method = "GET", body = null, headers = {}, host = "plataforma.localhost" } = {}) {
  return new Promise((resolve, reject) => {
    const q = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method, headers: { host: `${host}:${PUERTO}`, ...headers } }, (r) => {
      const trozos = [];
      r.on("data", (c) => trozos.push(c));
      r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, texto: Buffer.concat(trozos).toString("utf8") }));
    });
    q.on("error", reject);
    if (body) q.write(body);
    q.end();
  });
}
const firma = (crudo, secreto = APP_SECRET) => `sha256=${createHmac("sha256", secreto).update(crudo, "utf8").digest("hex")}`;

/** Una petición al endpoint como la haría Meta: cifrada, firmada; devuelve la respuesta descifrada. */
async function alFlow(datos, { llave = PUBLICA, firmar = true } = {}) {
  const { peticion, aes, iv } = cifrarPeticion({ version: "3.0", ...datos }, llave);
  const crudo = JSON.stringify(peticion);
  const r = await pedir("/api/whatsapp/flow", { method: "POST", body: crudo, headers: { "content-type": "application/json", ...(firmar ? { "x-hub-signature-256": firma(crudo) } : {}) } });
  let cuerpo = null;
  if (r.status === 200) try { cuerpo = descifrarRespuesta(r.texto, aes, iv); } catch { cuerpo = "ilegible"; }
  return { status: r.status, cuerpo };
}

/** Un mensaje entrante al webhook, firmado. */
async function alWebhook(telefono, mensaje, perfil = "Prueba Flow") {
  const crudo = JSON.stringify({
    entry: [{ changes: [{ value: { metadata: { phone_number_id: PHONE_ID }, contacts: [{ wa_id: telefono, profile: { name: perfil } }], messages: [{ from: telefono, id: `wamid.${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), ...mensaje }] } }] }],
  });
  return pedir("/api/whatsapp/webhook", { method: "POST", body: crudo, headers: { "content-type": "application/json", "x-hub-signature-256": firma(crudo) } });
}
const texto = (body) => ({ type: "text", text: { body } });
const flowsA = (t) => mock.wa.filter((m) => m.to === t && m.type === "interactive" && m.interactive?.type === "flow");
const textosA = (t) => mock.wa.filter((m) => m.to === t && m.type === "text").map((m) => m.text.body);
const sesionesDe = async (t) => (await A.from("wa_flow_sesiones").select("*").eq("telefono", t).order("enviado_at")).data ?? [];

try {
  const listo = await esperarHasta(async () => (await pedir("/registro").catch(() => null))?.status === 200, 90000, 1000);
  comprobar(Boolean(listo), "el servidor de la prueba arrancó (necesita `npm run build`)");
  if (!listo) throw new Error(`sin servidor:\n${bitacora.slice(-1500)}`);

  // ── 1. El bot ofrece el Flow
  console.log("\n1. El bot ofrece el Flow");
  const T1 = tel();
  await alWebhook(T1, texto("Hola"));
  const f1 = await esperarHasta(async () => flowsA(T1)[0], 30000);
  comprobar(Boolean(f1), "el saludo de un número nuevo sale como Flow");
  comprobar(f1?.interactive?.action?.parameters?.flow_cta === "Probar gratis" && f1?.interactive?.action?.parameters?.flow_id === FLOW_ID && f1?.interactive?.action?.parameters?.flow_action === "data_exchange", "con el botón «Probar gratis», el id del Flow y data_exchange");
  comprobar(/Contesta con el número/.test(f1?.interactive?.body?.text ?? ""), "el cuerpo es el menú de siempre (se puede contestar 1, 2 o 3)");
  let [s1] = await sesionesDe(T1);
  comprobar(s1?.punto === "saludo" && s1?.fuente === "directo" && s1?.estado === "enviado" && s1?.flow_token === f1?.interactive?.action?.parameters?.flow_token, "queda su sesión (saludo, directo, enviado) con el mismo flow_token");
  await alWebhook(T1, texto("1"));
  comprobar(Boolean(await esperarHasta(async () => flowsA(T1)[1], 30000)), "«1» del menú lo vuelve a ofrecer");
  const sesiones1 = await sesionesDe(T1);
  comprobar(sesiones1[1]?.punto === "menu" && /15 días gratis/.test(flowsA(T1)[1]?.interactive?.body?.text ?? ""), "con el texto de la prueba (punto «menu»)");
  const T1b = tel();
  await alWebhook(T1b, texto("¿Cuánto cuesta?"));
  const fp = await esperarHasta(async () => flowsA(T1b)[0], 30000);
  comprobar(Boolean(fp) && (await sesionesDe(T1b))[0]?.punto === "precio", "preguntar el precio también lo ofrece (punto «precio»)");

  // ── 2. Endpoint
  console.log("\n2. Endpoint cifrado");
  const token1 = s1.flow_token;
  const { peticion } = cifrarPeticion({ version: "3.0", action: "ping" }, PUBLICA);
  const sinFirma = await pedir("/api/whatsapp/flow", { method: "POST", body: JSON.stringify(peticion), headers: { "content-type": "application/json" } });
  comprobar(sinFirma.status === 401, "sin firma: 401");
  const malFirmada = await pedir("/api/whatsapp/flow", { method: "POST", body: JSON.stringify(peticion), headers: { "content-type": "application/json", "x-hub-signature-256": firma(JSON.stringify(peticion), "otro-secreto") } });
  comprobar(malFirmada.status === 401, "firmada con otro secreto: 401");
  comprobar((await alFlow({ action: "ping" }, { llave: OTRA_PUBLICA })).status === 421, "cifrada con otra llave: 421");
  const ping = await alFlow({ action: "ping" });
  comprobar(ping.status === 200 && ping.cuerpo?.data?.status === "active", "ping: active");
  const aviso = await alFlow({ action: "data_exchange", flow_token: token1, data: { error: "INVALID_SCREEN", error_message: "x" } });
  comprobar(aviso.cuerpo?.data?.acknowledged === true, "aviso de error: acknowledged");
  comprobar((await alFlow({ action: "INIT", flow_token: "token-que-no-existe-0000000000" })).status === 427, "flow_token ajeno: 427");
  const init = await alFlow({ action: "INIT", flow_token: token1 });
  comprobar(init.cuerpo?.screen === "GIRO" && init.cuerpo?.data?.giros?.length === 4 && init.cuerpo.data.giros.map((g) => g.title).join("|") === "Estética canina|Hotel o guardería|Veterinaria|Varios", "INIT abre GIRO con las cuatro opciones");
  [s1] = await sesionesDe(T1);
  comprobar(s1.estado === "abierto" && s1.abierto_at, "la sesión queda «abierto»");
  const malos = await alFlow({ action: "data_exchange", flow_token: token1, screen: "DATOS", data: { pantalla: "DATOS", giro: "estetica", negocio: "AB", ciudad: "", nombre: "Jo", correo: "no-es-correo" } });
  comprobar(malos.cuerpo?.screen === "DATOS" && malos.cuerpo.data.error_negocio && malos.cuerpo.data.error_ciudad && malos.cuerpo.data.error_nombre && malos.cuerpo.data.error_correo, "DATOS con errores regresa a DATOS con el mensaje en cada campo");
  const sufijo = String(Date.now()).slice(-6);
  const negocioNombre = `Flow Prueba ${sufijo}`;
  const datos = { giro: "hotel_guarderia", negocio: negocioNombre, ciudad: "San Luis Potosí", nombre: "Ana Prueba", correo: "ana.prueba@example.com" };
  const conf = await alFlow({ action: "data_exchange", flow_token: token1, screen: "DATOS", data: { pantalla: "DATOS", ...datos } });
  comprobar(conf.cuerpo?.screen === "CONFIRMACION" && /Hotel o guardería/.test(conf.cuerpo.data.resumen) && conf.cuerpo.data.resumen.includes(negocioNombre), "DATOS bien → CONFIRMACION con el resumen");
  const sinCasilla = await alFlow({ action: "data_exchange", flow_token: token1, screen: "CONFIRMACION", data: { pantalla: "CONFIRMACION", ...datos, acepto: false } });
  comprobar(sinCasilla.cuerpo?.screen === "CONFIRMACION", "sin aceptar términos no avanza");
  const fin = await alFlow({ action: "data_exchange", flow_token: token1, screen: "CONFIRMACION", data: { pantalla: "CONFIRMACION", ...datos, acepto: true } });
  comprobar(fin.cuerpo?.screen === "SUCCESS" && fin.cuerpo.data?.extension_message_response?.params?.flow_token === token1, "«Crear mi cuenta» → SUCCESS con el flow_token");

  // ── 3. La cuenta
  console.log("\n3. La cuenta");
  const lista = await esperarHasta(async () => { const [s] = await sesionesDe(T1); return s?.estado === "cuenta_creada" ? s : null; }, 60000, 1000);
  comprobar(Boolean(lista), `la sesión termina en cuenta_creada (${(await sesionesDe(T1))[0]?.estado} ${(await sesionesDe(T1))[0]?.error ?? ""})`);
  const negocioId = lista?.negocio_creado_id;
  const { data: neg } = negocioId ? await A.from("negocios").select("id, slug, nombre, plan, prueba_termina_at, ciudad").eq("id", negocioId).single() : { data: null };
  comprobar(neg?.plan === "prueba" && neg?.nombre === negocioNombre && neg?.ciudad === "San Luis Potosí" && Date.parse(neg.prueba_termina_at) > Date.now() + 14 * 86400000, "negocio en prueba de 15 días con su nombre y ciudad");
  const { data: mods } = negocioId ? await A.from("negocio_modulos").select("modulo, activo").eq("negocio_id", negocioId) : { data: [] };
  const apagado = (m) => (mods ?? []).some((x) => x.modulo === m && x.activo === false);
  comprobar(apagado("estetica") && !apagado("guarderia") && !apagado("hotel"), "con los servicios del giro (hotel y guardería prendidos, estética apagada)");
  const correo = `t${T1.slice(2)}@`;
  const { data: correoPersona } = await A.rpc("email_de_persona_por_telefono", { p_telefono: T1.slice(2) });
  const { data: personaId } = correoPersona ? await A.rpc("usuario_por_email", { p_email: correoPersona }) : { data: null };
  const { data: memb } = personaId && negocioId ? await A.from("membresias").select("rol").eq("negocio_id", negocioId).eq("profile_id", personaId).is("deleted_at", null) : { data: [] };
  comprobar(memb?.[0]?.rol === "admin", "el teléfono de WhatsApp es la cuenta del admin");
  const { data: usuario } = personaId ? await A.auth.admin.getUserById(personaId) : { data: null };
  comprobar(usuario?.user?.app_metadata?.debe_cambiar_password === true && String(usuario?.user?.email ?? "").startsWith(correo), "cuenta con correo de su teléfono y contraseña por escoger al entrar");
  const { data: acept } = personaId ? await A.from("aceptaciones_legales").select("documento, origen").eq("persona_id", personaId) : { data: [] };
  comprobar((acept ?? []).length === 2 && acept.every((a) => a.origen === "whatsapp_flow"), "aceptación de términos y aviso con origen whatsapp_flow");
  const { data: reg } = negocioId ? await A.from("registros_prueba").select("utm_source, utm_medium, utm_campaign, telefono").eq("negocio_id", negocioId).single() : { data: null };
  comprobar(reg?.utm_source === "whatsapp" && reg?.utm_medium === "flow" && reg?.utm_campaign === "flow_saludo" && reg?.telefono === T1.slice(2), "registro de prueba con su origen (whatsapp / flow / saludo)");
  const msj = textosA(T1).find((t) => t.includes("/entrar/"));
  const enviado = mock.wa.find((m) => m.to === T1 && m.type === "text" && m.text.body === msj);
  comprobar(Boolean(msj) && enviado?.text?.preview_url === false, "el mensaje con la liga sale sin vista previa");
  comprobar(Boolean(msj) && msj.includes(`${neg?.slug}.localhost`) && /una sola vez y dura 24 horas/.test(msj) && /1\. .*\n2\. .*\n3\. /.test(msj), "con el subdominio, la vigencia y los tres primeros pasos");
  comprobar(mock.tg.some((t) => String(t.text ?? "").includes(negocioNombre)), "la bandeja de Telegram recibe el aviso de la cuenta nueva");
  const { data: guardados } = await A.from("wa_mensajes").select("texto").eq("telefono", T1).eq("quien", "agente").like("texto", "%/entrar/%");
  comprobar((guardados ?? []).length > 0 && guardados.every((g) => g.texto.includes("/entrar/[liga de un solo uso]")), "el historial del bot guarda la liga enmascarada (la completa solo viaja en el chat)");

  // ── 4. nfm_reply
  console.log("\n4. Aviso del webhook (nfm_reply)");
  const antes = mock.wa.filter((m) => m.to === T1).length;
  await alWebhook(T1, { type: "interactive", interactive: { type: "nfm_reply", nfm_reply: { name: "flow", body: "Sent", response_json: JSON.stringify({ flow_token: token1 }) } } });
  await espera(4000);
  const { count: negociosT1 } = await A.from("registros_prueba").select("id", { count: "exact", head: true }).eq("telefono", T1.slice(2));
  comprobar(negociosT1 === 1 && mock.wa.filter((m) => m.to === T1).length === antes, "no abre otro negocio ni contesta con el bot");

  // ── 5. La liga
  console.log("\n5. La liga de entrada");
  const ruta = msj ? new globalThis.URL(msj.match(/https?:\/\/\S+\/entrar\/\S+/)[0]).pathname : "/entrar/x";
  const g = await pedir(ruta);
  comprobar(g.status === 200 && /Entrar a mi negocio/.test(g.texto) && /method="post"/.test(g.texto), "GET: página con el botón (no la gasta)");
  const p1 = await pedir(ruta, { method: "POST" });
  comprobar(p1.status === 303 && String(p1.headers.location ?? "").startsWith(`http://${neg?.slug}.localhost:${PUERTO}/auth/entrar?token_hash=`) && /next=%2Fbienvenida/.test(p1.headers.location), "POST: al /auth/entrar de su negocio, a la bienvenida");
  if (p1.headers.location) {
    const u = new globalThis.URL(p1.headers.location);
    const canje = await pedir(`${u.pathname}${u.search}`, { host: `${neg.slug}.localhost` });
    comprobar(canje.status === 303 && /set-cookie/i.test(JSON.stringify(canje.headers)), "y allá abre la sesión");
  }
  comprobar((await pedir(ruta, { method: "POST" })).status === 410, "segundo uso: 410");
  comprobar((await pedir(`/entrar/${"x".repeat(43)}`, { method: "POST" })).status === 404, "token inventado: 404");

  // ── 6. Ya tenía negocio
  console.log("\n6. Ya tenía negocio");
  await alWebhook(T1, texto("Quiero probar gratis"));
  const f2 = await esperarHasta(async () => flowsA(T1).at(-1)?.interactive?.action?.parameters?.flow_token !== token1 && flowsA(T1).length > 2 && flowsA(T1).at(-1), 8000);
  comprobar(!f2, "a quien ya es admin no se le ofrece el Flow (es admin de un negocio)");
  const [sesionExtra] = (await A.from("wa_flow_sesiones").insert({ flow_token: `extra-${randomUUID()}`, telefono: T1, punto: "manual" }).select("flow_token")).data ?? [];
  await alFlow({ action: "INIT", flow_token: sesionExtra.flow_token });
  await alFlow({ action: "data_exchange", flow_token: sesionExtra.flow_token, data: { pantalla: "CONFIRMACION", ...datos, negocio: `${negocioNombre} Dos`, acepto: true } });
  const yaTenia = await esperarHasta(async () => { const { data } = await A.from("wa_flow_sesiones").select("estado").eq("flow_token", sesionExtra.flow_token).single(); return data?.estado === "ya_tenia"; }, 60000, 1000);
  const { count: negocios2 } = await A.from("registros_prueba").select("id", { count: "exact", head: true }).eq("telefono", T1.slice(2));
  comprobar(Boolean(yaTenia) && negocios2 === 1, "otro Flow completado no abre otro negocio (ya_tenia)");
  comprobar(textosA(T1).some((t) => /Ya tienes \*/.test(t) && t.includes("/entrar/")), "y le manda su acceso");

  // ── 7. Prellenado desde el prospecto
  console.log("\n7. Prellenado desde el prospecto");
  const T2 = tel();
  const { data: pros, error: ePros } = await A.from("prospectos").insert({ nombre: `Flow Prueba Estética ${sufijo}`, giro: "estetica", ciudad: "Querétaro", fuente: "manual", telefono: T2.slice(2), whatsapp_bot: T2.slice(2) }).select("id, slug").single();
  comprobar(!ePros, `prospecto de prueba${ePros ? `: ${ePros.message}` : ""}`);
  await alWebhook(T2, texto("Hola"));
  await esperarHasta(async () => flowsA(T2)[0], 30000);
  const [s2] = await sesionesDe(T2);
  const init2 = s2 ? await alFlow({ action: "INIT", flow_token: s2.flow_token }) : null;
  comprobar(init2?.cuerpo?.data?.giro === "estetica" && init2.cuerpo.data.negocio === `Flow Prueba Estética ${sufijo}` && init2.cuerpo.data.ciudad === "Querétaro", "INIT trae giro, nombre del negocio y ciudad del prospecto");
  if (s2) {
    await alFlow({ action: "data_exchange", flow_token: s2.flow_token, data: { pantalla: "CONFIRMACION", giro: "estetica", negocio: `Flow Prueba Estética ${sufijo}`, ciudad: "Querétaro", nombre: "Beto Prueba", correo: "", acepto: true } });
    const s2b = await esperarHasta(async () => { const [s] = await sesionesDe(T2); return s?.estado === "cuenta_creada" ? s : null; }, 60000, 1000);
    const { data: p2 } = pros ? await A.from("prospectos").select("etapa, negocio_cliente_id").eq("id", pros.id).single() : { data: null };
    comprobar(Boolean(s2b) && p2?.etapa === "en_prueba" && p2?.negocio_cliente_id === s2b?.negocio_creado_id && s2b?.prospecto_id === pros?.id, "al completarlo, el prospecto queda en_prueba y ligado al negocio");
  }

  // ── 8. Respaldo por texto
  console.log("\n8. Respaldo por texto");
  const T3 = tel();
  await alWebhook(T3, texto("¿Cuánto cuesta?"));
  await esperarHasta(async () => flowsA(T3)[0], 30000);
  // Como si todo hubiera pasado hace 11 minutos: el envío y lo que escribió antes.
  await A.from("wa_flow_sesiones").update({ enviado_at: new Date(Date.now() - 11 * 60000).toISOString() }).eq("telefono", T3);
  await A.from("wa_mensajes").update({ created_at: new Date(Date.now() - 12 * 60000).toISOString() }).eq("telefono", T3);
  const cron = await pedir("/api/cron/whatsapp-flow", { headers: { authorization: `Bearer ${CRON}` } });
  comprobar(cron.status === 200, "la tarea corre con CRON_SECRET");
  comprobar(textosA(T3).some((t) => /No se abrió el formulario/.test(t) && /\/registro/.test(t)), "sin abrirlo en 10 minutos → la prueba por texto con el link de registro");
  await pedir("/api/cron/whatsapp-flow", { headers: { authorization: `Bearer ${CRON}` } });
  comprobar(textosA(T3).filter((t) => /No se abrió el formulario/.test(t)).length === 1, "una sola vez");
  comprobar((await pedir("/api/cron/whatsapp-flow")).status === 401, "sin CRON_SECRET: 401");
  mock.rechazarFlow = true;
  const T4 = tel();
  await alWebhook(T4, texto("Hola"));
  const t4 = await esperarHasta(async () => textosA(T4).find((t) => /Contesta con el número/.test(t)), 30000);
  mock.rechazarFlow = false;
  const [s4] = await sesionesDe(T4);
  comprobar(Boolean(t4) && s4?.respaldo_at, "si Meta rechaza el Flow, el menú sale por texto y queda marcado");

  // ── 9. Cerrado
  console.log("\n9. Nadie más lo ve");
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  for (const t of ["wa_flow_sesiones", "wa_accesos"]) {
    const r = await anon.from(t).select("id").limit(1);
    comprobar(Boolean(r.error) || (r.data ?? []).length === 0, `anon no lee ${t}`);
  }
  const rr = await anon.rpc("wa_flow_resumen", { p_desde: null });
  comprobar(Boolean(rr.error), "anon no ejecuta wa_flow_resumen");
  if (personaId) {
    const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: correoPersona });
    const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: s } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    const yo = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}`, "x-negocio-id": negocioId } } });
    const a1 = await yo.from("wa_flow_sesiones").select("id").limit(1);
    const a2 = await yo.from("wa_accesos").select("id").limit(1);
    const a3 = await yo.rpc("wa_flow_resumen", { p_desde: null });
    comprobar((a1.data ?? []).length === 0 && (a2.data ?? []).length === 0 && (a3.data ?? []).length === 0, "el admin del negocio nuevo no ve sesiones, accesos ni el resumen");
  }
} catch (e) {
  hallazgos.push(`la auditoría tronó: ${e instanceof Error ? e.message : e}`);
  console.log(`  ✘ ${e instanceof Error ? e.stack : e}`);
} finally {
  cerrar();
}

if (/\[whatsapp-flow\][^\n]*(intercambio|procesar)/.test(bitacora)) console.log(`\nBitácora del servidor:\n${bitacora.split("\n").filter((l) => /whatsapp-flow|whatsapp\]/.test(l)).slice(-20).join("\n")}`);
console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
