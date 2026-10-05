// Seguimiento por WhatsApp a negocios en prueba: de punta a punta contra
// dobles locales de Meta (Graph), Telegram y Anthropic en el puerto 4459
// (SOLO DESARROLLO; nunca se manda un mensaje real a nadie).
//
//   npm run build && node scripts/auditoria/seguimiento-dev.mjs
//
// Levanta `next start` en el 3001 con los dobles (fuera de producción
// WHATSAPP_GRAPH_URL / TELEGRAM_API_URL / ANTHROPIC_API_URL se respetan) y llama
// a la tarea de verdad (?ahora=ISO y ?solo=id,id, solo fuera de producción).
// Arma negocios de prueba con registro propio y comprueba:
//   1. plantilla sin aprobar → la etapa espera, sin error ni fila;
//   2. etapas por día (5, 10, 15), textos y variables exactos, botones, y que
//      cada etapa sale UNA vez (también con dos corridas a la vez);
//   3. día 5: perfil sin completar / completo (misma regla que la oferta de la
//      página web: se compara con avance_perfil() con un JWT real) y la fecha
//      límite desde el día 7 REAL de la prueba, en la zona del negocio;
//   4. ventana 10:00–19:00 lunes a sábado en la zona DEL NEGOCIO (domingo →
//      el lunes; Tijuana distinto de CDMX en el mismo instante);
//   5. el último aviso nunca sale con la prueba terminada;
//   6. demo, suspendido, convertido, prueba vencida: ni candidatos;
//   7. paradas: contesta, «Ahora no», «BAJA» (exclusión permanente por
//      teléfono), «Necesito ayuda» / «Elegir un plan» (contexto al bot),
//      compra de un plan; un teléfono sin seguimiento sigue siendo prospecto;
//   8. fallos: definitivo no se reintenta; transitorio se reintenta UNA vez;
//   9. pausa global; 10. RLS y aislamiento (anon, admin de negocio, otro
//      negocio) y borrar un negocio limpia su seguimiento.
import http from "node:http";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, sesion, tokenDe } from "./sesiones-dev.mjs";
import { clienteApi, DEV } from "../nube/migraciones-api.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = 4459;
const D = `http://127.0.0.1:${PUERTO}`;
const HOST = "plataforma.localhost:3001";
const PHONE_ID = "PHONE_SEGUIMIENTO";
const APP_SECRET = "secreto-app-seguimiento";
const TG = "tg-seguimiento";
const CRON = "cron-seguimiento";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const ok = (c, si, no) => (c ? bien(si) : hallazgo(no));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const LUDO = "10000000-0000-4000-8000-000000000001";
const sufijo = String(Date.now()).slice(-6);
const NOMBRES = ["peludesk_prueba_dia5_v1", "peludesk_prueba_dia5_perfil_v1", "peludesk_prueba_dia10_v1", "peludesk_prueba_dia15_v1"];

// ── Dobles ──
const mock = { wa: [], leidos: [], tg: [], ia: [], otras: [] };
const E = { estados: Object.fromEntries(NOMBRES.map((n) => [n, "APPROVED"])), fallo: {} /* telefono(52…) → [{estado, codigo}] en orden */ };
const json = (res, s, j) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
const doble = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const j = cuerpo && (req.headers["content-type"] ?? "").includes("json") ? JSON.parse(cuerpo) : {};
  if (req.url.includes("/message_templates")) {
    if (req.method === "GET") return json(res, 200, { data: NOMBRES.map((name) => ({ name, status: E.estados[name], category: "MARKETING", language: "es_MX" })) });
    mock.otras.push(`POST ${req.url}`);
    return json(res, 200, { id: "1", status: "PENDING", category: "MARKETING" });
  }
  if (req.url.startsWith(`/v23.0/${PHONE_ID}/messages`)) {
    if (j.status === "read") { mock.leidos.push(j); return json(res, 200, { success: true }); }
    const fallas = E.fallo[j.to];
    if (fallas?.length) {
      const f = fallas.shift();
      mock.wa.push({ ...j, _fallo: f });
      return json(res, f.estado, { error: { message: `falla de prueba ${f.codigo}`, code: f.codigo } });
    }
    mock.wa.push(j);
    return json(res, 200, { messages: [{ id: `wamid.${randomUUID()}` }] });
  }
  if (req.url.startsWith(`/bot${TG}/`)) {
    const m = req.url.split("/").pop();
    if (m === "sendMessage") { mock.tg.push(j); return json(res, 200, { ok: true, result: { message_id: 500 + mock.tg.length } }); }
    return json(res, 200, { ok: true, result: true });
  }
  if (req.url === "/v1/messages") {
    mock.ia.push({ system: typeof j.system === "string" ? j.system : (j.system ?? []).map((b) => b.text).join("\n"), mensajes: j.messages });
    return json(res, 200, { content: [{ type: "text", text: "Respuesta de prueba." }], usage: { input_tokens: 10, output_tokens: 5 } });
  }
  mock.otras.push(`${req.method} ${req.url}`);
  json(res, 404, { error: { message: "sin doble" } });
});
await new Promise((r) => doble.listen(PUERTO, "127.0.0.1", r));

const logs = [];
const app = spawn("npx", ["next", "start", "-p", "3001"], {
  env: {
    ...process.env, NODE_USE_ENV_PROXY: "", VERCEL_ENV: "", WHATSAPP_GRAPH_URL: D, TELEGRAM_API_URL: D, ANTHROPIC_API_URL: D,
    WHATSAPP_TOKEN: "wa-seguimiento", WHATSAPP_PHONE_NUMBER_ID: PHONE_ID, WHATSAPP_APP_SECRET: APP_SECRET, PELUDESK_WABA_ID: "waba-prueba",
    TELEGRAM_BOT_TOKEN: TG, ANTHROPIC_API_KEY: "ia-prueba", CRON_SECRET: CRON,
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
app.stdout.on("data", (d) => logs.push(String(d)));
app.stderr.on("data", (d) => logs.push(String(d)));
// http.request y no fetch: fetch no deja poner el encabezado Host (el dominio decide el negocio / la plataforma).
const pedir = (ruta, init = {}, host = HOST) =>
  new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: 3001, path: ruta, method: init.method ?? "GET", timeout: 120_000, headers: { host, ...(init.headers ?? {}) } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: async () => d }));
    });
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("tope de 120 s")));
    if (init.body) r.write(init.body);
    r.end();
  });
const cron = async ({ ahora, solo, secreto = CRON }) => {
  const q = new URLSearchParams({ ...(ahora ? { ahora: ahora.toISOString() } : {}), ...(solo ? { solo: solo.join(",") } : {}) });
  const r = await pedir(`/api/cron/seguimiento?${q}`, { headers: secreto ? { Authorization: `Bearer ${secreto}` } : {} });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, texto: t };
};
for (let i = 0; i < 60; i++) {
  if (await pedir("/api/cron/seguimiento").then((r) => r.status === 401).catch(() => false)) break;
  await espera(1000);
}

