// Guion de ventas del bot de WhatsApp de PeluDesk (SOLO DESARROLLO, 25 de octubre de 2026).
//
//   npm run build
//   node scripts/auditoria/whatsapp-ventas-dev.mjs
//
// Levanta `next start` en el 3001 con dobles de la Graph API, Telegram y Anthropic (puerto 4458). El doble de
// Anthropic hace de CLASIFICADOR para los mensajes que las reglas no entienden (como la IA de verdad: solo elige la
// rama con la herramienta elegir_rama; nunca redacta). Nunca manda un mensaje real.
//
// 20 conversaciones simuladas por el webhook (info, precio, cada objeción, cambios de tema, audio sin texto, emoji,
// «ya tengo cuenta», alguien que es cliente de un negocio, prospecto con ref, dos dudas seguidas, sucursales,
// una persona, la IA que entiende el giro), y en cada mensaje comprueba:
//   · la rama que tomó el guion (wa_ventas.ultima_rama);
//   · que ninguna respuesta trae una cifra con $ fuera de las fijas (precios de la base);
//   · que el botón «Probar gratis» nunca lleva el link de /registro (solo el respaldo por texto);
//   · que la conversación termina ofreciendo el botón, en manos de una persona (Telegram) o con la baja.
// Además: el Flow rechazado cae a texto con el link; la calificación se guarda en el prospecto; los seguimientos
// (formulario abierto sin completar a las 2 h, sin giro a las 24 h, «lo pienso» a los 2 días fuera de la ventana sin
// plantilla aprobada = nada), máximo 2.
import { limpiarAlTerminar } from "../lib/limpieza-dev.mjs";
limpiarAlTerminar({
  prefijos: [],
  bitacoras: ["wa_ventas", "wa_flow_sesiones", "wa_mensajes", "wa_entregas", "wa_hilos", "wa_uso_ia", "prospectos_eventos", "prospectos_contactos", "prospectos", "seguimiento_pruebas_exclusiones", "wa_config"],
});
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { createHmac, generateKeyPairSync, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cifrarPeticion } from "../../src/lib/whatsapp/flow/cifrado.ts";
import { cifrasNoFijas } from "../../src/lib/whatsapp/conversacion.ts";

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
const PUERTO_DOBLE = 4458;
const PHONE_ID = "PHONE_PRUEBA";
const APP_SECRET = `secreto-app-${randomUUID()}`;
const TG_TOKEN = "tg-prueba";
const CRON = `cron-${randomUUID()}`;
const { publicKey: PUBLICA, privateKey: PRIVADA } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });

