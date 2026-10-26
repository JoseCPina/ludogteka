// Recordatorios automáticos por WhatsApp de punta a punta (SOLO DESARROLLO, 25 de octubre de 2026).
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   npm run build
//   node scripts/auditoria/recordatorios-dev.mjs
//
// Levanta `next start` en el 3001 con un doble de la Graph API de Meta (puerto 4461; nunca manda un mensaje real) y
// Stripe en MODO PRUEBA (la llave de prueba sale de STRIPE_SECRET_KEY o del archivo de la cuenta de prueba de Menteo
// fuera del repo, STRIPE_PRUEBA_ARCHIVO; nunca se imprime). Usa Huellitas con su personal real (JWT) y le cambia la
// zona horaria mientras corre a una donde sea de día (la restaura al final).
//   1. Programa: con «Cita de estética» prendido, una cita de mañana queda programada a la hora de envío.
//   2. Plantilla sin aprobar: no sale nada; aprobada: sale con sus variables, el pie y los botones con su payload.
//   3. Una sola vez: otra corrida no la repite.
//   4. «Confirmo» (botón): la cita queda confirmada, el cliente recibe la línea fija, la agenda ve «Confirmó».
//   5. «Necesito cambiarla»: aviso para el negocio en «Por atender» y línea fija al cliente.
//   6. Reprogramar antes del envío: se recalcula (sale con la hora nueva, una sola vez). Cancelar: no sale.
//   7. Fuera de horario del negocio (de noche): no sale.
//   8. Texto libre de quien recibió un recordatorio: le llega al negocio, no al bot de ventas; BAJA lo da de baja y
//      cancela lo programado de ese cliente.
//   9. Estado por mensaje (enviado, entregado, leído, fallido) desde el webhook; un fallido no cuenta; uno que Meta no
//      cobra (billable=false) no cuenta.
//  10. Los 30 gratis: sin suscripción pagada, el 31 se pausa (y «Necesita atención» lo dice).
//  11. Con suscripción (Stripe de prueba): el excedente sale y se cobra hasta el tope; al tope, pausa. El uso queda
//      en Stripe como evento del medidor sobre la suscripción (concepto medido agregado a la suscripción).
//  12. Veterinaria (con médico), llegada a hotel/guardería, «listo» al terminar la estética y vacuna 7 días antes
//      («Agendar» deja una solicitud de cita).
//  13. Quién ve qué: cliente, anónimo y otro negocio no leen las tablas ni ejecutan las funciones del servidor.
import { limpiarAlTerminar } from "../lib/limpieza-dev.mjs";
limpiarAlTerminar({
  bitacoras: [
    "recordatorios_mensajes", "wa_recordatorios_cobro", "recordatorios_wa", "carnet_recordatorios", "carnet_vacunas",
    "vet_citas", "citas_estetica_cambios", "citas_estetica", "estancias", "reservas", "perros", "clientes", "medicos_veterinarios",
    "recordatorios_ajustes", "wa_entregas", "wa_mensajes", "wa_hilos",
  ],
});
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
// La llave de servicio de las auditorías va acotada a UN negocio (sesiones-dev.mjs): aquí, Huellitas. Así la limpieza
// también borra lo de Huellitas (y no busca en Ludogteka).
process.env.AUDITORIA_NEGOCIO_ID = datos.B;
const { A, URL, env, tokenDe } = await import("./sesiones-dev.mjs");
if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const B = datos.B;
const PUERTO = 3001;
const PUERTO_DOBLE = 4461;
const PHONE_ID = "PHONE_REC";
const WABA = "WABA_REC";
const APP_SECRET = `secreto-${randomUUID()}`;
const CRON = `cron-${randomUUID()}`;

function llaveStripe() {
  if (process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) return process.env.STRIPE_SECRET_KEY;
  const archivo = process.env.STRIPE_PRUEBA_ARCHIVO ?? "C:/proyectos/checaito/.env.stripe.sandbox";
  try {
    const l = fs.readFileSync(archivo, "utf8").split(/\r?\n/).find((x) => x.startsWith("STRIPE_SECRET_KEY="));
    const v = l?.slice("STRIPE_SECRET_KEY=".length).trim().replace(/^"|"$/g, "");
    return v?.startsWith("sk_test_") ? v : null;
  } catch {
    return null;
  }
}
const STRIPE_KEY = llaveStripe();
if (!STRIPE_KEY) throw new Error("Falta una llave de Stripe de MODO PRUEBA (STRIPE_SECRET_KEY=sk_test_… o STRIPE_PRUEBA_ARCHIVO).");
const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2026-08-26.dahlia" });

const hallazgos = [];
const comprobar = (ok, t) => (ok ? console.log(`  ✔ ${t}`) : (hallazgos.push(t), console.log(`  ✘ ${t}`)));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const esperarHasta = async (fn, ms = 30000, paso = 500) => { const t = Date.now(); for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t > ms) return null; await espera(paso); } };
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const cab = (token, negocio = B) => ({ apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-negocio-id": negocio, "Content-Type": "application/json", Prefer: "return=representation" });
const llamar = async (url, opciones) => {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  return { ok: r.ok, status: r.status, cuerpo, mensaje: cuerpo?.message ?? (typeof cuerpo === "string" ? cuerpo : "") };
};
const rpc = (token, fn, args = {}, negocio = B) => llamar(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cab(token, negocio), body: JSON.stringify(args) });

// ───────────── la zona: una donde ahora sean entre las 10 y las 17 (y otra donde sea de noche)
const ZONAS = ["America/Tijuana", "America/Mexico_City", "America/Cancun", "America/Sao_Paulo", "Europe/Madrid", "Asia/Dubai", "Asia/Kolkata", "Asia/Tokyo", "Pacific/Auckland", "Pacific/Honolulu"];
const horaEn = (z) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: z, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
const ZONA_DIA = ZONAS.find((z) => horaEn(z) >= 10 && horaEn(z) <= 17);
const ZONA_NOCHE = ZONAS.find((z) => horaEn(z) >= 22 || horaEn(z) <= 5);
if (!ZONA_DIA || !ZONA_NOCHE) throw new Error("No encontré zonas de día y de noche para la prueba.");
const { data: negocioAntes } = await A.from("negocios").select("zona_horaria").eq("id", B).single();
const fechaEn = (z, mas = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: z }).format(new Date(Date.now() + mas * 86400000));
/** El instante de «AAAA-MM-DD HH:MM» en la zona z. */
function instante(fecha, hora, z) {
  const guess = new Date(`${fecha}T${hora}:00Z`);
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(guess).map((p) => [p.type, p.value]));
  const local = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute);
  return new Date(guess.getTime() - (local - guess.getTime())).toISOString();
}