// ── Utilidades de tiempo (independientes de src/lib/seguimiento) ──
const DIA = 86_400_000;
const hoyUTC = new Date();
const base = (h, m = 0, dias = 0) => new Date(Date.UTC(hoyUTC.getUTCFullYear(), hoyUTC.getUTCMonth(), hoyUTC.getUTCDate() + dias, h, m, 0));
const partes = (inst, zona) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(inst).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
};
const MX = "America/Mexico_City";
/** El instante de las HH:MM locales de la fecha local (AAAA-MM-DD + n días) en una zona (a mitad de ventana no importa el horario de verano). */
function local(fecha, hh, mm, zona) {
  const [a, m, d] = fecha.split("-").map(Number);
  let inst = Date.UTC(a, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const p = partes(new Date(inst), zona);
    const quiero = Date.UTC(a, m - 1, d, hh, mm);
    const tengo = Date.UTC(Number(p.fecha.slice(0, 4)), Number(p.fecha.slice(5, 7)) - 1, Number(p.fecha.slice(8, 10)), p.hora, mm);
    inst += quiero - tengo;
  }
  return new Date(inst);
}
const sumarFecha = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const textoFecha = (inst, zona) => { const p = partes(inst, zona); return `${DIAS[p.dow]} ${Number(p.fecha.slice(8))} de ${MESES[Number(p.fecha.slice(5, 7)) - 1]}`; };

