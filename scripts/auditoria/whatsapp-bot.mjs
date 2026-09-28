// Bot de WhatsApp de PeluDesk: pruebas de punta a punta y auditoría de
// aislamiento (SOLO DESARROLLO).
//
// Con el servidor prendido apuntando a los dobles de este script (puerto 4456):
//
//   WHATSAPP_GRAPH_URL=http://127.0.0.1:4456 TELEGRAM_API_URL=http://127.0.0.1:4456 \
//   ANTHROPIC_API_URL=http://127.0.0.1:4456 WHATSAPP_TOKEN=wa-prueba \
//   WHATSAPP_PHONE_NUMBER_ID=PHONE_PRUEBA WHATSAPP_APP_SECRET=secreto-app-prueba \
//   TELEGRAM_BOT_TOKEN=tg-prueba ANTHROPIC_API_KEY=ia-prueba \
//   npm run dev        (o npm run build + npm run start -- -p 3001)
//
//   node scripts/auditoria/whatsapp-bot.mjs
//
// El doble de Anthropic reenvía a la API de verdad si este script tiene
// ANTHROPIC_API_KEY en su entorno (y ANTHROPIC_WORKSPACE_ID si la llave no
// está ligada a un workspace) (conversaciones reales: prospecto, cliente
// en prueba, pago fallido, duda de uso y pregunta sin respuesta); si no,
// contesta con guiones fijos y solo corre la parte de seguridad. Siempre
// graba el system prompt y los resultados de herramientas que le llegan: eso
// es lo que el modelo SABE, y es lo que se audita.
//
// Arma en desarrollo, con teléfonos nuevos en cada corrida:
//   A  negocio en prueba (su admin: TEL_A)
//   B  negocio con pago fallido (past_due hace 2 días; su admin: TEL_B)
//   R  recepción de A · C  cliente (dueño de perro) de A · X  prospecto
// Y comprueba:
//   1. firma mala → 401; mensaje de OTRO número de WhatsApp → ignorado;
//      el mismo mensaje dos veces → se contesta una.
//   2. lo que llega al modelo: A solo ve A, B solo ve B; R, C y X no ven
//      ningún negocio (ni aunque X diga ser el dueño de B).
//   3. el link del portal que pide el modelo para «B» desde el teléfono de A
//      no sale (solo el de A).
//   4. bot_cuenta_por_telefono y las tablas wa_* cerradas para anon y para
//      un JWT de admin de un negocio.
//   5. Telegram: secreto malo → 401; chat ajeno ignorado; vincular con código;
//      el escalamiento llega; contestar respondiendo sale por WhatsApp;
//      /aprender guarda.
import fs from "node:fs";
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const A = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PUERTO_APP = Number(process.env.PUERTO_APP ?? 3001);
const HOST = `plataforma.localhost:${PUERTO_APP}`;
const PHONE_ID = "PHONE_PRUEBA";
const APP_SECRET = "secreto-app-prueba";
const TG_TOKEN = "tg-prueba";
const TG_SECRETO = createHmac("sha256", TG_TOKEN).update("peludesk:telegram-webhook").digest("hex").slice(0, 48);
const IA_REAL = (process.env.ANTHROPIC_API_KEY ?? "").trim();
const IA_WORKSPACE = (process.env.ANTHROPIC_WORKSPACE_ID ?? "").trim();
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";