// ───────────── doble de la Graph API
const mock = { wa: [], plantillas: "APPROVED", categoria: "UTILITY" };
const NOMBRES = ["peludesk_rec_estetica_v1", "peludesk_rec_veterinaria_v1", "peludesk_rec_llegada_v1", "peludesk_rec_listo_v1", "peludesk_rec_vacuna_v2"];
const doble = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const j = cuerpo && (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(cuerpo) : {};
  const responder = (obj, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.url.startsWith(`/v23.0/${WABA}/message_templates`)) return responder({ data: NOMBRES.map((name) => ({ name, status: mock.plantillas, category: mock.categoria, language: "es_MX" })) });
  if (req.url.startsWith(`/v23.0/${WABA}?fields=currency`)) return responder({ currency: "MXN" });
  if (req.url.startsWith(`/v23.0/${PHONE_ID}/messages`)) {
    if (j.status === "read") return responder({ success: true });
    const id = `wamid.${randomUUID()}`;
    mock.wa.push({ ...j, id });
    return responder({ messages: [{ id }] });
  }
  if (req.url === "/v1/messages") return responder({ content: [{ type: "text", text: "Respuesta del bot de prueba." }], usage: { input_tokens: 1, output_tokens: 1 } });
  responder({ error: "no existe" }, 404);
});
await new Promise((r) => doble.listen(PUERTO_DOBLE, "127.0.0.1", r));