const hallazgos = [];
const comprobar = (ok, t) => (ok ? console.log(`  ✔ ${t}`) : (hallazgos.push(t), console.log(`  ✘ ${t}`)));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const esperarHasta = async (fn, ms = 30000, paso = 400) => { const t = Date.now(); for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t > ms) return null; await espera(paso); } };
const tel = () => `5299${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

// Los precios de la base, como los lee el bot (preciosDelBot).
const { data: planes } = await A.from("planes").select("tipo, precio_mensual, precio_anual").eq("activo", true).is("deleted_at", null);
const plan = (planes ?? []).find((p) => p.tipo === "plan" && Number(p.precio_mensual) > 0);
const suc = (planes ?? []).find((p) => p.tipo === "sucursal" && Number(p.precio_mensual) > 0);
// El precio por recordatorio automático entregado (wa_precios) también es cifra fija: lo dice la respuesta de recordatorios.
const hoyMx = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
const { data: precioRec } = await A.from("wa_precios").select("precio_mxn").is("deleted_at", null).lte("vigente_desde", hoyMx).order("vigente_desde", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
const PRECIOS = { mensual: Number(plan?.precio_mensual), anual: Number(plan?.precio_anual), sucursal: Number(suc?.precio_mensual), recordatorio: precioRec ? Number(precioRec.precio_mxn) : null };

// ───────────── dobles
const mock = { wa: [], tg: [], ia: [], rechazarFlow: false };
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
  if (req.url.includes("/message_templates")) return responder({ data: [] });
  if (req.url.startsWith(`/bot${TG_TOKEN}/`)) {
    mock.tg.push(j);
    return responder({ ok: true, result: { message_id: mock.tg.length } });
  }
  if (req.url === "/v1/messages") {
    const usage = { input_tokens: 50, output_tokens: 10 };
    if ((j.tools ?? []).some((t) => t.name === "elegir_rama")) {
      const msj = String(j.messages?.at(-1)?.content ?? "").split("Mensaje de la persona:").pop().toLowerCase();
      mock.ia.push(msj);
      const entrada =
        /conocer|de que va|saber mas del/.test(msj) ? { rama: "entrada" }
        : /domicilio|banito|baño a perritos|bano a perritos/.test(msj) ? { rama: "giro", giro: "estetica" }
        : { rama: "desconocido" };
      return responder({ content: [{ type: "tool_use", id: "tu_1", name: "elegir_rama", input: entrada }], usage });
    }
    return responder({ content: [{ type: "text", text: "Respuesta de prueba." }], usage });
  }
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
    PELUDESK_WABA_ID: "WABA_PRUEBA",
    TELEGRAM_BOT_TOKEN: TG_TOKEN,
    ANTHROPIC_API_KEY: "ia-prueba",
    WHATSAPP_FLOW_ID: "FLOW_PRUEBA",
    WHATSAPP_FLOW_PRIVATE_KEY: PRIVADA,
    WHATSAPP_GUION_VENTAS: "1",
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

function pedir(ruta, { method = "GET", body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const q = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method, headers: { host: `plataforma.localhost:${PUERTO}`, ...headers } }, (r) => {
      const trozos = [];
      r.on("data", (c) => trozos.push(c));
      r.on("end", () => resolve({ status: r.statusCode, texto: Buffer.concat(trozos).toString("utf8") }));
    });
    q.on("error", reject);
    if (body) q.write(body);
    q.end();
  });
}
const firma = (crudo) => `sha256=${createHmac("sha256", APP_SECRET).update(crudo, "utf8").digest("hex")}`;
async function alWebhook(telefono, mensaje) {
  const crudo = JSON.stringify({
    entry: [{ changes: [{ value: { metadata: { phone_number_id: PHONE_ID }, contacts: [{ wa_id: telefono, profile: { name: "Prueba Ventas" } }], messages: [{ from: telefono, id: `wamid.${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), ...mensaje }] } }] }],
  });
  return pedir("/api/whatsapp/webhook", { method: "POST", body: crudo, headers: { "content-type": "application/json", "x-hub-signature-256": firma(crudo) } });
}
const texto = (body) => ({ type: "text", text: { body } });
const boton = (title) => ({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "x", title } } });
const salidas = (t) => mock.wa.filter((m) => m.to === t);
const cuerpoDe = (m) => (m.type === "text" ? m.text.body : m.type === "interactive" ? m.interactive.body.text : m.type === "template" ? `[plantilla ${m.template.name}]` : "");
const tipoDe = (m) => (m.type === "interactive" ? m.interactive.type : m.type);
const ventas = async (t) => (await A.from("wa_ventas").select("*").eq("telefono", t).is("deleted_at", null).maybeSingle()).data;

/** Un mensaje de la persona: espera la respuesta y devuelve lo que salió (y la rama). */
async function dice(t, mensaje) {
  const antesWa = salidas(t).length;
  const antesTg = mock.tg.length;
  await alWebhook(t, typeof mensaje === "string" ? texto(mensaje) : mensaje);
  await esperarHasta(async () => salidas(t).length > antesWa || mock.tg.length > antesTg, 30000);
  await espera(600);
  const nuevas = salidas(t).slice(antesWa);
  return { nuevas, rama: (await ventas(t))?.ultima_rama, humano: mock.tg.length > antesTg };
}