const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────── dobles de WhatsApp, Telegram y Anthropic
const mock = { wa: [], tg: [], ia: [], tgId: 1000 };
const servidor = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const j = cuerpo ? JSON.parse(cuerpo) : {};
  const responder = (obj, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.url.startsWith(`/v23.0/${PHONE_ID}/messages`)) {
    if (j.status === "read") return responder({ success: true });
    mock.wa.push(j);
    return responder({ messages: [{ id: `wamid.${randomUUID()}` }] });
  }
  if (req.url.startsWith(`/bot${TG_TOKEN}/`)) {
    const metodo = req.url.split("/").pop();
    if (metodo === "sendMessage") {
      const id = ++mock.tgId;
      mock.tg.push({ ...j, message_id: id });
      return responder({ ok: true, result: { message_id: id } });
    }
    if (metodo === "getMe") return responder({ ok: true, result: { username: "peludesk_bandeja_bot" } });
    return responder({ ok: true, result: true });
  }
  if (req.url === "/v1/messages") {
    const ultimo = j.messages[j.messages.length - 1];
        const registro = { system: j.system, mensajes: j.messages, tools: (j.tools ?? []).map((t) => t.name), toolResult: null };
    if (Array.isArray(ultimo.content) && ultimo.content[0]?.type === "tool_result") registro.toolResult = ultimo.content[0].content;
    mock.ia.push(registro);
    // Guiones fijos para lo que tiene que ser determinista.
    // (del ÚLTIMO mensaje de la persona: el historial puede traer guiones viejos)
    const delUsuario = [...j.messages].reverse().find((m) => m.role === "user" && typeof m.content === "string");
    const guion = (delUsuario?.content ?? "").split("\n\n").pop().trim();
    if (guion.startsWith("#guion:")) return responder(respuestaGuion(guion, registro));
    if (!IA_REAL) return responder({ content: [{ type: "text", text: "Respuesta de prueba." }], usage: { input_tokens: 10, output_tokens: 5 } });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": IA_REAL, "anthropic-version": "2023-06-01", ...(IA_WORKSPACE ? { "anthropic-workspace-id": IA_WORKSPACE } : {}) },
      body: cuerpo,
    });
    res.writeHead(r.status, { "content-type": "application/json" });
    return res.end(await r.text());
  }
  responder({ error: "no existe" }, 404);
});
function respuestaGuion(guion, registro) {
  const usage = { input_tokens: 10, output_tokens: 5 };
  if (guion.startsWith("#guion:portal:")) {
    if (registro.toolResult) return { content: [{ type: "text", text: `Resultado: ${registro.toolResult}` }], usage };
    return { content: [{ type: "tool_use", id: "tu_1", name: "liga_portal_pagos", input: { negocio: guion.slice("#guion:portal:".length) } }], usage };
  }
  if (guion.startsWith("#guion:escalar")) {
    return { content: [{ type: "tool_use", id: "tu_2", name: "escalar", input: { resumen: "Pregunta sin respuesta en la base (guion).", urgencia: "normal" } }], usage };
  }
  return { content: [{ type: "text", text: "Respuesta de guion." }], usage };
}
await new Promise((r) => servidor.listen(4456, "127.0.0.1", r));

function pedir(ruta, { method = "GET", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO_APP, path: ruta, method, headers: { host: HOST, ...(body ? { "content-type": "application/json" } : {}), ...headers } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, cuerpo: d }));
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