const servidor = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], {
  env: {
    ...process.env,
    WHATSAPP_GRAPH_URL: `http://127.0.0.1:${PUERTO_DOBLE}`,
    ANTHROPIC_API_URL: `http://127.0.0.1:${PUERTO_DOBLE}`,
    TELEGRAM_API_URL: `http://127.0.0.1:${PUERTO_DOBLE}`,
    WHATSAPP_TOKEN: "wa-prueba",
    WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
    WHATSAPP_APP_SECRET: APP_SECRET,
    PELUDESK_WABA_ID: WABA,
    ANTHROPIC_API_KEY: "ia-prueba",
    TELEGRAM_BOT_TOKEN: "tg-prueba",
    STRIPE_SECRET_KEY: STRIPE_KEY,
    CRON_SECRET: CRON,
    VERCEL_ENV: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let bitacora = "";
servidor.stdout.on("data", (d) => (bitacora += d));
servidor.stderr.on("data", (d) => (bitacora += d));

function pedir(ruta, { method = "GET", body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const q = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method, headers: { host: `plataforma.localhost:${PUERTO}`, ...headers }, timeout: 280000 }, (r) => {
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
async function alWebhook(value) {
  const crudo = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: PHONE_ID }, ...value } }] }] });
  return pedir("/api/whatsapp/webhook", { method: "POST", body: crudo, headers: { "content-type": "application/json", "x-hub-signature-256": firma(crudo) } });
}
const mensajeDe = (telefono, m) => alWebhook({ contacts: [{ wa_id: telefono, profile: { name: "Cliente prueba" } }], messages: [{ from: telefono, id: `wamid.${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), ...m }] });
const boton = (telefono, payload, text) => mensajeDe(telefono, { type: "button", button: { payload, text } });
const texto = (telefono, body) => mensajeDe(telefono, { type: "text", text: { body } });
const estado = (id, status, extra = {}) => alWebhook({ statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "x", ...extra }] });
const cron = async () => {
  const r = await pedir(`/api/cron/recordatorios?solo=${B}&stripe=si`, { headers: { authorization: `Bearer ${CRON}` } });
  try { return JSON.parse(r.texto); } catch { return { status: r.status, texto: r.texto.slice(0, 300) }; }
};
const plantillasA = (tel, nombre) => mock.wa.filter((m) => m.to === tel && m.type === "template" && (!nombre || m.template?.name === nombre));
const textosA = (tel) => mock.wa.filter((m) => m.to === tel && m.type === "text").map((m) => m.text.body);
const rec = async (refId, tipo) => (await SB.from("recordatorios_wa").select("*").eq("ref_id", refId).eq("tipo", tipo).order("created_at", { ascending: false })).data ?? [];

const limpiezas = [];
let sub = null;
let customer = null;
async function terminar(codigo) {
  for (const f of limpiezas.reverse()) await f().catch((e) => console.log(`   (limpieza: ${e.message})`));
  try { servidor.kill(); } catch { /* ya */ }
  doble.close();
  console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s):\n - ${hallazgos.join("\n - ")}` : "\n✔ Sin hallazgos.");
  process.exit(codigo ?? (hallazgos.length ? 1 : 0));
}
process.on("SIGINT", () => terminar(1));

try {
  // ── Preparar ──
  console.log(`── Preparar (zona de día ${ZONA_DIA}, de noche ${ZONA_NOCHE})`);
  const zona = await SB.from("negocios").update({ zona_horaria: ZONA_DIA }).eq("id", B);
  if (zona.error) throw new Error(`cambiar la zona: ${zona.error.message}`);
  limpiezas.push(async () => { await SB.from("negocios").update({ zona_horaria: negocioAntes.zona_horaria }).eq("id", B); });
  const { data: tarifaRevisada } = await A.from("wa_config").select("valor").eq("clave", "wa_tarifa_revisada").maybeSingle();
  await A.from("wa_config").upsert({ clave: "wa_tarifa_revisada", valor: new Date().toISOString() });
  limpiezas.push(async () => {
    if (tarifaRevisada) await A.from("wa_config").update({ valor: tarifaRevisada.valor }).eq("clave", "wa_tarifa_revisada");
    else await A.from("wa_config").delete().eq("clave", "wa_tarifa_revisada");
  });
  for (let i = 0; i < 90; i++) {
    if ((await pedir("/api/cron/recordatorios").catch(() => ({ status: 0 }))).status === 401) break;
    await espera(1000);
  }
  const tAdmin = await tokenDe(datos.adminB);
  const tRecep = await tokenDe(datos.recepcionB);
  const tCliente = await tokenDe(datos.cuentaSoloB);
  const hoy = fechaEn(ZONA_DIA);
  const manana = fechaEn(ZONA_DIA, 1);
  const pasado = fechaEn(ZONA_DIA, 2);

  const aj = await rpc(tAdmin, "guardar_recordatorios_ajustes", { p_estetica: true, p_veterinaria: true, p_llegada: true, p_listo: true, p_vacuna: true, p_hora: "07:00" });
  comprobar(aj.ok, `el admin prende los cinco tipos con hora 07:00 (${aj.mensaje || "ok"})`);
  const ajCliente = await rpc(tCliente, "guardar_recordatorios_ajustes", { p_estetica: false, p_veterinaria: false, p_llegada: false, p_listo: false, p_vacuna: false, p_hora: "10:00" });
  comprobar(!ajCliente.ok, "un cliente no puede cambiar los ajustes");

  // Un cliente y sus perros (teléfono de prueba, nunca uno real).
  const sufijo = String(Date.now()).slice(-6);
  const nuevoCliente = async (nombre) => {
    const telefono = `99${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    const { data, error } = await SB.from("clientes").insert({ nombre: `${nombre} Rec ${sufijo}`, telefono }).select("id, telefono").single();
    if (error) throw new Error(`cliente: ${error.message}`);
    return { id: data.id, tel: `52${telefono}` };
  };
  const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
  const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
  const { data: razas } = await A.from("razas").select("id, nombre").eq("nombre", "Poodle");
  const nuevoPerro = async (clienteId, nombre) => {
    const { data, error } = await SB.from("perros").insert({ cliente_id: clienteId, nombre: `${nombre}${sufijo}`, raza: "Poodle", raza_id: razas[0].id, tamano_id: tallas.find((t) => t.clave === "chico").id, pelaje_id: pelajes.find((p) => p.clave === "medio").id }).select("id").single();
    if (error) throw new Error(`perro: ${error.message}`);
    return data.id;
  };
  const { data: servicios } = await SB.from("servicios").select("id, clave, categoria").is("deleted_at", null);
  const srv = (clave) => servicios.find((s) => s.clave === clave)?.id;
  const nuevaCita = async (perro, fecha, hora) => {
    const rr = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tRecep), body: JSON.stringify({ cliente_id: (await SB.from("perros").select("cliente_id").eq("id", perro).single()).data.cliente_id }) });
    const reserva = rr.cuerpo?.[0]?.id;
    if (!reserva) throw new Error(`reserva: ${rr.mensaje}`);
    const cuerpo = { reserva_id: reserva, perro_id: perro, servicio_id: srv("estetica_estetico"), empleado_id: null, inicio: instante(fecha, hora, ZONA_DIA) };
    let r = await llamar(`${URL}/rest/v1/citas_estetica`, { method: "POST", headers: cab(tRecep), body: JSON.stringify(cuerpo) });
    if (!r.ok && /horario|abre|cierra/i.test(r.mensaje)) r = await llamar(`${URL}/rest/v1/citas_estetica`, { method: "POST", headers: cab(tRecep), body: JSON.stringify({ ...cuerpo, fuera_de_horario: true }) });
    // Sin estilista no hay empalmes entre las citas de prueba; si la base la exige, se usa la de Huellitas.
    if (!r.ok && /estilista|empleado/i.test(r.mensaje)) r = await llamar(`${URL}/rest/v1/citas_estetica`, { method: "POST", headers: cab(tRecep), body: JSON.stringify({ ...cuerpo, empleado_id: datos.esteticaB }) });
    if (!r.ok) throw new Error(`cita: ${r.mensaje}`);
    return r.cuerpo[0].id;
  };

  const ana = await nuevoCliente("Ana");
  const rocky = await nuevoPerro(ana.id, "Rocky");

  // ── 1–3. Programar, plantilla y una sola vez ──
  console.log("── 1–3. Programar, plantilla y una sola vez");
  const cita1 = await nuevaCita(rocky, manana, "12:00");
  mock.plantillas = "PENDING";
  let r = await cron();
  comprobar(r.ok && r.programados >= 1, `la tarea programa la cita de mañana (${JSON.stringify(r).slice(0, 160)})`);
  const [p1] = await rec(cita1, "estetica");
  comprobar(p1?.estado === "programado" && new Date(p1.programado_at) <= new Date(), "queda «programado» para hoy a las 07:00 (ya toca)");
  comprobar(plantillasA(ana.tel).length === 0, "con la plantilla sin aprobar no sale nada");
  mock.plantillas = "APPROVED";
  mock.categoria = "MARKETING";
  await cron();
  comprobar(plantillasA(ana.tel).length === 0, "una plantilla que Meta pasó a MARKETING tampoco sale");
  mock.categoria = "UTILITY";
  r = await cron();
  const m1 = plantillasA(ana.tel, "peludesk_rec_estetica_v1")[0];
  const ps = m1?.template?.components?.find((c) => c.type === "body")?.parameters?.map((p) => p.text) ?? [];
  const botones = m1?.template?.components?.filter((c) => c.type === "button") ?? [];
  comprobar(Boolean(m1) && ps[0] === "Ana" && ps[1] === `Rocky${sufijo}` && ps[2] === "Huellitas" && /\d{1,2} de [a-z]+/.test(ps[3]) && ps[4] === "12:00", `sale con Ana, Rocky, el negocio, el día y la hora (${ps.join(" | ")})`);
  comprobar(botones.length === 2 && botones[0].parameters[0].payload === `rec:${p1.id}:confirmo` && botones[1].parameters[0].payload === `rec:${p1.id}:pide_cambio`, "los botones llevan el payload del recordatorio");
  const [e1] = await rec(cita1, "estetica");
  comprobar(e1.estado === "enviado" && e1.wa_id === m1?.id && /Confírmanos/.test(e1.texto ?? ""), "queda «enviado» con el id de WhatsApp y el texto");
  await cron();
  await cron();
  comprobar(plantillasA(ana.tel).length === 1, "otras corridas no lo repiten");

  // ── 9. Estados ──
  console.log("── 9. Estados de entrega");
  await estado(m1.id, "sent", { pricing: { billable: true, category: "utility", pricing_model: "PMP" } });
  await estado(m1.id, "delivered", { pricing: { billable: true, category: "utility", pricing_model: "PMP" } });
  let f = (await rec(cita1, "estetica"))[0];
  comprobar(f.estado === "entregado" && f.cobrable === true, "entregado y cobrable");
  const { data: cobro1 } = await A.from("wa_recordatorios_cobro").select("*").eq("recordatorio_id", f.id).maybeSingle();
  comprobar(cobro1?.numero >= 1 && cobro1.excedente === false && Number(cobro1.precio_mxn) > 0, `cuenta como el ${cobro1?.numero} del mes, gratis (precio guardado ${cobro1?.precio_mxn})`);
  await estado(m1.id, "read");
  await estado(m1.id, "delivered");
  f = (await rec(cita1, "estetica"))[0];
  comprobar(f.estado === "leido", "leído, y un «entregado» tardío no lo regresa");
  const { count: cobros1 } = await A.from("wa_recordatorios_cobro").select("id", { count: "exact", head: true }).eq("recordatorio_id", f.id);
  comprobar(cobros1 === 1, "se cuenta una sola vez");

  // ── 4. Confirmo ──
  console.log("── 4. «Confirmo»");
  const otro = await boton("529900000001", `rec:${p1.id}:confirmo`, "Confirmo");
  comprobar(otro.status === 200, "el webhook acepta el botón");
  await espera(2500);
  comprobar((await SB.from("citas_estetica").select("estado").eq("id", cita1).single()).data.estado === "reservada", "el botón desde OTRO teléfono no confirma nada");
  await boton(ana.tel, `rec:${p1.id}:confirmo`, "Confirmo");
  const confirmada = await esperarHasta(async () => (await SB.from("citas_estetica").select("estado").eq("id", cita1).single()).data.estado === "confirmada", 20000);
  comprobar(confirmada, "«Confirmo» deja la cita confirmada");
  f = (await rec(cita1, "estetica"))[0];
  comprobar(f.respuesta === "confirmo", "el recordatorio guarda la respuesta");
  comprobar(await esperarHasta(() => textosA(ana.tel).some((t) => /Gracias.*Huellitas.*confirmas/.test(t)), 10000), "el cliente recibe «¡Gracias! Le avisamos a Huellitas que confirmas»");
  const agendaVe = await llamar(`${URL}/rest/v1/recordatorios_wa?ref_id=eq.${cita1}&select=respuesta`, { headers: cab(tRecep) });
  comprobar(agendaVe.ok && agendaVe.cuerpo?.[0]?.respuesta === "confirmo", "recepción lo ve (la agenda pinta «Confirmó por WhatsApp»)");

  // ── 5. Necesito cambiarla ──
  console.log("── 5. «Necesito cambiarla»");
  const beto = await nuevoCliente("Beto");
  const max = await nuevoPerro(beto.id, "Max");
  const cita2 = await nuevaCita(max, manana, "13:00");
  await cron();
  const [p2] = await rec(cita2, "estetica");
  comprobar(p2?.estado === "enviado", "el de Beto sale");
  await boton(beto.tel, `rec:${p2.id}:pide_cambio`, "Necesito cambiarla");
  const aviso = await esperarHasta(async () => (await SB.from("recordatorios_mensajes").select("*").eq("recordatorio_id", p2.id).eq("tipo", "pide_cambio").maybeSingle()).data, 20000);
  comprobar(Boolean(aviso) && !aviso.atendido_at, "queda el aviso «Necesita cambiar su cita» por atender");
  comprobar(await esperarHasta(() => textosA(beto.tel).some((t) => /necesitas cambiarla.*reagendar/.test(t)), 10000), "el cliente recibe que el negocio le escribe para reagendar");
  comprobar((await SB.from("citas_estetica").select("estado").eq("id", cita2).single()).data.estado === "reservada", "la cita sigue reservada (no se cancela sola)");
  const atendido = await rpc(tRecep, "recordatorio_mensaje_atendido", { p_id: aviso.id });
  comprobar(atendido.ok && (await SB.from("recordatorios_mensajes").select("atendido_at").eq("id", aviso.id).single()).data.atendido_at, "recepción lo marca atendido");

  // ── 6. Reprogramar y cancelar antes del envío ──
  console.log("── 6. Reprogramar y cancelar antes del envío");
  const cata = await nuevoCliente("Cata");
  const luna = await nuevoPerro(cata.id, "Luna");
  const cita3 = await nuevaCita(luna, pasado, "11:00");
  await cron();
  const [p3] = await rec(cita3, "estetica");
  comprobar(p3?.estado === "programado" && new Date(p3.programado_at) > new Date(), "la de pasado mañana queda programada para mañana");
  const rep = await rpc(tRecep, "reprogramar_cita_estetica", { p_cita_id: cita3, p_inicio: instante(manana, "16:00", ZONA_DIA), p_motivo: "Prueba de recordatorio" });
  comprobar(rep.ok, `recepción la reprograma a mañana a las 16:00 (${rep.mensaje || "ok"})`);
  await cron();
  const filas3 = await rec(cita3, "estetica");
  const vieja = filas3.find((x) => x.id === p3.id);
  const nueva = filas3.find((x) => x.id !== p3.id);
  comprobar(vieja?.estado === "cancelado" && /cambió de hora/.test(vieja.motivo ?? ""), "el programado viejo se cancela");
  comprobar(nueva?.estado === "enviado" && plantillasA(cata.tel).length === 1, "sale uno solo, el de la hora nueva");
  const ps3 = plantillasA(cata.tel)[0]?.template?.components?.[0]?.parameters?.map((p) => p.text) ?? [];
  comprobar(ps3[4] === "16:00", `con la hora nueva (${ps3[4]})`);

  const dani = await nuevoCliente("Dani");
  const toby = await nuevoPerro(dani.id, "Toby");
  const cita4 = await nuevaCita(toby, pasado, "10:00");
  await cron();
  const can = await rpc(tRecep, "cancelar_cita_estetica", { p_cita_id: cita4, p_motivo: "Prueba de recordatorio", p_no_llego: false });
  comprobar(can.ok, `recepción la cancela (${can.mensaje || "ok"})`);
  await cron();
  const [p4] = await rec(cita4, "estetica");
  comprobar(p4?.estado === "cancelado" && plantillasA(dani.tel).length === 0, "una cita cancelada no recibe recordatorio");

  // ── 7. De noche ──
  console.log("── 7. Fuera de horario");
  const eli = await nuevoCliente("Eli");
  const kira = await nuevoPerro(eli.id, "Kira");
  const cita5 = await nuevaCita(kira, manana, "17:00");
  await SB.from("negocios").update({ zona_horaria: ZONA_NOCHE }).eq("id", B);
  await cron();
  comprobar(plantillasA(eli.tel).length === 0, "de noche en la hora del negocio no sale");
  await SB.from("negocios").update({ zona_horaria: ZONA_DIA }).eq("id", B);
  // Un negocio real no cambia de zona a media mañana: al volver se reprograma con la zona de nuevo (lo que hace guardar).
  await rpc(tAdmin, "guardar_recordatorios_ajustes", { p_estetica: true, p_veterinaria: true, p_llegada: true, p_listo: true, p_vacuna: true, p_hora: "07:00" });
  await cron();
  comprobar(plantillasA(eli.tel).length === 1, "de día sí");

  // ── 8. Texto libre y BAJA ──
  console.log("── 8. Texto libre y BAJA");
  const iaAntes = mock.wa.length;
  await texto(beto.tel, "¿Puede ser el jueves a las 5?");
  const msg = await esperarHasta(async () => (await SB.from("recordatorios_mensajes").select("*").eq("cliente_id", beto.id).eq("tipo", "mensaje").maybeSingle()).data, 20000);
  comprobar(msg?.texto === "¿Puede ser el jueves a las 5?", "el texto le llega al negocio como mensaje entrante");
  comprobar(await esperarHasta(() => textosA(beto.tel).some((t) => /solo manda los recordatorios de Huellitas/.test(t)), 10000), "al cliente se le dice que su mensaje se le pasó al negocio");
  comprobar(!mock.wa.slice(iaAntes).some((m) => m.to === beto.tel && (m.type === "interactive" || /PeluDesk/.test(m.text?.body ?? "") && !/Huellitas/.test(m.text?.body ?? ""))), "no se le ofrece PeluDesk (ni el bot de ventas ni el formulario)");
  await texto(beto.tel, "Gracias");
  await espera(3000);
  comprobar(textosA(beto.tel).filter((t) => /solo manda los recordatorios/.test(t)).length === 1, "el aviso no se repite a cada mensaje (2 h)");
  const cita6 = await nuevaCita(await nuevoPerro(beto.id, "Pelusa"), pasado, "12:00");
  await cron();
  comprobar((await rec(cita6, "estetica"))[0]?.estado === "programado", "Beto tiene otro programado");
  await texto(beto.tel, "BAJA");
  const baja = await esperarHasta(async () => (await SB.from("clientes").select("recordatorios_whatsapp, recordatorios_whatsapp_origen").eq("id", beto.id).single()).data.recordatorios_whatsapp === false, 20000);
  comprobar(baja, "BAJA lo da de baja de los recordatorios de ese negocio");
  comprobar((await SB.from("clientes").select("recordatorios_whatsapp_origen").eq("id", beto.id).single()).data.recordatorios_whatsapp_origen === "baja_whatsapp", "con origen «baja por WhatsApp»");
  comprobar((await rec(cita6, "estetica"))[0]?.estado === "cancelado", "y lo programado de ese cliente se cancela");
  comprobar(await esperarHasta(() => textosA(beto.tel).some((t) => /ya no te mandaremos recordatorios de Huellitas/.test(t)), 10000), "se le confirma la baja");

  // ── 9b. Fallido y no cobrable ──
  console.log("── 9b. Fallido y no cobrable");
  const [p5] = await rec(cita5, "estetica");
  await estado(p5.wa_id, "failed", { errors: [{ code: 131026, title: "Message undeliverable" }] });
  f = (await rec(cita5, "estetica"))[0];
  comprobar(f.estado === "fallido" && /no pudo recibir/.test(f.motivo ?? ""), "fallido con el motivo en palabras claras");
  comprobar(!(await A.from("wa_recordatorios_cobro").select("id").eq("recordatorio_id", f.id).maybeSingle()).data, "un fallido no cuenta");
  const p3n = (await rec(cita3, "estetica")).find((x) => x.estado === "enviado");
  await estado(p3n.wa_id, "delivered", { pricing: { billable: false, category: "utility", type: "free_customer_service" } });
  comprobar(!(await A.from("wa_recordatorios_cobro").select("id").eq("recordatorio_id", p3n.id).maybeSingle()).data, "uno que Meta no cobra (billable=false) no cuenta");

  // ── 10. Los 30 gratis sin suscripción ──
  console.log("── 10. Los 30 gratis (sin suscripción pagada)");
  const { data: estadoCobro } = await SB.rpc("estado_cobro_en", { p_negocio_id: B });
  comprobar(!["al_corriente", "gracia", "exento"].includes(estadoCobro), `Huellitas no tiene suscripción pagada (${estadoCobro})`);
  const { data: uso0 } = await llamar(`${URL}/rest/v1/rpc/recordatorios_uso_mes`, { method: "POST", headers: cab(tAdmin), body: "{}" }).then((x) => ({ data: x.cuerpo }));
  // Relleno: los mensajes que faltan para llegar a 30 en el mes, como entregados cobrables (sin mandar nada).
  const usados = Number(uso0?.enviados ?? 0);
  const relleno = [];
  for (let i = usados; i < 30; i++) relleno.push({ negocio_id: B, tipo: "estetica", ref_id: randomUUID(), cliente_id: ana.id, para_at: new Date().toISOString(), programado_at: new Date().toISOString(), vence_at: new Date().toISOString(), estado: "entregado", enviado_at: new Date().toISOString(), cobrable: true });
  if (relleno.length) {
    const ins = await SB.from("recordatorios_wa").insert(relleno);
    if (ins.error) throw new Error(`relleno: ${ins.error.message}`);
  }
  const fer = await nuevoCliente("Fer");
  const cita7 = await nuevaCita(await nuevoPerro(fer.id, "Bimba"), manana, "15:00");
  await cron();
  const [p7] = await rec(cita7, "estetica");
  comprobar(p7?.estado === "pausado" && /gratis/.test(p7.motivo ?? "") && plantillasA(fer.tel).length === 0, `el 31 del mes se pausa (${p7?.estado}: ${p7?.motivo})`);
  const atencion = await llamar(`${URL}/rest/v1/recordatorios_wa?estado=eq.pausado&select=id`, { headers: cab(tRecep) });
  comprobar(atencion.ok && atencion.cuerpo.length >= 1, "recepción ve los pausados («Necesita atención»)");

  // ── 11. Con suscripción: excedente, tope y Stripe ──
  console.log("── 11. Excedente con tope y Stripe (modo prueba)");
  customer = await stripe.customers.create({ name: `Huellitas recordatorios ${sufijo}`, metadata: { peludesk_negocio_id: B, peludesk_prueba: "recordatorios-dev" } });
  const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
  const producto = await stripe.products.create({ name: `Prueba plan recordatorios ${sufijo}`, metadata: { peludesk_prueba: "recordatorios-dev" } });
  const precioPlan = await stripe.prices.create({ product: producto.id, currency: "mxn", unit_amount: 75284, recurring: { interval: "month" } });
  sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: precioPlan.id }], metadata: { peludesk_negocio_id: B } });
  limpiezas.push(async () => {
    if (sub) await stripe.subscriptions.cancel(sub.id).catch(() => {});
    if (customer) await stripe.customers.del(customer.id).catch(() => {});
    await stripe.products.update(producto.id, { active: false }).catch(() => {});
  });
  const { data: susAntes } = await A.from("suscripciones").select("*").eq("negocio_id", B).is("deleted_at", null).maybeSingle();
  if (susAntes) throw new Error("Huellitas ya tiene una fila en suscripciones: esta prueba no la pisa.");
  const insSus = await A.from("suscripciones").insert({ negocio_id: B, modo: "test", stripe_customer_id: customer.id, stripe_subscription_id: sub.id, estado_stripe: "active", periodicidad: "mensual", monto_centavos: 75284 }).select("id").single();
  if (insSus.error) throw new Error(`suscripción: ${insSus.error.message}`);
  limpiezas.push(async () => { await A.from("suscripciones").delete().eq("id", insSus.data.id); });
  comprobar((await SB.rpc("estado_cobro_en", { p_negocio_id: B })).data === "al_corriente", "con la suscripción activa queda al corriente");
  const tope = await rpc(tAdmin, "guardar_tope_recordatorios", { p_tope: 0.62 });
  comprobar(tope.ok, "el admin pone un tope de $0.62 (dos mensajes de $0.31)");
  const topeRecep = await rpc(tRecep, "guardar_tope_recordatorios", { p_tope: null });
  comprobar(!topeRecep.ok, "recepción no puede cambiar el tope");
  // Los 30 del relleno ya cuentan como entregados: se registran en el cobro del mes como gratis.
  const conCobro = new Set(((await A.from("wa_recordatorios_cobro").select("recordatorio_id").eq("negocio_id", B)).data ?? []).map((x) => x.recordatorio_id));
  const ids30 = ((await SB.from("recordatorios_wa").select("id").eq("negocio_id", B).neq("id", p7?.id ?? "00000000-0000-0000-0000-000000000000")).data ?? []).filter((x) => !conCobro.has(x.id));
  const mes = new Date(`${hoy}T12:00:00Z`).toISOString().slice(0, 8) + "01";
  const { count: yaContados } = await A.from("wa_recordatorios_cobro").select("id", { count: "exact", head: true }).eq("negocio_id", B).eq("mes", mes);
  let n = Number(yaContados ?? 0);
  // Los que falten para llegar a 30 entregados en el cobro del mes.
  if (ids30.length < 30 - n) throw new Error(`relleno del cobro: faltan ${30 - n - ids30.length} recordatorios`);
  const rellenoCobro = ids30.slice(0, Math.max(0, 30 - n)).map((x) => ({ recordatorio_id: x.id, negocio_id: B, mes, numero: ++n, excedente: false, precio_mxn: 0.31, costo_mxn: 0.1565 }));
  if (rellenoCobro.length) await A.from("wa_recordatorios_cobro").insert(rellenoCobro);
  await cron();
  const [p7b] = await rec(cita7, "estetica");
  comprobar(p7b?.estado === "enviado" && plantillasA(fer.tel).length === 1, `con suscripción, el pausado sale (${p7b?.estado})`);
  await estado(p7b.wa_id, "delivered", { pricing: { billable: true, category: "utility" } });
  const exc1 = await esperarHasta(async () => (await A.from("wa_recordatorios_cobro").select("*").eq("recordatorio_id", p7b.id).maybeSingle()).data, 15000);
  comprobar(exc1?.excedente === true, `el mensaje ${exc1?.numero} del mes es excedente`);
  const gabo = await nuevoCliente("Gabo");
  const cita8 = await nuevaCita(await nuevoPerro(gabo.id, "Nala"), manana, "15:30");
  const hugo = await nuevoCliente("Hugo");
  const cita9 = await nuevaCita(await nuevoPerro(hugo.id, "Coco"), manana, "16:30");
  await cron();
  const [p8] = await rec(cita8, "estetica");
  const [p9] = await rec(cita9, "estetica");
  const enviados = [p8, p9].filter((x) => x?.estado === "enviado").length;
  const pausados = [p8, p9].filter((x) => x?.estado === "pausado" && /tope/.test(x.motivo ?? "")).length;
  comprobar(enviados === 1 && pausados === 1, `al llegar al tope ($0.62 = 2 adicionales) el siguiente se pausa (enviados ${enviados}, pausados ${pausados})`);
  const enviadoTope = [p8, p9].find((x) => x?.estado === "enviado");
  if (enviadoTope) await estado(enviadoTope.wa_id, "delivered", { pricing: { billable: true, category: "utility" } });
  const reportados = await esperarHasta(async () => {
    const { data } = await A.from("wa_recordatorios_cobro").select("stripe_reportado_at, stripe_error").eq("negocio_id", B).eq("excedente", true);
    return (data ?? []).length >= 2 && data.every((x) => x.stripe_reportado_at) ? data : null;
  }, 60000, 2000);
  if (!reportados) {
    const { data } = await A.from("wa_recordatorios_cobro").select("stripe_error").eq("negocio_id", B).eq("excedente", true);
    console.log("    errores de Stripe:", JSON.stringify(data));
  }
  comprobar(Boolean(reportados), "los 2 excedentes quedan reportados a Stripe");
  const subDespues = await stripe.subscriptions.retrieve(sub.id, { expand: ["items.data.price"] });
  const itemMedido = subDespues.items.data.find((i) => i.price.lookup_key === "peludesk-recordatorios-whatsapp-mensual");
  comprobar(Boolean(itemMedido) && itemMedido.price.recurring?.usage_type === "metered" && Number(String(itemMedido.price.unit_amount_decimal)) === 35.96, `la suscripción lleva el concepto medido «Recordatorios de WhatsApp adicionales» a $0.3596 con IVA (${itemMedido?.price.unit_amount_decimal})`);
  comprobar(subDespues.billing_mode?.type === "flexible", "en modo de cobro flexible (puede convivir con un plan anual)");
  const medidor = itemMedido?.price.recurring?.meter;
  const resumen = medidor
    ? await esperarHasta(async () => {
        const s = await stripe.billing.meters.listEventSummaries(medidor, { customer: customer.id, start_time: Math.floor(Date.now() / 1000 / 60) * 60 - 3600, end_time: Math.floor(Date.now() / 1000 / 60) * 60 + 3600 });
        const total = s.data.reduce((a, x) => a + Number(x.aggregated_value), 0);
        return total >= 2 ? total : null;
      }, 180000, 10000)
    : null;
  comprobar(resumen >= 2, `Stripe suma ${resumen ?? "nada"} mensajes adicionales en el medidor del cliente`);
  const subirTope = await rpc(tAdmin, "guardar_tope_recordatorios", { p_tope: null });
  comprobar(subirTope.ok, "el admin quita el tope");
  await cron();
  comprobar([...(await rec(cita8, "estetica")), ...(await rec(cita9, "estetica"))].every((x) => ["enviado", "entregado", "leido"].includes(x.estado)), "sin tope, el pausado sale");

  // ── 12. Veterinaria, llegada, listo y vacuna ──
  console.log("── 12. Veterinaria, llegada, listo y vacuna");
  const { data: medicoPrevio } = await SB.from("medicos_veterinarios").select("id").eq("profile_id", datos.adminB).is("deleted_at", null).maybeSingle();
  let medico = medicoPrevio?.id;
  if (!medico) {
    const med = await rpc(tAdmin, "guardar_medico_veterinario", { p_profile_id: datos.adminB, p_cedula: String(Date.now()).slice(-7), p_cpa: null });
    medico = med.cuerpo;
    if (!med.ok) console.log(`    (no se pudo designar médico: ${med.mensaje})`);
  }
  const ivan = await nuevoCliente("Iván");
  const firu = await nuevoPerro(ivan.id, "Firu");
  const vet = await rpc(tAdmin, "vet_agendar_cita", { p_perro: firu, p_tipo: "consulta", p_medico: medico, p_inicia: instante(manana, "11:30", ZONA_DIA), p_duracion_min: 30, p_motivo: "Prueba de recordatorio" });
  const vetId = vet.cuerpo?.id ?? vet.cuerpo;
  comprobar(vet.ok && Boolean(vetId), `cita veterinaria de mañana (${vet.mensaje || "ok"})`);
  await cron();
  const [pv] = await rec(vetId, "veterinaria");
  const mv = plantillasA(ivan.tel, "peludesk_rec_veterinaria_v1")[0];
  const psv = mv?.template?.components?.[0]?.parameters?.map((p) => p.text) ?? [];
  comprobar(pv?.estado === "enviado" && psv[4] === "11:30" && psv[5]?.length > 0, `sale el de veterinaria con el médico (${psv.join(" | ")})`);
  await boton(ivan.tel, `rec:${pv.id}:confirmo`, "Confirmo");
  comprobar(await esperarHasta(async () => (await SB.from("vet_citas").select("estado").eq("id", vetId).single()).data?.estado === "confirmada", 20000), "«Confirmo» confirma la cita veterinaria");

  const juli = await nuevoCliente("Juli");
  const perroJ = await nuevoPerro(juli.id, "Chispa");
  const rv = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tRecep), body: JSON.stringify({ cliente_id: juli.id }) });
  const reservaJ = rv.cuerpo?.[0]?.id;
  const est = await llamar(`${URL}/rest/v1/estancias`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ reserva_id: reservaJ, perro_id: perroJ, servicio_id: srv("hotel_noche"), fecha_entrada: manana, fecha_salida: pasado, dia_cerrado_confirmado: "confirmado", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" }) });
  comprobar(est.ok, `una llegada al hotel mañana (${est.mensaje || "ok"})`);
  await cron();
  const [pl] = await rec(reservaJ, "llegada");
  const psl = plantillasA(juli.tel, "peludesk_rec_llegada_v1")[0]?.template?.components?.[0]?.parameters?.map((p) => p.text) ?? [];
  comprobar(pl?.estado === "enviado" && psl[2] === `Chispa${sufijo}`, `sale el de la llegada (${psl.join(" | ")})`);
  await boton(juli.tel, `rec:${pl.id}:confirmo`, "Confirmo");
  comprobar(await esperarHasta(async () => (await SB.from("estancias").select("estado").eq("reserva_id", reservaJ).single()).data?.estado === "confirmada", 20000), "«Confirmo» confirma la estancia");

  const asig = await rpc(tAdmin, "reasignar_estilista_cita", { p_cita_id: cita1, p_empleado_id: datos.esteticaB, p_motivo: "Prueba de recordatorio" });
  if (!asig.ok) console.log(`    (no se asignó estilista: ${asig.mensaje})`);
  await SB.from("citas_estetica").update({ estado: "en_curso" }).eq("id", cita1);
  const fin = await SB.from("citas_estetica").update({ estado: "finalizada" }).eq("id", cita1);
  comprobar(!fin.error, `la cita de Rocky se termina (${fin.error?.message ?? "ok"})`);
  await cron();
  comprobar(plantillasA(ana.tel, "peludesk_rec_listo_v1").length === 1, "sale «ya está listo» al terminar la estética");

  if (medico) {
    const vac = await rpc(tAdmin, "registrar_vacuna", { p_perro_id: firu, p_biologico: `Rabia ${sufijo}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_laboratorio: null, p_fecha: fechaEn(ZONA_DIA, -360), p_proxima: fechaEn(ZONA_DIA, 5), p_medico_id: medico, p_dosis: null, p_notas: null, p_descontar: false });
    comprobar(vac.ok, `vacuna con próxima dosis en 5 días (${vac.mensaje || "ok"})`);
    await cron();
    const mvac = plantillasA(ivan.tel, "peludesk_rec_vacuna_v2")[0];
    const pvac = mvac?.template?.components?.[0]?.parameters?.map((p) => p.text) ?? [];
    comprobar(Boolean(mvac) && /Rabia/.test(pvac[3] ?? ""), `sale el de la vacuna (${pvac.join(" | ")})`);
    const filaVac = (await SB.from("recordatorios_wa").select("id, ref_id").eq("tipo", "vacuna").eq("cliente_id", ivan.id).maybeSingle()).data;
    comprobar((await SB.from("carnet_recordatorios").select("estado").eq("id", filaVac?.ref_id).maybeSingle()).data?.estado === "enviado", "la cola del carnet lo marca enviado (no sale dos veces por «Por mandar»)");
    await boton(ivan.tel, `rec:${filaVac.id}:agendar`, "Agendar");
    comprobar(await esperarHasta(async () => (await SB.from("recordatorios_mensajes").select("id").eq("recordatorio_id", filaVac.id).eq("tipo", "solicitud_cita").maybeSingle()).data, 20000), "«Agendar» deja una solicitud de cita para el negocio");
  }

  // ── 13. Quién ve qué ──
  console.log("── 13. Quién ve qué");
  for (const t of ["recordatorios_wa", "recordatorios_mensajes", "wa_recordatorios_cobro"]) {
    const c = await llamar(`${URL}/rest/v1/${t}?select=id&limit=5`, { headers: cab(tCliente) });
    comprobar(!c.ok || c.cuerpo.length === 0, `el cliente no lee ${t}`);
    const an = await llamar(`${URL}/rest/v1/${t}?select=id&limit=5`, { headers: cab(null) });
    comprobar(!an.ok || an.cuerpo.length === 0, `la llave anónima no lee ${t}`);
  }
  const recLee = await llamar(`${URL}/rest/v1/wa_recordatorios_cobro?select=id&limit=5`, { headers: cab(tAdmin) });
  comprobar(!recLee.ok || recLee.cuerpo.length === 0, "el admin del negocio no lee el costo de la plataforma");
  for (const [fn, args] of [["recordatorio_entrega", { p_wa_id: "x", p_estado: "entregado", p_cobrable: true, p_ts: null, p_motivo: null }], ["recordatorio_responder", { p_id: p1.id, p_accion: "confirmo", p_telefono: ana.tel }], ["recordatorio_texto_entrante", { p_telefono: ana.tel, p_texto: "x", p_baja: true }], ["recordatorios_tomar", { p_limite: 5 }], ["recordatorios_programar", {}]]) {
    const a1 = await rpc(tAdmin, fn, args);
    const a2 = await rpc(null, fn, args);
    comprobar(!a1.ok && !a2.ok, `${fn}: ni el admin ni la llave anónima la ejecutan`);
  }
  const ludo = await llamar(`${URL}/rest/v1/recordatorios_wa?select=id&limit=5`, { headers: cab(tAdmin, "10000000-0000-4000-8000-000000000001") });
  comprobar(!ludo.ok || ludo.cuerpo.length === 0, "el admin de Huellitas no ve los de otro negocio suplantando el encabezado");
  const precio = await llamar(`${URL}/rest/v1/wa_precios?select=precio_mxn,gratis_mes`, { headers: cab(null) });
  comprobar(precio.ok && precio.cuerpo.length >= 1, "el precio publicado sí se lee sin sesión (landing)");

  if (/Error|error/.test(bitacora) && /recordatorios\]/.test(bitacora)) console.log(`    bitácora del servidor:\n${bitacora.split("\n").filter((l) => /recordatorios\]/.test(l)).slice(-10).join("\n")}`);
} catch (e) {
  hallazgos.push(`la prueba se cortó: ${e instanceof Error ? e.message : e}`);
  console.log(`  ✘ ${e instanceof Error ? e.stack : e}`);
  console.log(bitacora.split("\n").slice(-30).join("\n"));
}
await terminar();