const ultimas = {};
/** Corre una conversación: [mensaje, rama esperada, comprobación opcional de lo que salió]. */
async function conversacion(nombre, t, pasos, fin) {
  console.log(`\n${nombre}`);
  let ultimo = null;
  let humano = false;
  for (const [mensaje, ramaEsperada, extra] of pasos) {
    const r = await dice(t, mensaje);
    const etiqueta = typeof mensaje === "string" ? `«${mensaje}»` : `[${mensaje.type}]`;
    comprobar(r.rama === ramaEsperada, `${etiqueta} → ${ramaEsperada}${r.rama === ramaEsperada ? "" : ` (fue ${r.rama})`}`);
    for (const m of r.nuevas) {
      const c = cuerpoDe(m);
      const malas = cifrasNoFijas(c, PRECIOS);
      if (malas.length) comprobar(false, `cifra fuera de las fijas en «${c.slice(0, 80)}…»: ${malas.join(", ")}`);
      if (tipoDe(m) === "flow" && /\/registro|\/ir\/prueba/.test(c)) comprobar(false, `el botón lleva el link de registro: «${c.slice(0, 80)}…»`);
    }
    if (extra) extra(r);
    ultimo = r.nuevas.at(-1) ?? ultimo;
    humano = r.humano || humano;
  }
  const v = await ventas(t);
  const termina = fin === "humano" ? humano : fin === "baja" ? v?.etapa === "cerrada" : ultimo && tipoDe(ultimo) === "flow";
  comprobar(Boolean(termina), `termina ${fin === "humano" ? "con una persona (Telegram)" : fin === "baja" ? "con la baja" : "ofreciendo el botón «Probar gratis»"}`);
  ultimas[nombre] = ultimo ? cuerpoDe(ultimo) : null;
}