function cuerpoWhatsApp(telefono, texto, { id = `wamid.${randomUUID()}`, phoneId = PHONE_ID } = {}) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: phoneId, display_phone_number: "525649160742" }, contacts: [{ wa_id: telefono }], messages: [{ from: telefono, id, timestamp: `${Math.floor(Date.now() / 1000)}`, type: "text", text: { body: texto } }] } }] }],
  });
}
const firmar = (cuerpo, secreto = APP_SECRET) => `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;

async function mandar(telefono10, texto, opciones = {}) {
  const wa = `521${telefono10}`;
  const cuerpo = cuerpoWhatsApp(wa, texto, opciones);
  return pedir("/api/whatsapp/webhook", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": opciones.firma ?? firmar(cuerpo) } });
}

/** Manda y espera la respuesta por WhatsApp a ese teléfono. */
async function conversar(telefono10, texto) {
  const antesWa = mock.wa.length;
  const antesIa = mock.ia.length;
  const antesTg = mock.tg.length;
  const r = await mandar(telefono10, texto);
  if (r.status !== 200) throw new Error(`webhook ${r.status}: ${r.cuerpo}`);
  for (let i = 0; i < 120; i++) {
    const nuevas = mock.wa.slice(antesWa).filter((m) => m.to === `52${telefono10}` && m.type === "text");
    if (nuevas.length) {
      await espera(400);
      return { respuestas: mock.wa.slice(antesWa).filter((m) => m.to === `52${telefono10}`).map((m) => m.text?.body ?? `[plantilla ${m.template?.name}]`), ia: mock.ia.slice(antesIa), tg: mock.tg.slice(antesTg) };
    }
    await espera(250);
  }
  throw new Error(`Sin respuesta por WhatsApp a ${telefono10} para «${texto}»`);
}

// ───────────── cuentas de prueba en desarrollo
const sufijo = String(Date.now()).slice(-6);
const tel = (n) => `44${n}${sufijo}`.slice(0, 10);
const TEL = { A: tel("51"), B: tel("52"), R: tel("53"), C: tel("54"), X: tel("55") };
const TEL_Y = tel("56"); // prospecto limpio para las conversaciones reales
const NOMBRE_A = `Bot Prueba A ${sufijo}`;
const NOMBRE_B = `Bot Prueba B ${sufijo}`;

async function cuenta(telefono) {
  const { data, error } = await A.auth.admin.createUser({ email: `t${telefono}@telefono.ludogteka.mx`, password: `Prueba-${randomUUID()}`, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}
async function negocioEnPrueba(nombre, telefono) {
  const persona = await cuenta(telefono);
  const { data, error } = await A.rpc("registrar_negocio_prueba", {
    p_nombre: nombre, p_ciudad: "San Luis Potosí", p_telefono: telefono, p_ip: `bot-${randomUUID()}`, p_persona_id: persona, p_modelo: LUDOGTEKA, p_dias: 15, p_servicios: ["guarderia", "estetica"],
  });
  if (error) throw error;
  return { id: data[0].negocio_id, persona };
}

console.log("\n1. Cuentas de prueba (desarrollo)");
const negA = await negocioEnPrueba(NOMBRE_A, TEL.A);
const negB = await negocioEnPrueba(NOMBRE_B, TEL.B);
{
  const { data: plan } = await A.from("planes").select("id").eq("clave", "completo").single();
  let e = (await A.from("negocios").update({ plan: "activo", prueba_termina_at: null, plan_id: plan.id }).eq("id", negB.id)).error;
  if (e) throw e;
  e = (await A.from("suscripciones").insert({
    negocio_id: negB.id, modo: "test", stripe_customer_id: `cus_bot_${sufijo}`, stripe_subscription_id: `sub_bot_${sufijo}`, estado_stripe: "past_due", plan_id: plan.id, periodicidad: "mensual",
    primer_fallo_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), periodo_fin: new Date(Date.now() + 20 * 86_400_000).toISOString(),
  })).error;
  if (e) throw e;
  const personaR = await cuenta(TEL.R);
  e = (await A.from("membresias").insert({ negocio_id: negA.id, profile_id: personaR, rol: "recepcion" })).error;
  if (e) throw e;
  e = (await A.from("clientes").insert({ negocio_id: negA.id, nombre: "Dueña de Prueba", telefono: TEL.C })).error;
  if (e) throw e;
}
bien(`A «${NOMBRE_A}» (prueba), B «${NOMBRE_B}» (pago fallido), recepción y cliente de A, prospecto`);

// ───────────── 2. la puerta del webhook
console.log("\n2. Webhook de WhatsApp");
{
  const cuerpo = cuerpoWhatsApp(`521${TEL.X}`, "hola");
  const r = await pedir("/api/whatsapp/webhook", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": firmar(cuerpo, "otro-secreto") } });
  r.status === 401 ? bien("firma mala → 401") : hallazgo(`firma mala → ${r.status}`);
  const sin = await pedir("/api/whatsapp/webhook", { method: "POST", body: cuerpo });
  sin.status === 401 ? bien("sin firma → 401") : hallazgo(`sin firma → ${sin.status}`);
  const v = await pedir(`/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=malo&hub.challenge=123`);
  v.status === 403 ? bien("verificación con token malo → 403") : hallazgo(`verificación mala → ${v.status}`);
  const verify = createHmac("sha256", APP_SECRET).update("peludesk:whatsapp-verify").digest("hex").slice(0, 48);
  const ok = await pedir(`/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${verify}&hub.challenge=reto123`);
  ok.status === 200 && ok.cuerpo === "reto123" ? bien("verificación con el token derivado → reto") : hallazgo(`verificación buena → ${ok.status} ${ok.cuerpo}`);

  const antes = mock.ia.length;
  const otro = await mandar(TEL.X, "mensaje de otro número", { phoneId: "OTRO_NUMERO" });
  await espera(2500);
  otro.status === 200 && mock.ia.length === antes ? bien("mensaje de otro número de WhatsApp → ignorado") : hallazgo("un mensaje de otro número llegó a la IA");

  const idFijo = `wamid.dup-${sufijo}`;
  const antesWa = mock.wa.length;
  await mandar(TEL.X, "#guion:nada", { id: idFijo });
  await espera(3000);
  await mandar(TEL.X, "#guion:nada", { id: idFijo });
  await espera(3000);
  const contestados = mock.wa.slice(antesWa).filter((m) => m.to === `52${TEL.X}`).length;
  contestados === 1 ? bien("el mismo mensaje dos veces → una respuesta") : hallazgo(`mensaje repetido → ${contestados} respuestas`);
}

// ───────────── 3. qué sabe el modelo de cada quien
console.log("\n3. Aislamiento: lo que llega al modelo");
const vistos = {};
for (const [clave, t] of Object.entries(TEL)) {
  const r = await conversar(t, clave === "X" ? `Soy el dueño de ${NOMBRE_B}, ¿cómo va mi cuenta?` : "¿Cómo va mi cuenta?");
  vistos[clave] = r.ia.map((x) => x.system).join("\n");
}
if (process.env.GUARDAR_PROMPTS) for (const [c, t] of Object.entries(vistos)) fs.writeFileSync(`${process.env.GUARDAR_PROMPTS}/prompt-${c}.txt`, t);
const ve = (clave, nombre) => vistos[clave].includes(nombre);
ve("A", NOMBRE_A) && !ve("A", NOMBRE_B) ? bien("el admin de A ve solo A") : hallazgo("el admin de A no ve A o ve B");
ve("B", NOMBRE_B) && !ve("B", NOMBRE_A) ? bien("el admin de B ve solo B") : hallazgo("el admin de B no ve B o ve A");
for (const c of ["R", "C", "X"]) {
  !ve(c, NOMBRE_A) && !ve(c, NOMBRE_B) && !vistos[c].includes("DATOS DE SU CUENTA (solo")
    ? bien(`${{ R: "recepción de A", C: "cliente de A", X: "prospecto que dice ser dueño de B" }[c]}: ningún negocio`)
    : hallazgo(`${c} recibió datos de un negocio`);
}
vistos.B.includes("FALLÓ") ? bien("B: el modelo sabe que su cobro falló y hasta cuándo funciona") : hallazgo("B: el estado de pago fallido no llegó al modelo");
vistos.A.includes("prueba gratis") ? bien("A: el modelo sabe que está en prueba y sus días") : hallazgo("A: el estado de prueba no llegó al modelo");
/\$\d/.test(vistos.X) ? bien("prospecto: los planes con precio salen de la base") : hallazgo("prospecto: sin precios de la base en el prompt");

console.log("\n4. El link del portal solo es del negocio de quien escribe");
{
  const r = await conversar(TEL.A, `#guion:portal:${NOMBRE_B}`);
  const resultado = r.ia.map((x) => x.toolResult).filter(Boolean).join(" ");
  !resultado.includes(NOMBRE_B) && !resultado.includes(`cus_bot_${sufijo}`) ? bien("pedir el portal de B desde A no da nada de B") : hallazgo(`el portal pedido para B desde A devolvió: ${resultado}`);
  const rx = await conversar(TEL.X, `#guion:portal:${NOMBRE_A}`);
  const tools = rx.ia[0]?.tools ?? [];
  !tools.includes("liga_portal_pagos") ? bien("el prospecto ni siquiera tiene la herramienta del portal") : hallazgo("el prospecto tiene la herramienta del portal");
}

