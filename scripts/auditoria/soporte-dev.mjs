// Ayuda y soporte de punta a punta (SOLO DESARROLLO), con el navegador y las
// pantallas reales, en Huellitas (negocio de prueba). Con el servidor
// prendido apuntando a los dobles de este script (puerto 4456, los mismos
// que usa whatsapp-bot.mjs):
//
//   WHATSAPP_GRAPH_URL=http://127.0.0.1:4456 TELEGRAM_API_URL=http://127.0.0.1:4456 \
//   ANTHROPIC_API_URL=http://127.0.0.1:4456 WHATSAPP_TOKEN=wa-prueba \
//   WHATSAPP_PHONE_NUMBER_ID=PHONE_PRUEBA WHATSAPP_APP_SECRET=secreto-app-prueba \
//   TELEGRAM_BOT_TOKEN=tg-prueba ANTHROPIC_API_KEY=ia-prueba \
//   npm run build && npm run start -- -p 3001
//
//   node scripts/auditoria/soporte-dev.mjs
//
// El doble de Anthropic reenvía a la API DE VERDAD si este script tiene
// ANTHROPIC_API_KEY en su entorno (y ANTHROPIC_WORKSPACE_ID si hace falta):
// así se evalúa el modelo real con las 13 preguntas. Sin llave, contesta con
// guiones (cita el artículo esperado o llama a sin_documentacion) y se
// prueba todo el camino menos el juicio del modelo.
//
// Recorre:
//   1. peludesk.mx/ayuda: índice agrupado, buscador, artículo; toda captura
//      que un artículo nombra existe; un artículo inventado da 404.
//   2. En la app: «Ayuda» en el menú de recepción; el «?» de /caja/turno abre
//      el corte de caja; un módulo apagado esconde sus artículos (y su URL).
//   3. El asistente: 10 preguntas reales contestadas con su artículo citado
//      (link) y 3 que no están documentadas → ofrece ticket, sin inventar.
//      Lo que llega al modelo: solo documentación de los módulos activos,
//      nada de datos del negocio, ningún otro negocio.
//   4. Ticket desde el asistente (con captura): llega a Telegram; PeluDesk
//      contesta respondiendo ahí; a recepción le sale el aviso y ve la
//      respuesta; recepción contesta; /resolver lo resuelve y, como no estaba
//      documentado, deja la propuesta del artículo. /plataforma/soporte lo ve.
//   5. El admin con cuenta de teléfono recibe la respuesta por WhatsApp.
import fs from "node:fs";
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = 3001;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const TG_TOKEN = "tg-prueba";
const TG_SECRETO = createHmac("sha256", TG_TOKEN).update("peludesk:telegram-webhook").digest("hex").slice(0, 48);
const CHAT = 777000111;
const IA_REAL = (process.env.ANTHROPIC_API_KEY ?? "").trim();
const IA_WORKSPACE = (process.env.ANTHROPIC_WORKSPACE_ID ?? "").trim();
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

// Las preguntas: 10 de uso real con el artículo que tiene que citar, y 3
// que no están documentadas.
const DOCUMENTADAS = [
  ["¿Cómo hago el corte de caja al final del día?", ["corte-de-caja"]],
  ["¿Cómo registro que ya llegó un perro a la guardería?", ["registrar-check-in"]],
  ["Mandé el cobro a la terminal y no le llega, ¿qué hago?", ["terminal-no-recibe-el-cobro", "cobrar-con-terminal"]],
  ["¿Cómo le mando a un cliente nuevo el link para que se dé de alta él solo?", ["alta-de-cliente-con-link"]],
  ["¿Cómo le vendo un shampoo a alguien que no es cliente?", ["venta-rapida", "vender-producto-en-mostrador"]],
  ["Un cliente pagó con Mercado Pago y hay que regresarle el dinero, ¿cómo le hago?", ["devolver-un-cobro"]],
  ["¿Cómo agendo un baño para mañana?", ["agendar-cita-estetica"]],
  ["¿Dónde veo qué contratos faltan de firmar?", ["mandar-a-firmar-un-contrato"]],
  ["¿Cómo le vendo una mensualidad de guardería a un perro?", ["vender-day-pass-o-mensualidad"]],
  ["¿Cómo le mando al cliente un link de pago por WhatsApp?", ["link-de-pago-whatsapp"]],
];
const NO_DOCUMENTADAS = [
  "¿Cómo exporto todos mis clientes a un Excel?",
  "¿Puedo mandarles a los clientes recordatorios automáticos de su cita por SMS?",
  "¿Cómo timbro la factura CFDI de un cobro?",
];