try {
  const listo = await esperarHasta(async () => (await pedir("/registro").catch(() => null))?.status === 200, 90000, 1000);
  comprobar(Boolean(listo), "el servidor de la prueba arrancó (necesita `npm run build`)");
  if (!listo) throw new Error(`sin servidor:\n${bitacora.slice(-1500)}`);
  comprobar(PRECIOS.mensual > 0, `precios de la base: $${PRECIOS.mensual} al mes`);

  const giroBotones = (r) => comprobar(tipoDe(r.nuevas.at(-1) ?? {}) === "button" && r.nuevas.at(-1).interactive.action.buttons.map((b) => b.reply.title).join("|") === "Estética|Hotel o guardería|Veterinaria", "   pregunta el giro con los tres botones");
  const contiene = (re, que) => (r) => comprobar(r.nuevas.some((m) => re.test(cuerpoDe(m))), `   ${que}`);
  // Una respuesta larga sale partida en varios mensajes (formato del bot): se lee completa.
  const contieneJunto = (re, que) => (r) => { const t = r.nuevas.map(cuerpoDe).join(" "); if (!re.test(t)) console.log(`      (se mandó: ${t.slice(0, 1500)})`); comprobar(re.test(t), `   ${que}`); };

  // 1. info → estética → 40 citas
  const T1 = tel();
  await conversacion("1. «info», estética, 40 citas", T1, [
    ["info", "entrada", (r) => { giroBotones(r); contiene(/PeluDesk es el sistema para estéticas, hoteles y veterinarias/, "dice qué es PeluDesk")(r); }],
    [boton("Estética"), "giro", contiene(/sale solo, automático, el día anterior[\s\S]*¿Cuántas citas atiendes a la semana\?/, "recordatorio automático y pregunta cuántas citas a la semana")],
    ["unas 40", "calificacion", contiene(/Con 40 citas a la semana.*unos 4 plantones al mes[\s\S]*Pruébalo gratis 15 días, sin tarjeta; en 2 minutos ya tienes tu agenda/, "da el dato para 40 citas y el cierre")],
  ]);
  const v1 = await ventas(T1);
  comprobar(v1?.giro === "estetica" && v1?.calif_numero === 40 && v1?.calificado_at, "guarda el giro y la calificación (40)");

  // 2. precio de entrada → veterinaria → papel
  const T2 = tel();
  await conversacion("2. «precio», veterinaria, papel", T2, [
    ["precio", "entrada", (r) => { giroBotones(r); contiene(new RegExp(`\\$${PRECIOS.mensual.toLocaleString("es-MX")} \\+ IVA al mes`), "trae el precio de la base")(r); }],
    [boton("Veterinaria"), "giro", contiene(/papel o en algún sistema/, "pregunta papel o sistema")],
    ["en papel", "calificacion", contiene(/Pasar del papel al expediente/, "dato para papel")],
  ]);
  comprobar((await ventas(T2))?.calif_sistema === "papel", "guarda el sistema actual (papel)");

  // 3. hola → hotel → 25 perros
  await conversacion("3. «hola», hotel o guardería, 25 perros", tel(), [
    ["hola", "entrada", giroBotones],
    [boton("Hotel o guardería"), "giro", contiene(/¿Cuántos perros tienes en temporada alta\?/, "pregunta perros en temporada alta")],
    ["como 25", "calificacion", contiene(/Con 25 perros, son 25 reportes del día/, "dato para 25 perros")],
  ]);

  // 4. objeción de precio
  await conversacion("4. Objeción: es caro", tel(), [
    ["hola", "entrada"],
    [boton("Estética"), "giro"],
    ["es caro", "precio", contiene(/menos que un plantón a la semana/, "precio con la comparación del plantón")],
  ]);

  // 5. ya uso otro sistema
  await conversacion("5. Objeción: ya uso otro sistema", tel(), [
    ["info", "entrada"],
    [boton("Estética"), "giro"],
    ["ya uso otro sistema", "otro_sistema", contiene(/importador[\s\S]*migrar toma un día/, "importamos desde Excel, migrar toma un día")],
  ]);

  // 6. uso Excel
  await conversacion("6. Objeción: uso Excel", tel(), [
    ["información", "entrada"],
    [boton("Hotel o guardería"), "giro"],
    ["uso excel", "otro_sistema"],
  ]);

  // 7. no tengo tiempo (antes de decir el giro)
  const T7 = tel();
  await conversacion("7. Objeción: no tengo tiempo", T7, [
    ["me interesa", "entrada"],
    ["no tengo tiempo", "sin_tiempo", contiene(/en 2 minutos, sin salir de WhatsApp/, "la cuenta en 2 minutos desde aquí")],
  ]);

  // 8. lo pienso → demo del giro y seguimiento a 2 días
  const T8 = tel();
  await conversacion("8. Objeción: lo pienso", T8, [
    ["info", "entrada"],
    [boton("Estética"), "giro"],
    ["40", "calificacion"],
    ["lo pienso", "lo_pienso", contiene(/\/demo\/entrar\/recepcion\?ir=estetica/, "manda la demo de estética")],
  ]);
  const v8 = await ventas(T8);
  comprobar(v8?.seguimiento_programado_at && Math.abs(Date.parse(v8.seguimiento_programado_at) - Date.now() - 2 * 86400000) < 600000, "programa el seguimiento a 2 días");

  // 9. no me interesa
  const T9 = tel();
  await conversacion("9. No me interesa", T9, [
    ["info", "entrada"],
    ["no me interesa", "no_interesa", contiene(/te damos de baja/, "cierra amable")],
  ], "baja");
  const { count: excl } = await A.from("seguimiento_pruebas_exclusiones").select("id", { count: "exact", head: true }).eq("telefono", T9.slice(2));
  comprobar(excl === 1, "marca la baja de publicidad (exclusión del teléfono)");

  // 10. pregunta de función con el giro ya dicho
  await conversacion("10. Función: factura", tel(), [
    ["hola", "entrada"],
    [boton("Estética"), "giro"],
    ["¿tienen factura?", "funcion", contiene(/CFDI[\s\S]*Pruébalo gratis 15 días/, "respuesta fija de factura y el cierre")],
    ["¿cómo funcionan los recordatorios?", "funcion", contieneJunto(/«Confirmo»[\s\S]*«Necesito cambiarla»[\s\S]*por mensaje entregado[\s\S]*Pruébalo gratis 15 días/, "respuesta fija de recordatorios automáticos y el cierre")],
  ]);

  // 11. cambios de tema
  await conversacion("11. Cambios de tema", tel(), [
    ["info", "entrada"],
    ["¿se pueden firmar contratos?", "funcion", (r) => { contiene(/firma con el dedo desde su celular/, "contesta contratos")(r); giroBotones(r); }],
    [boton("Hotel o guardería"), "giro"],
    ["¿cuánto cuesta?", "precio"],
    ["¿y tienen reporte diario?", "funcion", contiene(/Reporte del día de guardería/, "contesta el reporte y vuelve al cierre")],
  ]);

  // 12. audio sin texto
  await conversacion("12. Audio sin texto", tel(), [
    [{ type: "audio", audio: { id: "audio1" } }, "entrada", giroBotones],
    [boton("Veterinaria"), "giro"],
    ["usamos un sistema", "calificacion"],
  ]);

  // 13. emoji
  await conversacion("13. Solo un emoji", tel(), [
    ["👋", "entrada", giroBotones],
    ["quiero probar", "prueba"],
  ]);

  // 14. ya tengo cuenta
  await conversacion("14. «Ya tengo cuenta»", tel(), [["ya tengo cuenta", "ya_cuenta", contiene(/te mando tu liga para entrar/, "le dice cómo entrar")]]);

  // 15. cliente de un negocio (dueño de mascota con cuenta en Huellitas)
  const { data: clientes } = await A.from("membresias").select("profile_id").eq("rol", "cliente").is("deleted_at", null).limit(40);
  let T15 = null;
  for (const c of clientes ?? []) {
    const { data: u } = await A.auth.admin.getUserById(c.profile_id);
    const m = String(u?.user?.email ?? "").match(/^t(\d{10})@telefono\.ludogteka\.mx$/);
    if (!m) continue;
    const { data: cuenta } = await A.rpc("bot_cuenta_por_telefono", { p_telefono: `52${m[1]}` });
    if (cuenta?.tipo === "cliente_de_negocio") { T15 = `52${m[1]}`; break; }
  }
  comprobar(Boolean(T15), "hay un cliente de un negocio con cuenta por teléfono en desarrollo");
  if (T15) {
    await A.from("wa_ventas").delete().eq("telefono", T15);
    await conversacion("15. Cliente de un negocio", T15, [
      ["Hola, quiero una cita para mi perro", "cliente_mascota", contiene(/escríbele a su número/, "lo manda con su negocio")],
    ]);
  }

  // 16. quiere hablar con una persona
  await conversacion("16. Quiere hablar con una persona", tel(), [
    ["info", "entrada"],
    ["quiero hablar con una persona", "humano", contiene(/Te paso con alguien del equipo/, "acuse de que lo atiende una persona")],
  ], "humano");

  // 17. varias sucursales
  await conversacion("17. Varias sucursales", tel(), [
    ["hola", "entrada"],
    ["tengo 3 sucursales", "sucursales"],
  ], "humano");

  // 18. dos preguntas sin respuesta seguidas
  await conversacion("18. Dos dudas que no están en la base", tel(), [
    ["info", "entrada"],
    ["¿sirve para un criadero de aves?", "desconocido", (r) => { contiene(/no lo tengo a la mano/, "dice que no lo tiene y retoma")(r); giroBotones(r); }],
    ["¿y para acuarios?", "desconocido"],
  ], "humano");

  // 19. prospecto con ref (giro conocido: salta la pregunta del giro)
  const T19 = tel();
  const { data: pros } = await A.from("prospectos").insert({ nombre: `Clínica Ventas Prueba ${Date.now() % 100000}`, giro: "veterinaria", ciudad: "Querétaro", fuente: "google_places" }).select("id, slug").single();
  await conversacion("19. Prospecto con ref (salta el giro)", T19, [
    [`Hola, vi la página que armaron para mi negocio (ref. ${pros.slug.slice(-5)})`, "entrada", (r) => {
      comprobar(!r.nuevas.some((m) => tipoDe(m) === "button"), "   no pregunta el giro");
      contiene(/papel o en algún sistema/, "va directo a la pregunta de veterinaria")(r);
    }],
    ["en excel", "calificacion", contiene(/desde tu Excel con el importador/, "dato para Excel")],
  ]);
  const { data: p19 } = await A.from("prospectos").select("sistema_actual, calificacion_texto").eq("id", pros.id).single();
  comprobar(p19?.sistema_actual === "excel" && p19?.calificacion_texto === "en excel", "la calificación queda en el prospecto");
  comprobar((await ventas(T19))?.fuente === "google_places", "con su fuente (prospección)");

  // 20. la IA entiende el giro que las reglas no
  await conversacion("20. La IA elige la rama", tel(), [
    ["Quisiera conocer el software", "entrada"],
    ["trabajo dando baño a perritos a domicilio", "giro"],
    ["como cuarenta a la semana", "calificacion", contiene(/Con 40 citas a la semana/, "entiende «cuarenta»")],
  ]);
  comprobar(mock.ia.length >= 3, `la IA solo se llamó para lo que las reglas no entendieron (${mock.ia.length} veces)`);
  const { count: usosIa } = await A.from("wa_uso_ia").select("id", { count: "exact", head: true }).eq("resultado", "clasifico").gte("created_at", new Date(Date.now() - 3600000).toISOString());
  comprobar((usosIa ?? 0) >= 3, "cada clasificación cuenta en el gasto de IA (wa_uso_ia «clasifico»)");

  // ── El formulario no sale → texto con el link
  console.log("\nRespaldo por texto");
  mock.rechazarFlow = true;
  const T21 = tel();
  await dice(T21, "hola");
  const r21 = await dice(T21, "quiero probar");
  mock.rechazarFlow = false;
  comprobar(r21.nuevas.some((m) => m.type === "text" && /Abre tu prueba aquí:\n.*\/registro/.test(m.text.body)), "si Meta rechaza el botón, el mismo texto sale con el link de registro");

  // ── Seguimientos
  console.log("\nSeguimientos");
  const cron = () => pedir("/api/cron/whatsapp-flow", { headers: { authorization: `Bearer ${CRON}` } });
  const hace = (ms) => new Date(Date.now() - ms).toISOString();
  // a) sin giro a las 24 h (T7 sí contestó; uno nuevo que no contesta)
  const T22 = tel();
  await dice(T22, "info");
  await A.from("wa_ventas").update({ giro_preguntado_at: hace(23.9 * 3600000) }).eq("telefono", T22);
  await A.from("wa_mensajes").update({ created_at: hace(23.95 * 3600000) }).eq("telefono", T22);
  await A.from("wa_hilos").update({ ultimo_entrante_at: hace(23.9 * 3600000) }).eq("telefono", T22);
  let antes = salidas(T22).length;
  comprobar((await cron()).status === 200, "la tarea corre");
  const s22 = salidas(T22).slice(antes);
  comprobar(s22.length === 1 && tipoDe(s22[0]) === "button" && /negocio de ejemplo[\s\S]*\/demo/.test(cuerpoDe(s22[0])), "sin giro a las 24 h: la demo y la pregunta del giro");
  // b) abrió el formulario y no lo completó: a las 2 horas
  const r23 = await dice(T22, boton("Estética"));
  void r23;
  await dice(T22, "50");
  const { data: ses } = await A.from("wa_flow_sesiones").select("flow_token").eq("telefono", T22).order("enviado_at", { ascending: false }).limit(1).single();
  const { peticion } = cifrarPeticion({ version: "3.0", action: "INIT", flow_token: ses.flow_token }, PUBLICA);
  const crudo = JSON.stringify(peticion);
  await pedir("/api/whatsapp/flow", { method: "POST", body: crudo, headers: { "content-type": "application/json", "x-hub-signature-256": firma(crudo) } });
  await A.from("wa_flow_sesiones").update({ abierto_at: hace(2.1 * 3600000) }).eq("flow_token", ses.flow_token);
  await A.from("wa_mensajes").update({ created_at: hace(2.2 * 3600000) }).eq("telefono", T22);
  antes = salidas(T22).length;
  await cron();
  const s23 = salidas(T22).slice(antes);
  comprobar(s23.some((m) => tipoDe(m) === "flow" && /Te quedaste a medias/.test(cuerpoDe(m))), "abrió el formulario sin completarlo: a las 2 h, una línea con el botón");
  // c) máximo 2
  await A.from("wa_flow_sesiones").update({ abierto_at: hace(2.5 * 3600000) }).eq("telefono", T22).eq("estado", "abierto");
  await A.from("wa_ventas").update({ ultimo_seguimiento_at: hace(3 * 3600000), seguimiento_programado_at: hace(60000) }).eq("telefono", T22);
  antes = salidas(T22).length;
  await cron();
  comprobar(salidas(T22).length === antes && (await ventas(T22))?.seguimientos === 2, "máximo 2 seguimientos");
  // d) «lo pienso» a los 2 días, fuera de la ventana y sin plantilla aprobada: no sale nada
  await A.from("wa_ventas").update({ seguimiento_programado_at: hace(60000) }).eq("telefono", T8);
  await A.from("wa_hilos").update({ ultimo_entrante_at: hace(48 * 3600000) }).eq("telefono", T8);
  antes = salidas(T8).length;
  await cron();
  comprobar(salidas(T8).length === antes && (await ventas(T8))?.seguimientos === 0, "«lo pienso» fuera de la ventana sin plantilla aprobada: no sale nada");
  // e) dentro de la ventana sí
  await A.from("wa_hilos").update({ ultimo_entrante_at: hace(3600000) }).eq("telefono", T8);
  await cron();
  comprobar(salidas(T8).slice(antes).some((m) => tipoDe(m) === "flow" && /Pudiste ver la demo/.test(cuerpoDe(m))), "«lo pienso» dentro de la ventana: el recordatorio con el botón");
  // f) contestar retoma la rama
  const rr = await dice(T8, "ok");
  comprobar(rr.rama === "cortesia" && tipoDe(rr.nuevas.at(-1) ?? {}) === "flow", "si contesta, retoma donde iba (cierre con el botón)");

  // ── Nadie más ve wa_ventas
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const ra = await anon.from("wa_ventas").select("id").limit(1);
  comprobar(Boolean(ra.error) || (ra.data ?? []).length === 0, "anon no lee wa_ventas");
  comprobar(Boolean((await anon.rpc("wa_ventas_embudo", { p_desde: null })).error), "anon no ejecuta wa_ventas_embudo");
} catch (e) {
  hallazgos.push(`la auditoría tronó: ${e instanceof Error ? e.message : e}`);
  console.log(`  ✘ ${e instanceof Error ? e.stack : e}`);
} finally {
  cerrar();
}

if (/\[ventas\]|guion de ventas falló/.test(bitacora)) console.log(`\nBitácora del servidor:\n${bitacora.split("\n").filter((l) => /ventas|whatsapp/.test(l)).slice(-20).join("\n")}`);
fs.writeFileSync(`${process.env.TEMP ?? "."}/whatsapp-ventas-ultimas.json`, JSON.stringify(ultimas, null, 1));
console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