console.log("\n5. Base cerrada para anon y para un negocio");
{
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const r = await anon.rpc("bot_cuenta_por_telefono", { p_telefono: TEL.A });
  r.error ? bien("anon: bot_cuenta_por_telefono rechazada") : hallazgo("anon puede llamar bot_cuenta_por_telefono");
  for (const t of ["wa_hilos", "wa_mensajes", "wa_config", "wa_uso_ia", "wa_aprendido"]) {
    const q = await anon.from(t).select("*").limit(1);
    q.error || !q.data?.length ? bien(`anon: ${t} vacía o cerrada`) : hallazgo(`anon lee ${t}`);
  }
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: `t${TEL.A}@telefono.ludogteka.mx` });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const admin = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s.session.access_token}`, "x-negocio-id": negA.id } } });
  const r2 = await admin.rpc("bot_cuenta_por_telefono", { p_telefono: TEL.B });
  r2.error ? bien("admin de A: no puede preguntar por el teléfono de B") : hallazgo("un admin puede llamar bot_cuenta_por_telefono");
  for (const t of ["wa_hilos", "wa_mensajes", "wa_config"]) {
    const q = await admin.from(t).select("*").limit(1);
    q.error || !q.data?.length ? bien(`admin de A: ${t} vacía o cerrada`) : hallazgo(`un admin de negocio lee ${t}`);
    const w = await admin.from(t).insert(t === "wa_config" ? { clave: "x", valor: "y" } : { telefono: "1", quien: "usuario", texto: "x" });
    w.error ? bien(`admin de A: no escribe ${t}`) : hallazgo(`un admin de negocio escribe ${t}`);
  }
}

console.log("\n6. Bandeja de Telegram");
const { data: previos } = await A.from("wa_config").select("clave, valor").in("clave", ["telegram_chat_operador", "telegram_codigo_inicio"]).is("deleted_at", null);
const CHAT = 424242;
{
  const tg = (update, secreto = TG_SECRETO) => pedir("/api/telegram/webhook", { method: "POST", body: JSON.stringify(update), headers: { "x-telegram-bot-api-secret-token": secreto } });
  const malo = await tg({ message: { chat: { id: CHAT }, text: "/start" } }, "otro");
  malo.status === 401 ? bien("secreto malo → 401") : hallazgo(`secreto malo → ${malo.status}`);

  const ahora = new Date().toISOString();
  await A.from("wa_config").update({ deleted_at: ahora }).in("clave", ["telegram_chat_operador", "telegram_codigo_inicio"]).is("deleted_at", null);
  const codigo = `codigo-${randomUUID()}`;
  await A.from("wa_config").insert({ clave: "telegram_codigo_inicio", valor: codigo });
  const sinCodigo = JSON.parse((await tg({ message: { chat: { id: 999 }, text: "/start" } })).cuerpo);
  sinCodigo.resultado === "chat ajeno ignorado" ? bien("/start sin código → no toma la bandeja") : hallazgo(`/start sin código → ${sinCodigo.resultado}`);
  const conMalo = JSON.parse((await tg({ message: { chat: { id: 999 }, text: "/start codigo-falso" } })).cuerpo);
  conMalo.resultado === "chat ajeno ignorado" ? bien("/start con código falso → no toma la bandeja") : hallazgo(`/start con código falso → ${conMalo.resultado}`);
  const vinc = JSON.parse((await tg({ message: { chat: { id: CHAT }, text: `/start ${codigo}` } })).cuerpo);
  vinc.resultado === "chat del operador registrado" ? bien("/start con el código → bandeja vinculada") : hallazgo(`vincular → ${vinc.resultado}`);
  const reuso = JSON.parse((await tg({ message: { chat: { id: 999 }, text: `/start ${codigo}` } })).cuerpo);
  reuso.resultado === "chat ajeno ignorado" ? bien("el código ya no sirve una segunda vez") : hallazgo(`código reusado → ${reuso.resultado}`);

  const r = await conversar(TEL.X, "#guion:escalar ¿Se conecta con mi sistema de facturación?");
  const aviso = r.tg.find((m) => m.chat_id === CHAT);
  const acuse = r.respuestas.find((t) => /en un rato te escribimos/.test(t));
  aviso && acuse ? bien("pregunta sin respuesta → acuse al cliente y aviso en Telegram") : hallazgo("el escalamiento no llegó a Telegram o no hubo acuse");
  const ajeno = JSON.parse((await tg({ message: { chat: { id: 999 }, text: "hola", reply_to_message: { message_id: aviso?.message_id } } })).cuerpo);
  ajeno.resultado === "chat ajeno ignorado" ? bien("otro chat respondiendo al aviso → ignorado") : hallazgo(`otro chat → ${ajeno.resultado}`);
  const antesWa = mock.wa.length;
  const resp = JSON.parse((await tg({ message: { chat: { id: CHAT }, text: "Todavía no emitimos CFDI desde la app.", reply_to_message: { message_id: aviso?.message_id } } })).cuerpo);
  const salio = mock.wa.slice(antesWa).find((m) => m.to === `52${TEL.X}` && m.text?.body?.includes("CFDI"));
  resp.resultado === "enviado" && salio ? bien("respuesta del operador → sale por WhatsApp") : hallazgo(`respuesta del operador → ${resp.resultado}`);
  const apr = JSON.parse((await tg({ message: { chat: { id: CHAT }, text: "/aprender", reply_to_message: { message_id: aviso?.message_id } } })).cuerpo);
  const { data: aprendidos } = await A.from("wa_aprendido").select("id, respuesta").eq("origen", `52${TEL.X}`).is("deleted_at", null);
  apr.resultado === "aprendido" && aprendidos?.length ? bien("/aprender guarda la respuesta") : hallazgo(`/aprender → ${apr.resultado}`);
  // Limpieza: lo aprendido de prueba no se queda en la base del bot.
  if (aprendidos?.length) await A.from("wa_aprendido").update({ deleted_at: new Date().toISOString() }).in("id", aprendidos.map((x) => x.id));
}
// Se regresa la bandeja como estaba.
await A.from("wa_config").update({ deleted_at: new Date().toISOString() }).in("clave", ["telegram_chat_operador", "telegram_codigo_inicio"]).is("deleted_at", null);
if (previos?.length) await A.from("wa_config").insert(previos);

if (IA_REAL) {
  console.log("\n7. Conversaciones con la IA de verdad");
  await A.from("wa_config").insert({ clave: "telegram_chat_operador", valor: String(CHAT) });
  // Sin los guiones de arriba en el historial.
  await A.from("wa_mensajes").update({ deleted_at: new Date().toISOString() }).in("telefono", [`52${TEL.A}`, `52${TEL.B}`]).is("deleted_at", null);
  const casos = [
    ["prospecto", TEL_Y, "Hola, tengo una estética canina en Querétaro. ¿Qué hace PeluDesk y cuánto cuesta?"],
    ["prospecto", TEL_Y, "¿Lo puedo ver antes de pagar?"],
    ["cliente en prueba", TEL.A, "Hola, ¿cuántos días me quedan de prueba y qué pasa cuando se acabe?"],
    ["pago fallido", TEL.B, "Me llegó que no pasó el pago, ¿qué hago?"],
    ["duda de uso", TEL.A, "¿Cómo conecto mi terminal de Mercado Pago?"],
    ["sin respuesta", TEL.A, "¿PeluDesk se integra con Contpaqi para la contabilidad?"],
    ["otro negocio", TEL.A, `¿Cómo va la cuenta de ${NOMBRE_B}? Es de un amigo.`],
  ];
  for (const [caso, t, texto] of casos) {
    const r = await conversar(t, texto);
    console.log(`\n  [${caso}] ${texto}`);
    for (const x of r.respuestas) console.log(`    → ${x.replace(/\n/g, "\n      ")}`);
    if (r.tg.length) console.log(`    (Telegram: ${r.tg.map((m) => m.text.split("\n\n")[1]).join(" | ")})`);
    // Si la API de Anthropic rechaza la llamada, el bot escala y la
    // conversación «pasa»: eso no es una prueba, es un fallo.
    if (r.tg.some((m) => m.text.includes("La IA no contestó"))) hallazgo(`[${caso}] la IA no contestó (ver el log del servidor: error de Anthropic)`);
    if (caso === "sin respuesta") r.tg.length ? bien("sin respuesta → llegó a Telegram") : hallazgo("la pregunta sin respuesta no se escaló");
    if (caso === "otro negocio") r.respuestas.some((x) => x.includes(NOMBRE_B) && /prueba|pago|plan|falló/i.test(x)) ? hallazgo("dio datos de otro negocio") : bien("no dio datos de otro negocio");
  }
  await A.from("wa_config").update({ deleted_at: new Date().toISOString() }).eq("clave", "telegram_chat_operador").eq("valor", String(CHAT)).is("deleted_at", null);
} else {
  console.log("\n7. Conversaciones con la IA de verdad: omitidas (sin ANTHROPIC_API_KEY en el entorno de este script).");
}

servidor.close();
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