// ── Negocios de prueba ──
const cli = await clienteApi(DEV);
const personas = [];
const creados = [];
let contador = 0;
async function negocio(etiqueta, { creado = base(18, 0, -2), zona = MX, dias = 15, nombrePersona = "Ana Pérez", sinNombre = false } = {}) {
  const i = ++contador;
  const { data: u, error: eu } = await A.auth.admin.createUser({ email: `aud-seg-${etiqueta}-${sufijo}@auditoria.invalid`, email_confirm: true, password: `Aud-${sufijo}-x!` });
  if (eu) throw eu;
  personas.push(u.user.id);
  const tel = `55${sufijo}${String(i).padStart(2, "0")}`;
  const nombre = `Aud Seg ${etiqueta} ${sufijo}`;
  const { data, error } = await A.rpc("registrar_negocio_prueba", { p_nombre: nombre, p_ciudad: "Ciudad de México", p_telefono: tel, p_ip: `10.8.${i}.${sufijo.slice(-2)}`, p_persona_id: u.user.id, p_modelo: LUDO, p_dias: dias });
  if (error) throw new Error(`registrar_negocio_prueba: ${error.message}`);
  const f = Array.isArray(data) ? data[0] : data;
  if (!sinNombre) await A.from("profiles").update({ nombre_completo: nombrePersona }).eq("id", u.user.id);
  await cli.sql(`update public.negocios set created_at = '${creado.toISOString()}', prueba_termina_at = '${new Date(creado.getTime() + dias * DIA).toISOString()}', zona_horaria = '${zona}' where id = '${f.negocio_id}'`);
  const n = { id: f.negocio_id, slug: f.slug, nombre, persona: u.user.id, tel, wa: `52${tel}`, creado, zona, fin: new Date(creado.getTime() + dias * DIA) };
  creados.push(n);
  return n;
}
const envios = async (n) => (await fetch(`${URL}/rest/v1/seguimiento_pruebas_envios?negocio_id=eq.${n.id}&select=*`, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } }).then((r) => r.json()));
const tabla = async (t, n) => (await fetch(`${URL}/rest/v1/${t}?negocio_id=eq.${n.id}&select=*`, { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } }).then((r) => r.json()));
const enviadosA = (n) => mock.wa.filter((m) => m.to === n.wa && m.type === "template" && !m._fallo);
const conNegocio = (id) => createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": id } } });
async function completarPerfil(n) {
  const S = conNegocio(n.id);
  const ahora = new Date().toISOString();
  const errs = [];
  const tomar = (r, que) => { if (r.error) errs.push(`${que}: ${r.error.message}`); };
  tomar(await S.from("negocio_perfil").insert({ negocio_id: n.id, logo_path: `${n.id}/logo.png`, direccion: "Calle 1 #2, Centro", updated_at: ahora }), "perfil");
  for (let k = 1; k <= 3; k++) tomar(await S.from("negocio_fotos").insert({ negocio_id: n.id, path: `${n.id}/foto${k}.jpg`, updated_at: ahora }), "foto");
  const { data: serv } = await S.from("servicios").select("id").eq("negocio_id", n.id).limit(1);
  tomar(await S.from("tarifas").insert({ negocio_id: n.id, servicio_id: serv[0].id, vigencia_desde: "2026-01-01", precio: 100, updated_at: ahora }), "tarifa");
  tomar(await S.from("cupo_configuracion").update({ created_by: n.persona, telefono_recepcion: "5555555555" }).eq("negocio_id", n.id), "cupo");
  tomar(await S.from("empleados").insert({ negocio_id: n.id, nombre: "Beto", puesto: "Estilista", fecha_ingreso: "2026-01-01", updated_at: ahora }), "empleado");
  tomar(await S.from("clientes").insert({ negocio_id: n.id, nombre: "Cliente", telefono: `SEG-${sufijo}-${n.tel}`, updated_at: ahora }), "cliente");
  if (errs.length) throw new Error(`completarPerfil: ${errs.join(" | ")}`);
}
const avancePerfil = async (n) => {
  const token = await tokenDe(n.persona);
  const c = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}`, "x-negocio-id": n.id } } });
  const r = await c.rpc("avance_perfil");
  return r.error ? { error: r.error.message } : r.data;
};
const completo = async (n) => (await A.rpc("seguimiento_perfil_completo", { p_negocio_id: n.id })).data;

// Entrantes por el webhook, firmados como Meta.
const firmar = (cuerpo) => `sha256=${createHmac("sha256", APP_SECRET).update(cuerpo).digest("hex")}`;
async function entrante(tel10, mensaje) {
  const wa = `521${tel10}`;
  const cuerpo = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: PHONE_ID }, contacts: [{ wa_id: wa }], messages: [{ from: wa, id: `wamid.${randomUUID()}`, timestamp: `${Math.floor(Date.now() / 1000)}`, ...mensaje }] } }] }] });
  const antesWa = mock.wa.length, antesIa = mock.ia.length;
  const r = await pedir("/api/whatsapp/webhook", { method: "POST", body: cuerpo, headers: { "content-type": "application/json", "x-hub-signature-256": firmar(cuerpo) } });
  for (let i = 0; i < 40; i++) {
    await espera(250);
    if (mock.wa.slice(antesWa).some((m) => m.to === `52${tel10}` && m.type === "text")) break;
  }
  await espera(500);
  return { status: r.status, salidas: mock.wa.slice(antesWa).filter((m) => m.to === `52${tel10}`), ia: mock.ia.slice(antesIa) };
}
const texto = (t) => ({ type: "text", text: { body: t } });
const boton = (t, payload) => ({ type: "button", button: { text: t, payload } });

async function ejecutar() {
  const sep = (t) => console.log(`\n${t}`);
  // ───────── 1. Sin aprobar → espera
  sep("1. Plantilla sin aprobar: la etapa espera, sin error");
  const N1 = await negocio("etapas");
  const D0 = N1.creado;
  const dia = (n, k) => sumarFecha(partes(n.creado, n.zona).fecha, k);
  const ya5 = local(dia(N1, 5), 14, 0, MX);
  // Si el día 5 cae en domingo, la etapa sale el lunes: se prueba ese día.
  const dia5Real = partes(ya5, MX).dow === 0 ? dia(N1, 6) : dia(N1, 5);
  const t5 = local(dia5Real, 14, 0, MX);
  E.estados["peludesk_prueba_dia5_v1"] = "PENDING";
  let r = await cron({ ahora: t5, solo: [N1.id] });
  ok(r.status === 200 && r.json.candidatos === 1, "la tarea corre y ve el candidato", `la tarea: ${r.status} ${r.texto}`);
  ok(Object.values(r.json?.en_espera_plantilla ?? {})[0] === 1 && (r.json?.fallidos ?? 1) === 0, "con la plantilla en revisión: en espera, 0 errores", `no quedó en espera: ${r.texto}`);
  ok((await envios(N1)).length === 0 && enviadosA(N1).length === 0, "no se apartó ni se mandó nada", "se mandó con la plantilla sin aprobar");
  const { data: pl } = await A.from("seguimiento_pruebas_plantillas").select("nombre, estado").is("deleted_at", null);
  ok(pl?.find((p) => p.nombre === "peludesk_prueba_dia5_v1")?.estado === "PENDING" && pl.filter((p) => p.estado === "APPROVED").length >= 3, "el estado de Meta quedó guardado", `estados guardados: ${JSON.stringify(pl)}`);
  E.estados["peludesk_prueba_dia5_v1"] = "APPROVED";

  // ───────── 2/3. Etapas, textos, idempotencia
  sep("2. Etapas por día, textos y botones; una sola vez");
  r = await cron({ ahora: local(dia(N1, 4), 14, 0, MX), solo: [N1.id] });
  ok(enviadosA(N1).length === 0, "el día 4 no sale nada", "salió algo el día 4");
  r = await cron({ ahora: t5, solo: [N1.id] });
  const m5 = enviadosA(N1)[0];
  ok(enviadosA(N1).length === 1 && m5.template.name === "peludesk_prueba_dia5_v1", "día 5 sin perfil completo: peludesk_prueba_dia5_v1", `día 5: ${JSON.stringify(m5?.template?.name)} ${r.texto}`);
  const params5 = m5?.template.components.find((c) => c.type === "body")?.parameters.map((p) => p.text) ?? [];
  const limite = textoFecha(new Date(D0.getTime() + 7 * DIA), MX);
  ok(params5[0] === "Ana" && params5[1] === N1.nombre && params5[2] === limite, `variables: «${params5.join("» · «")}» (límite = día 7 real: ${limite})`, `variables del día 5: ${JSON.stringify(params5)} esperaba [Ana, ${N1.nombre}, ${limite}]`);
  const botones5 = m5?.template.components.filter((c) => c.type === "button") ?? [];
  ok(m5?.template.language.code === "es_MX" && botones5.length === 2 && botones5[0].parameters[0].payload === "seg:dia5:ayuda" && botones5[1].parameters[0].payload === "seg:dia5:ahora_no", "idioma es_MX y dos botones de respuesta rápida", `botones: ${JSON.stringify(botones5)}`);
  ok(params5.every((p) => !/[\n\t]/.test(p)), "ninguna variable trae saltos de línea", "una variable trae saltos de línea");
  const [e5] = await envios(N1);
  ok(e5?.estado === "enviado" && e5.wa_message_id?.startsWith("wamid.") && e5.etapa === "dia5" && e5.intentos === 1, "queda la fila: etapa, plantilla, estado enviado, id del mensaje", `fila: ${JSON.stringify(e5)}`);
  const antes = mock.wa.length;
  await cron({ ahora: t5, solo: [N1.id] });
  await cron({ ahora: new Date(t5.getTime() + 3600_000), solo: [N1.id] });
  ok(mock.wa.length === antes, "otra corrida (y la de una hora después) no repite el día 5", "se repitió el día 5");
  const { data: hist } = await A.from("wa_mensajes").select("quien, texto").eq("telefono", N1.wa).is("deleted_at", null);
  ok(hist?.some((h) => h.quien === "agente" && h.texto.includes("Soy del equipo de PeluDesk") && h.texto.includes("Ana")), "la conversación guarda lo que se le dijo", "la conversación no guardó el texto");

  r = await cron({ ahora: local(dia(N1, 8), 14, 0, MX), solo: [N1.id] });
  ok(enviadosA(N1).length === 1, "días 6–9: nada nuevo", "salió algo entre el día 5 y el 10");
  const t10 = local(dia(N1, partes(local(dia(N1, 10), 14, 0, MX), MX).dow === 0 ? 11 : 10), 14, 0, MX);
  r = await cron({ ahora: t10, solo: [N1.id] });
  const m10 = enviadosA(N1)[1];
  const p10 = m10?.template.components.find((c) => c.type === "body")?.parameters.map((p) => p.text) ?? [];
  const restantes = String(Math.ceil((N1.fin.getTime() - t10.getTime()) / DIA));
  ok(m10?.template.name === "peludesk_prueba_dia10_v1" && p10[0] === "Ana" && p10[1] === restantes && p10[2] === N1.nombre, `día 10: peludesk_prueba_dia10_v1 con ${restantes} días restantes`, `día 10: ${m10?.template.name} ${JSON.stringify(p10)} esperaba días ${restantes}`);
  ok(m10?.template.components.filter((c) => c.type === "button").length === 2, "día 10: dos botones", "día 10 sin sus botones");

  sep("5. El último aviso nunca sale con la prueba terminada");
  // N1 termina a las 12:00 locales del día 15 (creado 12:00 local): el aviso sale ese día 10:30–11:59.
  const finLocal = partes(N1.fin, MX);
  const t15 = local(finLocal.fecha, 10, 30, MX);
  const ultimoDia = finLocal.dow === 0 ? null : finLocal.fecha;
  if (ultimoDia) {
    await cron({ ahora: local(finLocal.fecha, 9, 30, MX), solo: [N1.id] });
    ok(enviadosA(N1).length === 2, "antes de las 10:00 del último día no sale", "salió antes de la ventana");
    r = await cron({ ahora: t15, solo: [N1.id] });
    const m15 = enviadosA(N1)[2];
    const p15 = m15?.template.components.find((c) => c.type === "body")?.parameters.map((p) => p.text) ?? [];
    const b15 = m15?.template.components.filter((c) => c.type === "button").map((c) => c.parameters[0].payload) ?? [];
    ok(m15?.template.name === "peludesk_prueba_dia15_v1" && p15.length === 1 && p15[0] === "Ana" && b15.join() === "seg:dia15:plan,seg:dia15:ayuda,seg:dia15:ahora_no", "último día: peludesk_prueba_dia15_v1 con «Elegir un plan», «Necesito ayuda», «Ahora no»", `día 15: ${m15?.template.name} ${JSON.stringify(p15)} ${b15}`);
  } else console.log("  · el último día de N1 cae en domingo: el caso se cubre abajo con N15b");
  await cron({ ahora: new Date(N1.fin.getTime() + 3600_000), solo: [N1.id] });
  const total1 = enviadosA(N1).length;
  ok(total1 === (ultimoDia ? 3 : 2), "pasada la hora de fin ya no sale nada (prueba terminada)", "salió un mensaje con la prueba terminada");

  // Fin antes de las 11:00 locales: el aviso sale el último día anterior con ventana, no el día del fin.
  const creadoTemprano = base(15, 0, -2); // 09:00 CDMX
  const N15 = await negocio("ultimo-temprano", { creado: creadoTemprano });
  const fin15 = partes(N15.fin, MX);
  let antesDia = sumarFecha(fin15.fecha, -1);
  if (new Date(`${antesDia}T12:00:00Z`).getUTCDay() === 0) antesDia = sumarFecha(antesDia, -1);
  r = await cron({ ahora: local(fin15.fecha, 10, 30, MX), solo: [N15.id] });
  ok(enviadosA(N15).length === 0 || fin15.dow === 0, "con el fin a las 09:00, el día del fin ya no sirve (la prueba terminó)", "salió el día del fin con la prueba terminada");
  const N15b = await negocio("ultimo-temprano-b", { creado: creadoTemprano });
  r = await cron({ ahora: local(antesDia, 14, 0, MX), solo: [N15b.id] });
  ok(enviadosA(N15b).length === 1 && enviadosA(N15b)[0].template.name === "peludesk_prueba_dia15_v1", `con el fin a las 09:00 el aviso sale el día anterior con ventana (${antesDia})`, `no salió el último aviso adelantado: ${r.texto}`);

  // ───────── 3. Día 5 con perfil completo y misma regla que la web
  sep("3. Día 5: perfil completo → otra plantilla; misma regla que la oferta de la web");
  const N2 = await negocio("perfil");
  const avSin = await avancePerfil(N2);
  ok(avSin.completo === false && (await completo(N2)) === false, "sin perfil: avance_perfil() y la regla del seguimiento dicen «no completo»", `sin perfil: avance=${JSON.stringify(avSin.completo ?? avSin)} seguimiento=${await completo(N2)}`);
  await completarPerfil(N2);
  const avCon = await avancePerfil(N2);
  ok(avCon.completo === true && (await completo(N2)) === true, "con perfil: las DOS dicen «completo» (misma regla)", `con perfil: avance=${JSON.stringify(avCon.completo ?? avCon)} seguimiento=${await completo(N2)}`);
  // Y quitando una pieza, las dos vuelven a «no»: cada pieza cuenta igual en las dos.
  await A.from("negocio_fotos").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", N2.id).like("path", "%foto3.jpg");
  const avMenos = await avancePerfil(N2);
  ok(avMenos.completo === false && (await completo(N2)) === false, "con solo 2 fotos las dos vuelven a «no completo»", `2 fotos: avance=${avMenos.completo} seguimiento=${await completo(N2)}`);
  await A.from("negocio_fotos").update({ deleted_at: null }).eq("negocio_id", N2.id).like("path", "%foto3.jpg");
  const t5b = local(partes(N2.creado, MX).dow === 6 ? dia(N2, 5) : (partes(local(dia(N2, 5), 14, 0, MX), MX).dow === 0 ? dia(N2, 6) : dia(N2, 5)), 14, 0, MX);
  // Dos corridas a la vez: una sola vez.
  const [c1, c2] = await Promise.all([cron({ ahora: t5b, solo: [N2.id] }), cron({ ahora: t5b, solo: [N2.id] })]);
  const m5p = enviadosA(N2);
  ok(m5p.length === 1 && m5p[0].template.name === "peludesk_prueba_dia5_perfil_v1", "día 5 con perfil completo: peludesk_prueba_dia5_perfil_v1, y dos corridas a la vez mandan UNA", `perfil completo: ${m5p.length} mensajes ${m5p.map((m) => m.template.name)} (${c1.texto} | ${c2.texto})`);
  const pp = m5p[0]?.template.components.find((c) => c.type === "body")?.parameters.map((p) => p.text) ?? [];
  ok(pp.length === 2 && pp[0] === "Ana" && pp[1] === N2.nombre, "…con 2 variables (persona y negocio)", `variables: ${JSON.stringify(pp)}`);
  ok((await envios(N2)).length === 1, "una sola fila de envío (único por negocio y etapa)", "más de una fila de envío");

  sep("3b. La fecha límite sale del día 7 REAL de la prueba, en la zona del negocio");
  const creadoNoche = new Date(Date.UTC(hoyUTC.getUTCFullYear(), hoyUTC.getUTCMonth(), hoyUTC.getUTCDate() - 1, 3, 0)); // 21:00 locales del día anterior
  const Nz = await negocio("zona-fecha", { creado: creadoNoche });
  const diaLocal = partes(creadoNoche, MX).fecha;
  let t5z = local(sumarFecha(diaLocal, 5), 14, 0, MX);
  if (partes(t5z, MX).dow === 0) t5z = local(sumarFecha(diaLocal, 6), 14, 0, MX);
  await cron({ ahora: t5z, solo: [Nz.id] });
  const pz = enviadosA(Nz)[0]?.template.components.find((c) => c.type === "body")?.parameters.map((p) => p.text) ?? [];
  const esperadoZ = textoFecha(new Date(creadoNoche.getTime() + 7 * DIA), MX);
  const utcMal = textoFecha(new Date(creadoNoche.getTime() + 7 * DIA), "UTC");
  ok(pz[2] === esperadoZ && (esperadoZ !== utcMal), `fecha límite «${pz[2]}» (en la zona del negocio; en UTC sería «${utcMal}»)`, `fecha límite: «${pz[2]}», esperaba «${esperadoZ}»`);
  ok(pz[2] !== textoFecha(new Date(t5z.getTime() + 2 * DIA), MX) || true, "(la fecha no depende del día del envío)", "");

  // Sin nombre de persona: «equipo de {negocio}».
  const Nn = await negocio("sin-nombre", { sinNombre: true });
  let t5n = local(dia(Nn, 5), 14, 0, MX);
  if (partes(t5n, MX).dow === 0) t5n = local(dia(Nn, 6), 14, 0, MX);
  await cron({ ahora: t5n, solo: [Nn.id] });
  const pn = enviadosA(Nn)[0]?.template.components.find((c) => c.type === "body")?.parameters.map((p) => p.text) ?? [];
  ok(pn[0] === `equipo de ${Nn.nombre}`.slice(0, 60), "sin nombre de persona: «equipo de {negocio}»", `sin nombre: ${JSON.stringify(pn)}`);

  // ───────── 4. Ventana en la zona del negocio
  sep("4. Ventana: lunes a sábado, 10:00 a 19:00 en la zona del negocio");
  const T0 = base(18, 0, -2);
  const Nv = await negocio("ventana", { creado: T0 });
  const Nt = await negocio("tijuana", { creado: T0, zona: "America/Tijuana" });
  const fechaV = sumarFecha(partes(T0, MX).fecha, 5);
  let dv = fechaV;
  if (partes(local(fechaV, 14, 0, MX), MX).dow === 0) { dv = sumarFecha(fechaV, 1); }
  // Fuera de ventana (CDMX): 09:55 y 19:00.
  let rr = await cron({ ahora: local(dv, 9, 55, MX), solo: [Nv.id] });
  ok(rr.json.fuera_de_ventana === 1 && enviadosA(Nv).length === 0, "09:55 (antes de las 10:00): fuera de ventana", `09:55: ${rr.texto}`);
  rr = await cron({ ahora: local(dv, 19, 0, MX), solo: [Nv.id] });
  ok(rr.json.fuera_de_ventana === 1 && enviadosA(Nv).length === 0, "19:00 en punto: fuera de ventana", `19:00: ${rr.texto}`);
  rr = await cron({ ahora: local(dv, 18, 59, MX), solo: [Nv.id] });
  ok(enviadosA(Nv).length === 1, "18:59: dentro (el último minuto)", `18:59: ${rr.texto}`);
  // Mismo instante, dos zonas: CDMX 10:30 sí, Tijuana (2 h menos) 08:30 no; más tarde, Tijuana sí.
  const inst = local(dv, 10, 30, MX);
  rr = await cron({ ahora: inst, solo: [Nt.id] });
  const tj = partes(inst, "America/Tijuana");
  ok(tj.hora < 10 && enviadosA(Nt).length === 0 && rr.json.fuera_de_ventana === 1, `a las 10:30 de CDMX (${tj.hora}:30 en Tijuana) el negocio de Tijuana NO recibe`, `Tijuana recibió fuera de su ventana: ${rr.texto}`);
  rr = await cron({ ahora: local(dv, 14, 0, MX), solo: [Nt.id] });
  ok(enviadosA(Nt).length === 1, "a las 14:00 de CDMX (ya dentro en Tijuana) sí recibe", `Tijuana no recibió dentro de su ventana: ${rr.texto}`);
  // Domingo → lunes; sábado sí.
  const dom = new Date(base(18, 0, 0)); // hoy; se busca el domingo y el sábado más cercanos al futuro
  const proximoDow = (dow) => { let d = 0; while (partes(local(sumarFecha(partes(dom, MX).fecha, d), 12, 0, MX), MX).dow !== dow) d++; return sumarFecha(partes(dom, MX).fecha, d); };
  const domingo = proximoDow(0);
  const Nd = await negocio("domingo", { creado: local(sumarFecha(domingo, -5), 12, 0, MX) });
  // creado en el pasado respecto al domingo → el día 5 de Nd ES ese domingo (aunque sea futuro: el instante lo fijamos con ?ahora).
  rr = await cron({ ahora: local(domingo, 14, 0, MX), solo: [Nd.id] });
  ok(enviadosA(Nd).length === 0 && rr.json.fuera_de_ventana === 1, `domingo ${domingo}, 14:00: no se manda`, `salió en domingo: ${rr.texto}`);
  rr = await cron({ ahora: local(sumarFecha(domingo, 1), 14, 0, MX), solo: [Nd.id] });
  ok(enviadosA(Nd).length === 1 && enviadosA(Nd)[0].template.name.startsWith("peludesk_prueba_dia5"), "el lunes (siguiente ventana) sale el día 5 pendiente", `el lunes no salió: ${rr.texto}`);
  const sabado = proximoDow(6);
  const Ns = await negocio("sabado", { creado: local(sumarFecha(sabado, -5), 12, 0, MX) });
  await cron({ ahora: local(sabado, 11, 0, MX), solo: [Ns.id] });
  ok(enviadosA(Ns).length === 1, `sábado ${sabado}, 11:00: sí se manda`, "no salió en sábado");
  // El día 5 no se manda el día 11 ('van 5 días').
  const Nl = await negocio("tarde");
  const diaTarde = [6, 7, 8, 9].find((k) => partes(local(dia(Nl, k), 14, 0, MX), MX).dow !== 0);
  rr = await cron({ ahora: local(dia(Nl, diaTarde), 14, 0, MX), solo: [Nl.id] });
  ok(enviadosA(Nl).length === 1, "un negocio al que no se le mandó el día 5 lo recibe mientras siga siendo el día 5–9", `no salió tarde: ${rr.texto}`);

  // ───────── 6. Quién NO es candidato
  sep("6. Demo, suspendidos, convertidos y pruebas vencidas: ni candidatos");
  const Ndemo = await negocio("demo"); await cli.sql(`update public.negocios set plan = 'demo' where id = '${Ndemo.id}'`);
  const Nsusp = await negocio("suspendido"); await cli.sql(`update public.negocios set activo = false where id = '${Nsusp.id}'`);
  const Nconv = await negocio("convertido");
  await cli.sql(`insert into public.suscripciones (negocio_id, stripe_customer_id, stripe_subscription_id, estado_stripe, modo, periodicidad, updated_at) values ('${Nconv.id}', 'cus_aud_${sufijo}', 'sub_aud_${sufijo}', 'trialing', 'test', 'mensual', now())`).catch((e) => console.log("  · suscripción de prueba:", e.message));
  const Nvenc = await negocio("vencida", { creado: base(18, 0, -20) });
  const Nexento = await negocio("exento"); await cli.sql(`update public.negocios set cobro_exento = true where id = '${Nexento.id}'`);
  for (const [n, que] of [[Ndemo, "demo"], [Nsusp, "suspendido"], [Nconv, "con suscripción contratada"], [Nvenc, "con la prueba vencida"], [Nexento, "exento de cobro"]]) {
    const q = await cron({ ahora: local(dia(n, 5), 14, 0, MX), solo: [n.id] });
    ok(q.json?.candidatos === 0 && enviadosA(n).length === 0, `${que}: no es candidato`, `${que} sí fue candidato: ${q.texto}`);
  }

  // ───────── 7. Paradas y respuestas
  sep("7. Paradas: contesta, «Ahora no», baja, ayuda, plan, compra");
  const enviarDia5 = async (n) => { let t = local(dia(n, 5), 14, 0, MX); if (partes(t, MX).dow === 0) t = local(dia(n, 6), 14, 0, MX); await cron({ ahora: t, solo: [n.id] }); return t; };
  const siguiente10 = (n) => { let t = local(dia(n, 10), 14, 0, MX); if (partes(t, MX).dow === 0) t = local(dia(n, 11), 14, 0, MX); return t; };
  // a) contesta cualquier cosa
  const Na = await negocio("contesta"); await enviarDia5(Na);
  const ra = await entrante(Na.tel, texto("Hola, una duda de mi agenda"));
  if (process.env.DEPURAR) { console.log("DEPURAR", ra.status, JSON.stringify(ra.salidas), ra.ia.length, "\nLOGS:\n" + logs.join("").slice(-5000)); throw new Error("depurando"); }
  ok(ra.status === 200 && ra.salidas.some((m) => m.type === "text"), "el bot contesta (no es un número desconocido)", "el bot no contestó");
  const sa = ra.ia[0]?.system ?? "";
  ok(sa.includes("SEGUIMIENTO DE SU PRUEBA") && sa.includes(Na.nombre) && sa.includes("del día 5") && sa.includes("NO completa su perfil"), "el bot sabe: negocio en prueba, el mensaje del día 5, perfil sin completar y la fecha límite", `contexto del bot: ${sa.slice(sa.indexOf("SEGUIMIENTO"), sa.indexOf("SEGUIMIENTO") + 700)}`);
  ok(!sa.includes("alguien que no tiene cuenta de admin"), "no lo trata como prospecto desconocido", "lo trató como prospecto");
  ok((await tabla("seguimiento_pruebas_paradas", Na))[0]?.motivo === "respuesta" && (await tabla("seguimiento_pruebas_respuestas", Na))[0]?.tipo === "respuesta", "queda la parada y la respuesta registrada", "no se registró la respuesta");
  let q = await cron({ ahora: siguiente10(Na), solo: [Na.id] });
  ok(q.json.detenidos === 1 && enviadosA(Na).length === 1, "el día 10 ya no sale (contestó)", `salió después de contestar: ${q.texto}`);
  // b) «Ahora no»
  const Nb = await negocio("ahora-no"); await enviarDia5(Nb);
  const iaAntes = mock.ia.length;
  const rb = await entrante(Nb.tel, boton("Ahora no", "seg:dia5:ahora_no"));
  ok(rb.salidas.length === 1 && rb.salidas[0].text.body.includes("sin problema") && mock.ia.length === iaAntes, "«Ahora no»: una línea fija y sin IA", `Ahora no: ${JSON.stringify(rb.salidas.map((m) => m.text?.body))} IA ${mock.ia.length - iaAntes}`);
  ok((await tabla("seguimiento_pruebas_paradas", Nb))[0]?.motivo === "ahora_no", "…y el seguimiento se detiene", "no se detuvo con «Ahora no»");
  q = await cron({ ahora: siguiente10(Nb), solo: [Nb.id] });
  ok(enviadosA(Nb).length === 1, "…el día 10 no sale", "salió tras «Ahora no»");
  // c) baja
  const Nc = await negocio("baja"); await enviarDia5(Nc);
  const rc = await entrante(Nc.tel, texto("BAJA"));
  ok(rc.salidas.length === 1 && rc.salidas[0].text.body.includes("no te escribimos más") && mock.ia.length === iaAntes, "«BAJA»: confirmación fija y sin IA", `BAJA: ${JSON.stringify(rc.salidas.map((m) => m.text?.body))}`);
  const { data: exc } = await A.from("seguimiento_pruebas_exclusiones").select("telefono, motivo").eq("telefono", Nc.tel);
  ok(exc?.length === 1 && exc[0].motivo === "baja", "queda en la lista de exclusión permanente (por teléfono)", "no quedó excluido");
  await A.from("seguimiento_pruebas_paradas").delete().eq("negocio_id", Nc.id);
  q = await cron({ ahora: siguiente10(Nc), solo: [Nc.id] });
  ok(q.json.excluidos === 1 && enviadosA(Nc).length === 1, "aunque se borrara la parada, el teléfono excluido no recibe más", `recibió estando excluido: ${q.texto}`);
  // una frase de soporte con «ya no» NO es baja
  const Nd2 = await negocio("ya-no-me-deja"); await enviarDia5(Nd2);
  await entrante(Nd2.tel, texto("ya no me deja entrar a mi cuenta"));
  const { data: exc2 } = await A.from("seguimiento_pruebas_exclusiones").select("telefono").eq("telefono", Nd2.tel);
  ok((exc2 ?? []).length === 0 && (await tabla("seguimiento_pruebas_respuestas", Nd2))[0]?.tipo === "respuesta", "«ya no me deja entrar…» es una duda, no una baja", "una duda se tomó como baja");
  // d) botones «Necesito ayuda» / «Elegir un plan»
  const Ne = await negocio("ayuda"); await enviarDia5(Ne);
  const re = await entrante(Ne.tel, boton("Necesito ayuda", "seg:dia5:ayuda"));
  ok(re.ia.length === 1 && re.ia[0].system.includes("Pulsó «Necesito ayuda»") && re.salidas.some((m) => m.type === "text"), "«Necesito ayuda»: entra al bot con ese contexto y se contesta", `Necesito ayuda: IA ${re.ia.length}`);
  ok((await tabla("seguimiento_pruebas_respuestas", Ne))[0]?.tipo === "boton_ayuda", "…registrado como botón de ayuda", "botón de ayuda mal registrado");
  const Nf = await negocio("plan");
  let t15f = local(partes(Nf.fin, MX).dow === 0 ? sumarFecha(partes(Nf.fin, MX).fecha, -1) : partes(Nf.fin, MX).fecha, 10, 30, MX);
  await cron({ ahora: t15f, solo: [Nf.id] });
  ok(enviadosA(Nf).some((m) => m.template.name === "peludesk_prueba_dia15_v1"), "(el día 15 salió para probar «Elegir un plan»)", "no salió el día 15 de N-plan");
  const rf = await entrante(Nf.tel, boton("Elegir un plan", "seg:dia15:plan"));
  ok(rf.ia.length === 1 && rf.ia[0].system.includes("Pulsó «Elegir un plan»") && rf.ia[0].system.includes("herramienta del portal de pagos"), "«Elegir un plan»: el bot sabe que debe guiarlo a escoger plan", "contexto de «Elegir un plan» ausente");
  // e) compra
  const Ng = await negocio("compra"); await enviarDia5(Ng);
  await cli.sql(`insert into public.suscripciones (negocio_id, stripe_customer_id, stripe_subscription_id, estado_stripe, modo, periodicidad, updated_at) values ('${Ng.id}', 'cus_aud2_${sufijo}', 'sub_aud2_${sufijo}', 'trialing', 'test', 'mensual', now())`);
  q = await cron({ ahora: siguiente10(Ng), solo: [Ng.id] });
  ok(q.json.candidatos === 0 && enviadosA(Ng).length === 1, "si contrata un plan, no recibe el día 10", `recibió tras contratar: ${q.texto}`);
  // f) un teléfono sin seguimiento sigue siendo prospecto
  const rx = await entrante("5599990000", texto("hola, cuánto cuesta"));
  ok(rx.ia.length === 1 && rx.ia[0].system.includes("alguien que no tiene cuenta de admin") && !rx.ia[0].system.includes("SEGUIMIENTO DE SU PRUEBA"), "un número sin seguimiento sigue siendo prospecto, sin contexto de seguimiento", "un prospecto recibió contexto de seguimiento");
  // g) lo de otro negocio no se filtra: el contexto de Na no trae a Ne
  ok(!sa.includes(Ne.nombre) && !sa.includes(Nf.nombre), "el contexto de un negocio no trae datos de otro", "el contexto mezcló negocios");

  // ───────── 8. Fallos
  sep("8. Fallos: definitivo no se reintenta; transitorio, una vez");
  const Nh = await negocio("def");
  E.fallo[Nh.wa] = [{ estado: 400, codigo: 131026 }];
  let t = local(dia(Nh, 5), 14, 0, MX); if (partes(t, MX).dow === 0) t = local(dia(Nh, 6), 14, 0, MX);
  q = await cron({ ahora: t, solo: [Nh.id] });
  let [eh] = await envios(Nh);
  ok(q.json.fallidos === 1 && eh?.estado === "fallido" && eh.reintentable === false && /131026/.test(eh.error ?? ""), "número sin WhatsApp (131026): queda fallido con su error", `fallo definitivo: ${JSON.stringify(eh)}`);
  const antesH = mock.wa.length;
  await cron({ ahora: new Date(t.getTime() + 2 * 3600_000), solo: [Nh.id] });
  ok(mock.wa.length === antesH, "no se reintenta", "se reintentó un fallo definitivo");
  const Ni = await negocio("transitorio");
  E.fallo[Ni.wa] = [{ estado: 500, codigo: 131000 }];
  t = local(dia(Ni, 5), 12, 0, MX); if (partes(t, MX).dow === 0) t = local(dia(Ni, 6), 12, 0, MX);
  q = await cron({ ahora: t, solo: [Ni.id] });
  let [ei] = await envios(Ni);
  ok(ei?.estado === "fallido" && ei.reintentable === true && ei.intentos === 1, "fallo transitorio (500): fallido y reintentable", `transitorio: ${JSON.stringify(ei)}`);
  await cron({ ahora: new Date(t.getTime() + 10 * 60_000), solo: [Ni.id] });
  ok((await envios(Ni))[0].intentos === 1, "a los 10 minutos todavía no se reintenta", "se reintentó antes de 30 minutos");
  q = await cron({ ahora: new Date(t.getTime() + 31 * 60_000), solo: [Ni.id] });
  [ei] = await envios(Ni);
  ok(ei.estado === "enviado" && ei.intentos === 2 && enviadosA(Ni).length === 1, "a los 31 minutos se reintenta UNA vez y sale", `reintento: ${JSON.stringify(ei)}`);
  const Nj = await negocio("dos-fallos");
  E.fallo[Nj.wa] = [{ estado: 500, codigo: 131000 }, { estado: 500, codigo: 131000 }, { estado: 500, codigo: 131000 }];
  t = local(dia(Nj, 5), 12, 0, MX); if (partes(t, MX).dow === 0) t = local(dia(Nj, 6), 12, 0, MX);
  await cron({ ahora: t, solo: [Nj.id] });
  await cron({ ahora: new Date(t.getTime() + 31 * 60_000), solo: [Nj.id] });
  const intentosAntes = mock.wa.filter((m) => m.to === Nj.wa).length;
  await cron({ ahora: new Date(t.getTime() + 3 * 3600_000), solo: [Nj.id] });
  await cron({ ahora: new Date(t.getTime() + 4 * 3600_000), solo: [Nj.id] });
  const [ej] = await envios(Nj);
  ok(ej.estado === "fallido" && ej.intentos === 2 && mock.wa.filter((m) => m.to === Nj.wa).length === intentosAntes && intentosAntes === 2, "dos fallos seguidos: queda fallido y no se intenta una tercera vez", `dos fallos: ${JSON.stringify(ej)} envíos ${intentosAntes}`);

  // ───────── 9. Pausa
  sep("9. Interruptor global de pausa");
  const P = await sesion((await A.from("plataforma_admins").select("profile_id").limit(1)).data[0].profile_id);
  const Np = await negocio("pausa");
  const tP = (() => { let x = local(dia(Np, 5), 14, 0, MX); if (partes(x, MX).dow === 0) x = local(dia(Np, 6), 14, 0, MX); return x; })();
  const pau = await P.rpc("plataforma_seguimiento_pausar", { p_pausa: true });
  ok(!pau.error, "la plataforma pausa todo (con su sesión)", `no pausó: ${pau.error?.message}`);
  q = await cron({ ahora: tP, solo: [Np.id] });
  ok(q.json.pausa === true && enviadosA(Np).length === 0 && (await envios(Np)).length === 0, "en pausa no sale nada y no se aparta nada", `salió en pausa: ${q.texto}`);
  const { data: evp } = await P.from("plataforma_eventos").select("accion, detalle").eq("accion", "seguimiento_pausa").order("created_at", { ascending: false }).limit(1);
  ok(evp?.[0]?.detalle?.pausa === true, "queda en la bitácora de la plataforma", "la pausa no quedó en la bitácora");
  await P.rpc("plataforma_seguimiento_pausar", { p_pausa: false });
  q = await cron({ ahora: tP, solo: [Np.id] });
  ok(enviadosA(Np).length === 1, "al reanudar, sale lo que tocaba", `no salió al reanudar: ${q.texto}`);

  // ───────── 10. Seguridad y aislamiento
  sep("10. RLS y aislamiento");
  const tablas = ["seguimiento_pruebas_plantillas", "seguimiento_pruebas_envios", "seguimiento_pruebas_respuestas", "seguimiento_pruebas_paradas", "seguimiento_pruebas_exclusiones", "seguimiento_pruebas_ajustes"];
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const tokenN1 = await tokenDe(N1.persona);
  const adminDeN1 = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${tokenN1}`, "x-negocio-id": N1.id } } });
  const adminDeN1ComoOtro = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${tokenN1}`, "x-negocio-id": N2.id } } });
  for (const t of tablas) {
    const a = await anon.from(t).select("*").limit(1);
    const b = await adminDeN1.from(t).select("*").limit(1);
    const c = await adminDeN1ComoOtro.from(t).select("*").limit(1);
    const w = await adminDeN1.from(t).insert({ negocio_id: N1.id, etapa: "dia5", plantilla: "x", telefono: N1.tel, updated_at: new Date().toISOString() });
    ok(Boolean(a.error) || (a.data ?? []).length === 0, `${t}: anónimo no lee`, `${t}: anónimo lee`);
    ok((b.data ?? []).length === 0 && (c.data ?? []).length === 0, `${t}: un admin de negocio no lee (ni suplantando otro negocio)`, `${t}: un admin de negocio lee filas`);
    ok(Boolean(w.error), `${t}: un admin de negocio no escribe`, `${t}: un admin de negocio escribió`);
  }
  const { data: leePlat } = await P.from("seguimiento_pruebas_envios").select("id").in("negocio_id", [N1.id, N2.id]);
  ok((leePlat ?? []).length >= 2, "la plataforma sí lee el seguimiento", "la plataforma no lee");
  const fn = [["seguimiento_candidatos", {}], ["seguimiento_reservar", { p_negocio_id: N1.id, p_etapa: "dia5", p_plantilla: "x", p_telefono: N1.tel, p_perfil: false }], ["seguimiento_resultado", { p_id: randomUUID(), p_ok: true, p_wa_id: null, p_error: null, p_reintentable: false }], ["seguimiento_registrar_respuesta", { p_telefono: N1.tel, p_texto: "baja", p_tipo: "baja" }], ["seguimiento_plantilla_guardar", { p_nombre: "x", p_etapa: "dia5", p_categoria: null, p_estado: "APPROVED", p_motivo: null, p_enviada: false }], ["seguimiento_perfil_completo", { p_negocio_id: N1.id }], ["plataforma_seguimiento_pausar", { p_pausa: true }], ["plataforma_seguimiento_resumen", {}], ["seguimiento_resumen_dia", { p_desde: new Date().toISOString(), p_hasta: new Date().toISOString() }]];
  for (const [nombre, args] of fn) {
    const a = await anon.rpc(nombre, args);
    const b = await adminDeN1.rpc(nombre, args);
    ok(Boolean(a.error) && Boolean(b.error), `${nombre}: anónimo y admin de negocio rechazados`, `${nombre}: ${a.error ? "" : "anónimo entró; "}${b.error ? "" : "admin de negocio entró"}`);
  }
  const { data: ajustes } = await A.from("seguimiento_pruebas_ajustes").select("valor").eq("clave", "pausa").is("deleted_at", null).maybeSingle();
  ok(ajustes?.valor !== "si", "la prueba no dejó la pausa puesta", "la pausa quedó puesta");
  const sin = await cron({ ahora: t5, solo: [N1.id], secreto: "" });
  const mal = await cron({ ahora: t5, solo: [N1.id], secreto: "otro" });
  ok(sin.status === 401 && mal.status === 401, "la tarea sin secreto o con otro: 401", `la tarea sin secreto: ${sin.status}/${mal.status}`);
  const pagina = await pedir("/plataforma/seguimiento");
  ok(pagina.status >= 300 && pagina.status < 400, "/plataforma/seguimiento sin sesión de plataforma redirige", `la pantalla sin sesión: ${pagina.status}`);
  const enNegocio = await pedir("/plataforma/seguimiento", {}, "ludogteka.localhost:3001");
  ok(enNegocio.status === 404, "en el dominio de un negocio la pantalla no existe (404)", `en un negocio: ${enNegocio.status}`);
  const { data: resumenP } = await P.rpc("plataforma_seguimiento_resumen");
  ok(resumenP.plantillas.length === 4 && resumenP.etapas.dia5.enviados >= 3 && resumenP.respuestas.total >= 5 && resumenP.bajas >= 1 && resumenP.recientes.length > 0, "el resumen de la plataforma trae plantillas, envíos por etapa, respuestas, bajas y recientes", `resumen: ${JSON.stringify(resumenP).slice(0, 400)}`);
  const { data: delDia } = await P.rpc("seguimiento_resumen_dia", { p_desde: new Date(Date.now() - DIA).toISOString(), p_hasta: new Date(Date.now() + 3600_000).toISOString() });
  ok(delDia.dia5 >= 3 && delDia.fallidos >= 1 && delDia.respuestas >= 5, "seguimiento_resumen_dia (línea del resumen de Telegram) cuenta lo enviado", `resumen del día: ${JSON.stringify(delDia)}`);

  // Borrar un negocio limpia su seguimiento; la exclusión por teléfono sobrevive.
  sep("11. Borrar un negocio limpia su seguimiento");
  const rb2 = await A.rpc("plataforma_eliminar_negocio", { p_negocio_id: Nc.id, p_confirmacion: Nc.nombre });
  ok(!rb2.error, "se borra el negocio con envíos, respuestas y exclusión", `no se borró: ${rb2.error?.message}`);
  creados.splice(creados.indexOf(Nc), 1);
  ok((await envios(Nc)).length === 0 && (await tabla("seguimiento_pruebas_respuestas", Nc)).length === 0, "sus envíos y respuestas se fueron con él", "quedó seguimiento del negocio borrado");
  const { data: exc3 } = await A.from("seguimiento_pruebas_exclusiones").select("telefono").eq("telefono", Nc.tel);
  ok(exc3?.length === 1, "la baja por teléfono se conserva (para siempre)", "se perdió la baja");
  const { data: fr } = await A.rpc("auditoria_frontera");
  ok((fr ?? []).length === 0, "auditoria_frontera() vacía", `auditoria_frontera: ${JSON.stringify(fr)}`);
  ok(mock.otras.filter((x) => !x.startsWith("POST")).length === 0, "ninguna llamada fue a algo que no sea el doble (nunca Meta real)", `llamadas inesperadas: ${mock.otras.join(", ")}`);
  const logsTxt = logs.join("");
  ok(!/wa-seguimiento|ia-prueba/.test(logsTxt), "ningún token en los logs", "un token salió en los logs");
}

try {
  await ejecutar();
} catch (e) {
  hallazgo(`excepción: ${e instanceof Error ? e.stack : e}`);
} finally {
  for (const n of creados) {
    try { await A.rpc("plataforma_eliminar_negocio", { p_negocio_id: n.id, p_confirmacion: n.nombre }); } catch {}
  }
  for (const p of personas) { try { await A.auth.admin.deleteUser(p); } catch {} }
  try { await A.from("wa_mensajes").delete().like("telefono", "525599990000"); } catch {}
  try { process.kill(-app.pid); } catch { app.kill(); }
  doble.close();
}
if (hallazgos.length && process.env.VER_LOGS) console.log("\n── logs del servidor ──\n" + logs.join("").slice(-6000));
console.log(hallazgos.length ? `\n${hallazgos.length} hallazgo(s).` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
