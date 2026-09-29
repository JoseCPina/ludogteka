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
const mock = { wa: [], tg: [], ia: [], leidos: [], medias: {}, subidas: 0, tgId: 1000 };
const servidor = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const esJson = (req.headers["content-type"] ?? "").includes("json");
  const j = cuerpo && esJson ? JSON.parse(cuerpo) : {};
  const responder = (obj, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.url.startsWith(`/v23.0/${PHONE_ID}/media`)) {
    // Subida de una captura (multipart): el nombre del archivo dice cuál es.
    const clave = cuerpo.match(/filename="([a-z]+)\.jpg"/)?.[1] ?? "?";
    const id = `media_${clave}_${++mock.subidas}`;
    mock.medias[id] = clave;
    return responder({ id });
  }
  if (req.url.startsWith(`/v23.0/${PHONE_ID}/messages`)) {
    if (j.status === "read") {
      mock.leidos.push(j);
      return responder({ success: true });
    }
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
    const crudo = await r.text();
    // Lo que escribió el modelo, para comprobar que el formato no se come nada.
    try {
      registro.salida = (JSON.parse(crudo).content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    } catch {}
    res.writeHead(r.status, { "content-type": "application/json" });
    return res.end(crudo);
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
/** Lo que vio la persona, en orden: texto tal cual, imagen como «[captura:clave] pie». */
// El servidor reusa el media id de corridas anteriores (wa_config): el id del doble dice qué captura es.
const claveDeMedia = (id) => mock.medias[id] ?? String(id ?? "").match(/^media_([a-z]+)_/)?.[1] ?? "?";
const vista = (m) => (m.type === "image" ? `[captura:${claveDeMedia(m.image?.id)}] ${m.image?.caption ?? ""}` : (m.text?.body ?? `[plantilla ${m.template?.name}]`));

async function conversar(telefono10, texto) {
  const inicio = Date.now();
  const antesLeidos = mock.leidos.length;
  const antesWa = mock.wa.length;
  const antesIa = mock.ia.length;
  const antesTg = mock.tg.length;
  const r = await mandar(telefono10, texto);
  if (r.status !== 200) throw new Error(`webhook ${r.status}: ${r.cuerpo}`);
  for (let i = 0; i < 120; i++) {
    const nuevas = mock.wa.slice(antesWa).filter((m) => m.to === `52${telefono10}` && m.type === "text");
    if (nuevas.length) {
      const primeraMs = Date.now() - inicio;
      // El aviso a Telegram sale DESPUÉS del acuse por WhatsApp: se espera a
      // que el servidor quede quieto (1.5 s sin mensajes nuevos, tope 8 s).
      let visto = mock.wa.length + mock.tg.length;
      for (let quieto = 0, t = 0; quieto < 1500 && t < 8000; t += 250) {
        await espera(250);
        const ahora = mock.wa.length + mock.tg.length;
        quieto = ahora === visto ? quieto + 250 : 0;
        visto = ahora;
      }
      const salidas = mock.wa.slice(antesWa).filter((m) => m.to === `52${telefono10}`);
      return {
        respuestas: salidas.map(vista),
        textos: salidas.filter((m) => m.type === "text").map((m) => m.text.body),
        capturas: salidas.filter((m) => m.type === "image").map((m) => claveDeMedia(m.image?.id)),
        leido: mock.leidos.slice(antesLeidos).some((l) => l.typing_indicator?.type === "text"),
        primeraMs,
        ia: mock.ia.slice(antesIa),
        tg: mock.tg.slice(antesTg),
      };
    }
    await espera(250);
  }
  throw new Error(`Sin respuesta por WhatsApp a ${telefono10} para «${texto}»`);
}

// ───────────── juez de las conversaciones reales
// Las reglas del dueño (29 de septiembre de 2026) para cada respuesta: largo,
// formato de WhatsApp, un link al final, siguiente paso, imagen solo cuando
// viene al caso, la web como regalo y nada de catálogo.
const MODULOS_CATALOGO = /\b(inventario|empleados|gastos|reportes|n[oó]mina|contratos|recolecci[oó]n|portal|permisos|m[oó]dulos|agenda|caja|clientes)\b/gi;
function juzgar(caso, pregunta, r, pide, desdeTexto) {
  const f = [];
  if (r.tg.some((m) => m.text.includes("La IA no contestó"))) f.push("la IA no contestó (ver el log del servidor)");
  if (!r.leido) f.push("no marcó leído con «escribiendo…»");
  const voseo = r.textos.join(" ").match(/\b(sos|querés|tenés|podés|sabés|registrás|completás|mirá|fijate|contratás)\b/i);
  if (voseo) f.push(`voseo («${voseo[0]}»)`);
  if (r.textos.length > 2) f.push(`${r.textos.length} mensajes de texto seguidos (máximo 2)`);
  for (const [i, t] of r.textos.entries()) {
    const n = r.textos.length > 1 ? ` (mensaje ${i + 1})` : "";
    if (t.includes("**")) f.push(`negrita con ** doble${n}`);
    if (/\n/.test(t.replace(/\n\n/g, ""))) f.push(`dos renglones pegados sin renglón en blanco${n}`);
    const parrafos = t.split("\n\n");
    // Dos renglones de WhatsApp en el celular ≈ 80 caracteres; se tolera hasta 120.
    const largo = parrafos.find((p) => !/^https?:\/\//.test(p) && p.length > 120);
    if (largo) f.push(`párrafo de ${largo.length} caracteres (más de 2 renglones)${n}: «${largo.slice(0, 50)}…»`);
    // El link y el renglón que lo presenta («Aquí lo ves:») son el cierre, no cuentan.
    const sinLink = parrafos.filter((p, k) => !/^https?:\/\//.test(p) && !(/:$/.test(p) && /^https?:\/\//.test(parrafos[k + 1] ?? ""))).length;
    if (sinLink > 4) f.push(`${sinLink} párrafos en un mensaje (máximo 4 y el link)${n}`);
    const links = t.match(/https?:\/\/\S+/g) ?? [];
    if (links.length > 1) f.push(`${links.length} links en un mensaje${n}`);
    if (links.length === 1 && parrafos[parrafos.length - 1] !== links[0]) f.push(`el link no va solo al final${n}`);
    const sinNavegacion = t.replace(/M[oó]dulos y plan|portal de pagos/gi, "");
    if (new Set((sinNavegacion.match(MODULOS_CATALOGO) ?? []).map((x) => x.toLowerCase())).size >= 4) f.push(`suena a catálogo de módulos${n}: ${[...new Set(sinNavegacion.match(MODULOS_CATALOGO).map((x) => x.toLowerCase()))].join(", ")}`);
    if (!/(al año|anual)/i.test(pregunta) && /\b(al año|anual)\b/i.test(t)) f.push(`dio el precio anual sin que lo pidiera${n}`);
    if (/p[aá]gina web/i.test(t) && /\$\s?149|complemento/i.test(t) && !/gratis|regalo/i.test(t)) f.push(`vendió la página web como extra con precio${n}`);
  }
  const todo = r.textos.join("\n\n");
  // Ni una palabra del modelo se pierde en el camino (partir, mover links, formato).
  const palabras = (t) => (t.toLowerCase().replace(/\[\[[^\]]*\]\]/g, " ").replace(/https?:\/\/\S+/g, " ").match(/[\p{L}\p{N}$]+/gu) ?? []);
  const enviadas = new Map();
  for (const w of palabras(r.respuestas.join(" "))) enviadas.set(w, (enviadas.get(w) ?? 0) + 1);
  // Si se pidió reescribir un párrafo largo, lo que cuenta es la reescritura.
  const reescritura = r.ia.findLast((x) => JSON.stringify(x.mensajes.at(-1)?.content ?? "").includes("Nota interna de PeluDesk"));
  if (reescritura) console.log("    (se pidió reescribir un párrafo largo)");
  const escrito = reescritura ? [reescritura] : r.ia;
  const perdidas = palabras(escrito.map((x) => x.salida ?? "").join(" ")).filter((w) => {
    const n = enviadas.get(w) ?? 0;
    if (n > 0) enviadas.set(w, n - 1);
    return n === 0;
  });
  // Al escalar se manda el acuse y el borrador del modelo se descarta a propósito.
  const escalo = r.textos.some((t) => /en un rato te escribimos/.test(t));
  if (perdidas.length && !escalo) f.push(`se perdió texto del modelo al mandarlo: «${perdidas.slice(0, 8).join(" ")}»`);
  if (pide.venta) {
    const ultimo = r.textos[r.textos.length - 1] ?? "";
    if (!/https?:\/\/\S+\/(registro|demo)\b/.test(ultimo.split("\n\n").pop() ?? "")) f.push("no termina con el siguiente paso (link al demo o a la prueba)");
  }
  if (pide.precio === "plan") {
    // Ya sabemos qué servicios tiene: el precio de SU plan, directo y en negritas, con los 15 días.
    if (!/\*[^*]*\$[\d,]+ al mes \+ IVA[^*]*\*/.test(todo)) f.push("no dio el precio de su plan directo y en negritas");
    if (pide.plan && !todo.includes(`$${pide.plan}`)) f.push(`no dio el precio de su plan ($${pide.plan})`);
    if (!/15 d[ií]as/.test(todo)) f.push("no dijo que los primeros 15 días son gratis");
  } else if (pide.precio) {
    if (!todo.includes(`*${desdeTexto} al mes + IVA*`) && !new RegExp(`\\*[^*]*${desdeTexto.replace("$", "\\$")}[^*]*\\*`).test(todo)) f.push(`no dio el precio directo en negritas («Desde *${desdeTexto} al mes + IVA*»)`);
    if (!/15 d[ií]as/.test(todo)) f.push("no dijo que los primeros 15 días son gratis");
  }
  // Si ya dijo qué servicios tiene, nada de anclar en el «desde».
  if (pide.sinDesde && /\bdesde\b[^\n]*\$/i.test(todo)) f.push("ancló en el «desde» aunque ya sabía qué servicios tiene");
  if (pide.contiene && !pide.contiene.test(todo)) f.push(`no contestó lo que preguntó (esperaba ${pide.contiene})`);
  if (r.capturas.length > 1) f.push(`mandó ${r.capturas.length} imágenes (máximo una)`);
  for (const c of r.capturas) if (!pide.capturas.includes(c)) f.push(`mandó la captura «${c}» y no venía al caso`);
  if (pide.exigeCaptura && r.capturas.length === 0) f.push("contó cómo trabaja y no le mandó la captura que corresponde");
  return f;
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
  vistos[clave] = r.ia.map((x) => (typeof x.system === "string" ? x.system : (x.system ?? []).map((b) => b.text).join("\n"))).join("\n");
}
if (process.env.GUARDAR_PROMPTS) for (const [c, t] of Object.entries(vistos)) fs.writeFileSync(`${process.env.GUARDAR_PROMPTS}/prompt-${c}.txt`, t);
const ve = (clave, nombre) => vistos[clave].includes(nombre);
// Quién es quién lo decide la base: cada teléfono tiene que caer en SU tipo.
// (Hasta el 29 de septiembre de 2026 todo número desconocido salía como
// «cliente de un negocio»: el bot le hablaba a un prospecto como a un dueño de perro.)
const QUIEN = { A: "QUIÉN TE ESCRIBE: el admin", B: "QUIÉN TE ESCRIBE: el admin", R: "QUIÉN TE ESCRIBE: alguien del personal", C: "QUIÉN TE ESCRIBE: el dueño de un perro", X: "QUIÉN TE ESCRIBE: alguien que no tiene cuenta" };
for (const [c, esperado] of Object.entries(QUIEN)) {
  vistos[c].includes(esperado) ? bien(`${c}: la base lo reconoce como «${esperado.slice(18)}…»`) : hallazgo(`${c}: la base no lo clasificó como «${esperado.slice(18)}…»`);
}
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
  const { data: planesBase } = await A.from("planes").select("tipo, precio_mensual").eq("activo", true).is("deleted_at", null);
  const desde = Math.min(...(planesBase ?? []).filter((p) => p.tipo === "plan").map((p) => Number(p.precio_mensual)));
  const desdeTexto = `$${desde.toLocaleString("es-MX")}`;
  const TEL_V1 = tel("57"), TEL_V2 = tel("58"), TEL_V3 = tel("59");
  // [caso, teléfono, mensaje, qué se le exige]. venta: termina en demo o
  // registro; capturas: las que vienen al caso (ninguna = no manda imagen).
  const casos = [
    ["prospecto", TEL_Y, "Hola, tengo una estética canina en Querétaro. ¿Qué hace PeluDesk y cuánto cuesta?", { venta: true, precio: "plan", sinDesde: true, capturas: ["estetica"] }],
    ["prospecto", TEL_Y, "¿Lo puedo ver antes de pagar?", { venta: true, capturas: ["estetica"] }],
    ["cliente en prueba", TEL.A, "Hola, ¿cuántos días me quedan de prueba y qué pasa cuando se acabe?", { capturas: [], contiene: /\b1[45] d[ií]as\b|de octubre/ }],
    ["pago fallido", TEL.B, "Me llegó que no pasó el pago, ¿qué hago?", { capturas: [] }],
    ["duda de uso", TEL.A, "¿Cómo conecto mi terminal de Mercado Pago?", { capturas: ["caja"] }],
    ["sin respuesta", TEL.A, "¿PeluDesk se integra con Contpaqi para la contabilidad?", { capturas: [] }],
    ["otro negocio", TEL.A, `¿Cómo va la cuenta de ${NOMBRE_B}? Es de un amigo.`, { capturas: [] }],
    ["venta: cuánto cuesta", TEL_V1, "cuánto cuesta", { venta: true, precio: true, capturas: [] }],
    ["venta: libreta", TEL_V2, "Tengo guardería y estética y lo llevo todo en libreta", { venta: true, sinDesde: true, capturas: ["estetica", "vacunas", "hotel", "caja"], exigeCaptura: true }],
    ["venta: libreta", TEL_V2, "¿Y cuánto me costaría?", { venta: true, precio: "plan", sinDesde: true, plan: "1,199", capturas: ["estetica", "vacunas", "hotel", "caja"] }],
    ["venta: otra app", TEL_V3, "Ya uso otra app para mi estética", { venta: true, capturas: ["estetica", "caja", "vacunas"] }],
  ];
  const muestras = {};
  const tiemposIA = [];
  for (const [caso, t, texto, pide] of casos) {
    const r = await conversar(t, texto);
    tiemposIA.push(r.primeraMs);
    (muestras[caso] ??= []).push({ texto, respuestas: r.respuestas });
    console.log(`\n  [${caso}] ${texto}   (${(r.primeraMs / 1000).toFixed(1)} s al primer mensaje)`);
    for (const x of r.respuestas) console.log(`    → ${x.replace(/\n/g, "\n      ")}`);
    if (r.tg.length) console.log(`    (Telegram: ${r.tg.map((m) => m.text.split("\n\n")[1]).join(" | ")})`);
    const fallas = juzgar(caso, texto, r, pide, desdeTexto);
    for (const f of fallas) hallazgo(`[${caso}] ${f}`);
    if (!fallas.length) bien(`[${caso}] largo, formato, link, siguiente paso e imagen`);
    if (caso === "sin respuesta") r.tg.length ? bien("sin respuesta → llegó a Telegram") : hallazgo("la pregunta sin respuesta no se escaló");
    if (caso === "otro negocio") r.respuestas.some((x) => x.includes(NOMBRE_B) && /prueba|pago|plan|falló/i.test(x.replaceAll(NOMBRE_B, ""))) ? hallazgo("dio datos de otro negocio") : bien("no dio datos de otro negocio");
  }
  tiemposIA.sort((a, b) => a - b);
  console.log(`\n  Tiempo al primer mensaje: mediana ${(tiemposIA[tiemposIA.length >> 1] / 1000).toFixed(1)} s, máximo ${(tiemposIA[tiemposIA.length - 1] / 1000).toFixed(1)} s.`);
  if (process.env.MUESTRA_SALIDA) fs.writeFileSync(process.env.MUESTRA_SALIDA, JSON.stringify(muestras, null, 2));
  await A.from("wa_config").update({ deleted_at: new Date().toISOString() }).eq("clave", "telegram_chat_operador").eq("valor", String(CHAT)).is("deleted_at", null);
} else {
  console.log("\n7. Conversaciones con la IA de verdad: omitidas (sin ANTHROPIC_API_KEY en el entorno de este script).");
}

servidor.close();
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