// ───────────── dobles de WhatsApp, Telegram y Anthropic
const mock = { wa: [], tg: [], ia: [], tgId: 5000 };
const servidor = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const j = cuerpo && (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(cuerpo) : {};
  const responder = (obj, status = 200) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.url.startsWith("/v23.0/PHONE_PRUEBA/messages")) {
    if (j.status !== "read") mock.wa.push(j);
    return responder({ messages: [{ id: `wamid.${randomUUID()}` }] });
  }
  if (req.url.startsWith(`/bot${TG_TOKEN}/`)) {
    if (req.url.endsWith("/sendMessage")) {
      const id = ++mock.tgId;
      mock.tg.push({ ...j, message_id: id });
      return responder({ ok: true, result: { message_id: id } });
    }
    return responder({ ok: true, result: true });
  }
  if (req.url === "/v1/messages") {
    const sistema = typeof j.system === "string" ? j.system : (j.system ?? []).map((b) => b.text).join("\n");
    const pregunta = [...j.messages].reverse().find((m) => m.role === "user" && typeof m.content === "string")?.content ?? "";
    mock.ia.push({ sistema, pregunta, tools: (j.tools ?? []).map((t) => t.name), cache: Array.isArray(j.system) && j.system.some((b) => b.cache_control) });
    if (IA_REAL) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": IA_REAL, "anthropic-version": "2023-06-01", ...(IA_WORKSPACE ? { "anthropic-workspace-id": IA_WORKSPACE } : {}) },
        body: cuerpo,
      });
      const crudo = await r.text();
      try {
        mock.ia.at(-1).salida = JSON.parse(crudo).content;
      } catch {}
      res.writeHead(r.status, { "content-type": "application/json" });
      return res.end(crudo);
    }
    const usage = { input_tokens: 1200, output_tokens: 80 };
    // La propuesta de artículo (sin herramientas).
    if (sistema.startsWith("Escribes artículos")) {
      return responder({ content: [{ type: "text", text: '{\n  slug: "exportar-clientes",\n  titulo: "Cómo …",\n  cuerpo: `…`,\n}' }], usage });
    }
    const doc = DOCUMENTADAS.find(([p]) => pregunta.includes(p));
    if (doc) {
      return responder({ content: [{ type: "text", text: `1. Entra a la pantalla.\n2. Aprieta el botón.\n[[articulo:${doc[1][0]}]]` }], usage });
    }
    return responder({ content: [{ type: "tool_use", id: "tu_1", name: "sin_documentacion", input: { motivo: pregunta.slice(0, 80) } }], usage });
  }
  responder({ error: "no existe" }, 404);
});
await new Promise((r) => servidor.listen(4456, "127.0.0.1", r));

function pedirApp(host, ruta, { method = "GET", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method, headers: { host, ...(body ? { "content-type": "application/json" } : {}), ...headers } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, cuerpo: d }));
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}
const telegram = (update) =>
  pedirApp(`plataforma.localhost:${PUERTO}`, "/api/telegram/webhook", { method: "POST", body: JSON.stringify(update), headers: { "x-telegram-bot-api-secret-token": TG_SECRETO } });
const responderEnTelegram = (messageId, texto) =>
  telegram({ update_id: Date.now(), message: { message_id: Date.now() % 100000, chat: { id: CHAT }, text: texto, reply_to_message: { message_id: messageId } } });

const { data: huellitas } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const H = huellitas.id;
const BASE = `http://huellitas.localhost:${PUERTO}`;
const PLATAFORMA = `http://plataforma.localhost:${PUERTO}`;
const SH = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });

async function cookiesDe(profileId, dominio = "huellitas.localhost") {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: dominio, path: "/" }));
}
const miembro = async (rol) => (await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", rol).is("deleted_at", null).order("created_at").limit(1).single()).data.profile_id;

// Un admin de Huellitas con cuenta de TELÉFONO (para el WhatsApp).
const TEL_ADMIN = "4420001999";
async function adminDeTelefono() {
  const email = `t${TEL_ADMIN}@telefono.ludogteka.mx`;
  let { data: id } = await A.rpc("usuario_por_email", { p_email: email });
  if (!id) {
    const { data, error } = await A.auth.admin.createUser({ email, password: `Prueba-${randomUUID()}`, email_confirm: true, user_metadata: { nombre_completo: "Admin 2 Huellitas" } });
    if (error) throw error;
    id = data.user.id;
  }
  const { data: m } = await A.from("membresias").select("rol").eq("negocio_id", H).eq("profile_id", id).is("deleted_at", null).maybeSingle();
  if (!m) {
    const { error } = await SH.rpc("agregar_admin_negocio", { p_negocio_id: H, p_profile_id: id });
    if (error) throw new Error(`agregar_admin_negocio: ${error.message}`);
  }
  return id;
}

// La bandeja de Telegram de la prueba (se restaura al final).
const { data: chatPrevio } = await A.from("wa_config").select("id, valor").eq("clave", "telegram_chat_operador").is("deleted_at", null).maybeSingle();
await A.from("wa_config").update({ deleted_at: new Date().toISOString() }).eq("clave", "telegram_chat_operador").is("deleted_at", null);
await A.from("wa_config").insert({ clave: "telegram_chat_operador", valor: String(CHAT) });
// Ventana de WhatsApp abierta para el admin de teléfono (escribió hace un rato).
const TEL_WA = `52${TEL_ADMIN}`;
await A.from("wa_hilos").update({ deleted_at: new Date().toISOString() }).eq("telefono", TEL_WA).is("deleted_at", null);
await A.from("wa_hilos").insert({ telefono: TEL_WA, ultimo_entrante_at: new Date(Date.now() - 3600_000).toISOString() });

const nav = await abrirNavegador();
const idRecep = await miembro("recepcion");
const idAdminTel = await adminDeTelefono();
const ctxRecep = await nav.newContext();
await ctxRecep.addCookies(await cookiesDe(idRecep));
const recep = await ctxRecep.newPage();
const ctxAdmin = await nav.newContext();
await ctxAdmin.addCookies(await cookiesDe(idAdminTel));
const admin = await ctxAdmin.newPage();
const publico = await (await nav.newContext()).newPage();
const salida = [];

try {
  console.log("\n1. Centro de ayuda público");
  await publico.goto(`${PLATAFORMA}/ayuda`, { waitUntil: "networkidle" });
  const titulos = await publico.locator("main h2").allInnerTexts();
  if (titulos.length < 8) hallazgo(`el índice público no está agrupado por módulo: ${titulos.join(", ")}`);
  else bien(`índice público con ${titulos.length} grupos (${titulos.slice(0, 4).join(", ")}…)`);
  await publico.locator("[data-buscador-ayuda]").fill("corte de caja");
  await publico.getByText("Cómo abrir el turno y hacer el corte de caja").first().waitFor({ timeout: 5000 }).then(
    () => bien("el buscador encuentra «corte de caja»"),
    async () => hallazgo(`el buscador no encontró el corte de caja: ${(await publico.locator("main li").allInnerTexts()).slice(0, 3)}`)
  );
  await publico.goto(`${PLATAFORMA}/ayuda/corte-de-caja`, { waitUntil: "networkidle" });
  if (!(await publico.locator("h1").innerText()).toLowerCase().includes("corte")) hallazgo("el artículo público no abre");
  else bien("el artículo público abre en peludesk.mx/ayuda/corte-de-caja");
  const inventado = await pedirApp(`plataforma.localhost:${PUERTO}`, "/ayuda/articulo-que-no-existe");
  if (inventado.status !== 404) hallazgo(`un artículo inventado respondió ${inventado.status}`);
  const fuente = fs.readFileSync("src/lib/ayuda/articulos/dia-y-reservas.ts", "utf8") + fs.readFileSync("src/lib/ayuda/articulos/caja-y-estetica.ts", "utf8") + fs.readFileSync("src/lib/ayuda/articulos/administracion.ts", "utf8");
  const capturas = [...fuente.matchAll(/captura:\s*"([^"]+)"/g)].map((m) => m[1]);
  const faltan = capturas.filter((c) => !fs.existsSync(`public/ayuda/capturas/${c}`));
  if (faltan.length) hallazgo(`artículos con captura que no existe: ${faltan.join(", ")}`);
  else bien(`las ${capturas.length} capturas de los artículos existen (public/ayuda/capturas)`);
  const enNegocio = await pedirApp(`huellitas.localhost:${PUERTO}`, "/peludesk/ayuda");
  if (enNegocio.status !== 404) hallazgo(`el centro público se ve en el dominio de un negocio (${enNegocio.status})`);

  console.log("\n2. Ayuda dentro de la app");
  await recep.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
  if (!(await recep.getByRole("link", { name: "Ayuda", exact: true }).count())) hallazgo("recepción no ve «Ayuda» en el menú");
  const slugBoton = await recep.locator("[data-boton-ayuda]").getAttribute("data-boton-ayuda");
  if (slugBoton !== "corte-de-caja") hallazgo(`el «?» de /caja/turno abre «${slugBoton}»`);
  else {
    await recep.locator("[data-boton-ayuda]").click();
    await recep.waitForURL(/\/ayuda\/corte-de-caja/);
    bien("«Ayuda» en el menú de recepción; el «?» de /caja/turno abre «corte de caja»");
  }
  // Un módulo apagado esconde sus artículos.
  await SH.from("negocio_modulos").delete().eq("negocio_id", H).eq("modulo", "estetica");
  await SH.from("negocio_modulos").insert({ negocio_id: H, modulo: "estetica", activo: false, updated_at: new Date().toISOString() });
  await recep.goto(`${BASE}/ayuda`, { waitUntil: "networkidle" });
  const conEstetica = await recep.getByText("Cómo agendar una cita de estética").count();
  const r404 = await recep.goto(`${BASE}/ayuda/agendar-cita-estetica`);
  await SH.from("negocio_modulos").delete().eq("negocio_id", H).eq("modulo", "estetica");
  if (conEstetica || r404.status() !== 404) hallazgo(`con estética apagada se ve su artículo (${conEstetica}, ${r404.status()})`);
  else bien("con estética apagada, sus artículos no salen ni abren (404)");

  console.log(`\n3. El asistente ${IA_REAL ? "(modelo REAL)" : "(guiones)"}`);
  const preguntar = async (pregunta) => {
    await recep.goto(`${BASE}/ayuda?desde=/caja`, { waitUntil: "networkidle" });
    const caja = recep.locator("[data-asistente]");
    await caja.getByLabel("Pregúntale al asistente").fill(pregunta);
    await caja.getByRole("button", { name: "Preguntar" }).click();
    await caja.locator('[data-mensaje="asistente"], [role=alert]').first().waitFor({ timeout: 60_000 });
    const texto = await caja.locator('[data-mensaje="asistente"]').last().innerText().catch(() => "");
    const citas = await caja.locator("[data-cita]").evaluateAll((els) => els.map((e) => e.getAttribute("data-cita")));
    const ofrece = (await caja.locator('[data-ofrecer-ticket="si"]').count()) > 0;
    const error = await caja.locator("[role=alert]").innerText().catch(() => null);
    return { texto, citas, ofrece, error };
  };
  let buenas = 0;
  for (const [p, esperados] of DOCUMENTADAS) {
    const r = await preguntar(p);
    salida.push({ pregunta: p, ...r });
    if (r.error) hallazgo(`«${p}»: ${r.error}`);
    else if (r.ofrece || !r.citas.some((c) => esperados.includes(c))) hallazgo(`«${p}» no contestó con su artículo (citó ${r.citas.join(", ") || "nada"}; esperado ${esperados.join(" o ")}): ${r.texto.slice(0, 200)}`);
    else buenas++;
  }
  if (buenas === DOCUMENTADAS.length) bien(`las ${buenas} preguntas de uso se contestaron citando su artículo (con link)`);
  let sinInventar = 0;
  let ultima;
  for (const p of NO_DOCUMENTADAS) {
    const r = await preguntar(p);
    salida.push({ pregunta: p, ...r });
    ultima = r;
    if (r.citas.length || !r.ofrece) hallazgo(`«${p}» no ofreció ticket (citó ${r.citas.join(", ") || "nada"}): ${r.texto.slice(0, 200)}`);
    else sinInventar++;
  }
  if (sinInventar === NO_DOCUMENTADAS.length) bien(`las ${sinInventar} preguntas sin documentar no se inventaron: ofrece crear ticket`);
  void ultima;
  const llamadas = mock.ia.filter((x) => x.tools.includes("sin_documentacion"));
  const sistema = llamadas.at(-1)?.sistema ?? "";
  if (!llamadas.every((x) => x.cache)) hallazgo("la documentación no va en un bloque con caché");
  if (/Ludogteka|ZZSECRETO|Dueña Huellitas/.test(sistema)) hallazgo("al modelo le llegan datos de un negocio o de un cliente");
  if (sistema.includes('slug="agendar-cita-estetica"') === false) hallazgo("al modelo no le llega la documentación de estética (módulo activo)");
  else bien("al modelo le llega solo la documentación (en caché) y el nombre de su negocio; ningún dato de clientes ni de otro negocio");

  console.log("\n4. Ticket desde el asistente, con captura");
  await recep.getByRole("link", { name: "Crear ticket con lo que platicamos" }).click();
  await recep.waitForURL(/\/ayuda\/tickets\/nuevo/);
  const asuntoPrellenado = await recep.getByLabel("Asunto").inputValue();
  const descripcionPrellenada = await recep.getByLabel("¿Qué pasó?").inputValue();
  if (!asuntoPrellenado || !descripcionPrellenada.includes("CFDI")) hallazgo(`el ticket no trae lo platicado: «${asuntoPrellenado}» / «${descripcionPrellenada}»`);
  else bien("el formulario trae lo que se platicó con el asistente");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await recep.locator("#captura").setInputFiles({ name: "pantalla.png", mimeType: "image/png", buffer: png });
  const tgAntes = mock.tg.length;
  await recep.getByRole("button", { name: "Mandar ticket" }).click();
  await recep.waitForURL(/\/ayuda\/tickets\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const ticketId = recep.url().match(/tickets\/([0-9a-f-]{36})/)[1];
  const { data: t } = await SH.from("soporte_tickets").select("*").eq("negocio_id", H).eq("id", ticketId).single();
  if (!t.conversacion_id || !t.pantalla || !t.navegador || !t.sin_documentar || !t.captura_path) hallazgo(`al ticket le falta algo de lo que se adjunta solo: ${JSON.stringify({ c: t.conversacion_id, p: t.pantalla, n: t.navegador, s: t.sin_documentar, cap: t.captura_path })}`);
  else bien(`ticket #${t.numero} con pantalla (${t.pantalla}), navegador, conversación y captura`);
  const avisoTg = mock.tg.slice(tgAntes).find((m) => m.text.includes(`Ticket #${t.numero}`));
  if (!avisoTg || !avisoTg.text.includes("NUEVO") || avisoTg.chat_id !== CHAT) hallazgo("el ticket no llegó a la bandeja de Telegram");
  else bien("llegó a la bandeja de Telegram");
  const r1 = await responderEnTelegram(avisoTg.message_id, "Hola, desde la app todavía no se timbra. Te explico cómo hacerlo por fuera.");
  const rj = JSON.parse(r1.cuerpo);
  if (rj.resultado !== "ticket contestado") hallazgo(`contestar en Telegram no llegó al ticket: ${r1.cuerpo}`);
  await recep.goto(`${BASE}/caja`, { waitUntil: "networkidle" });
  if (!(await recep.locator("[data-aviso-ticket]").count())) hallazgo("a recepción no le sale el aviso de la respuesta");
  else bien("PeluDesk contestó desde Telegram y a recepción le sale el aviso arriba");
  await recep.locator("[data-aviso-ticket] a").click();
  await recep.waitForURL(/\/ayuda\/tickets\//);
  if (!(await recep.locator('[data-autor="plataforma"]').count())) hallazgo("la respuesta no se ve en el ticket");
  await recep.goto(`${BASE}/caja`, { waitUntil: "networkidle" });
  if (await recep.locator("[data-aviso-ticket]").count()) hallazgo("el aviso sigue después de abrir el ticket");
  else bien("recepción ve la respuesta; al abrirlo, el aviso se apaga");
  await recep.goto(`${BASE}/ayuda/tickets/${ticketId}`, { waitUntil: "networkidle" });
  const tgAntes2 = mock.tg.length;
  await recep.getByLabel("Tu mensaje").fill("Gracias, así lo hago.");
  await recep.getByRole("button", { name: "Mandar" }).click();
  await recep.getByText("Mandado").waitFor({ timeout: 20_000 });
  const vuelta = mock.tg.slice(tgAntes2).find((m) => m.text.includes(`Ticket #${t.numero}`));
  if (!vuelta || vuelta.text.includes("NUEVO")) hallazgo("la respuesta del negocio no llegó a Telegram");
  else bien("la respuesta del negocio llega a Telegram (el ticket va y viene)");
  const r2 = await responderEnTelegram(vuelta.message_id, "/resolver");
  const { data: t2 } = await SH.from("soporte_tickets").select("estado, articulo_propuesto").eq("negocio_id", H).eq("id", ticketId).single();
  if (JSON.parse(r2.cuerpo).resultado !== "ticket resuelto" || t2.estado !== "resuelto") hallazgo(`/resolver no lo resolvió: ${r2.cuerpo} ${t2.estado}`);
  else if (!t2.articulo_propuesto) hallazgo("resuelto sin documentar, pero no dejó la propuesta del artículo");
  else bien("/resolver lo resuelve y, como no estaba documentado, deja la propuesta del artículo nuevo");
  const ajeno = await telegram({ update_id: 1, message: { message_id: 1, chat: { id: 123 }, text: "hola", reply_to_message: { message_id: vuelta.message_id } } });
  if (JSON.parse(ajeno.cuerpo).resultado !== "chat ajeno ignorado") hallazgo(`un chat que no es la bandeja contestó un ticket: ${ajeno.cuerpo}`);
  else bien("un chat de Telegram que no es la bandeja no toca tickets");

  console.log("\n5. Admin con teléfono: la respuesta le llega por WhatsApp");
  await admin.goto(`${BASE}/ayuda/tickets/nuevo?desde=/caja/turno&asunto=Duda%20del%20corte`, { waitUntil: "networkidle" });
  await admin.getByLabel("¿Qué pasó?").fill("El corte me sale con diferencia en transferencias.");
  await admin.getByRole("button", { name: "Mandar ticket" }).click();
  await admin.waitForURL(/\/ayuda\/tickets\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const idAdm = admin.url().match(/tickets\/([0-9a-f-]{36})/)[1];
  const { data: tA } = await SH.from("soporte_tickets").select("numero").eq("negocio_id", H).eq("id", idAdm).single();
  const avisoA = mock.tg.find((m) => m.text.includes(`Ticket #${tA.numero}`) && m.text.includes("NUEVO"));
  const waAntes = mock.wa.length;
  await responderEnTelegram(avisoA.message_id, "Revisa si algún link se pagó sin turno abierto.");
  const wa = mock.wa.slice(waAntes).find((m) => m.to === TEL_WA);
  if (!wa || !wa.text?.body?.includes(`#${tA.numero}`)) hallazgo(`al admin no le llegó la respuesta por WhatsApp: ${JSON.stringify(mock.wa.slice(waAntes))}`);
  else bien("al admin le llegó la respuesta por WhatsApp, con el link al ticket");
  await recep.goto(`${BASE}/ayuda/tickets/${idAdm}`);
  if (await recep.locator("[data-hilo-ticket]").count()) hallazgo("recepción ve el ticket del admin");
  else bien("recepción no ve el ticket del admin (404)");
  const tp = await pedirApp(`plataforma.localhost:${PUERTO}`, "/plataforma/soporte");
  if (tp.status !== 307 && tp.status !== 302 && !tp.cuerpo.includes("entrar")) hallazgo(`/plataforma/soporte sin sesión respondió ${tp.status}`);
  else bien("/plataforma/soporte pide la sesión de la administración");
} catch (e) {
  hallazgo(`el recorrido tronó: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  await recep.screenshot({ path: "/tmp/soporte-recepcion.png" }).catch(() => {});
  await admin.screenshot({ path: "/tmp/soporte-admin.png" }).catch(() => {});
} finally {
  if (process.env.MUESTRA_SALIDA) fs.writeFileSync(process.env.MUESTRA_SALIDA, JSON.stringify(salida, null, 1));
  await A.from("wa_config").update({ deleted_at: new Date().toISOString() }).eq("clave", "telegram_chat_operador").is("deleted_at", null);
  if (chatPrevio) await A.from("wa_config").insert({ clave: "telegram_chat_operador", valor: chatPrevio.valor });
  await A.from("wa_hilos").update({ deleted_at: new Date().toISOString() }).eq("telefono", TEL_WA).is("deleted_at", null);
  await SH.from("negocio_modulos").delete().eq("negocio_id", H).eq("modulo", "estetica");
  await nav.close();
  servidor.close();
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
