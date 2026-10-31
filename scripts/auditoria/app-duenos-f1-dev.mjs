// App para dueños · Fase 1 (SOLO DESARROLLO). docs/app-duenos/FASE-1.md
//
// Con el servidor compilado y prendido apuntando a los dobles de este script (puerto 4456: Graph de WhatsApp y Anthropic):
//
//   WHATSAPP_GRAPH_URL=http://127.0.0.1:4456 WHATSAPP_TOKEN=wa-prueba WHATSAPP_PHONE_NUMBER_ID=PHONE_PRUEBA \
//   WHATSAPP_APP_SECRET=secreto-app-prueba PELUDESK_WHATSAPP=5215512345678 PELUDESK_WABA_ID=WABA_PRUEBA \
//   ANTHROPIC_API_URL=http://127.0.0.1:4456 ANTHROPIC_API_KEY=ia-prueba CRON_SECRET=mock-cron \
//   npm run start -- -p 3001          (después de npm run build)
//
//   node scripts/auditoria/app-duenos-f1-dev.mjs
//
// Con un cliente de Huellitas (C1) como dueño y otro (C2) como «quien la encontró»:
//   1. Alta de mascota con foto → cae en «leer su cartilla».
//   2. Lectura por foto: el doble de la IA devuelve 3 registros → la pantalla los enseña para revisar → confirmar →
//      quedan en la cartilla (fuente foto), la foto queda con su tiempo, y hay recordatorios programados.
//   3. Captura a mano, PDF, peso, medicamento (programa recordatorios), gasto (el total sale de la base), QR.
//   4. Perfil público /m/<token> sin sesión: mensaje desde la página y «ENCONTRE <token>» por el webhook; al dueño le
//      llega aviso; su respuesta sale por el bot al WhatsApp de C2 (ventana abierta).
//   5. Perdida: avisos a dueños cerca (C2 con zona a 1 km), negocios cerca (sucursal de Huellitas), cartel, perfil con
//      el aviso, «¡Ya apareció!» y la métrica.
//   6. Cron de recordatorios: uno vencido se manda (push/aviso) y por WhatsApp con la plantilla de vacuna; el botón
//      «Agendar» contesta con la liga de la cita.
//   7. RLS: C2 no ve nada de la mascota de C1 (cartilla, pesos, gastos, mensajes); el anónimo nada; nadie ejecuta las
//      funciones de servidor. Celular (390 px) sin desbordes.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { generarCartillas } from "./lib/cartillas-prueba.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO_APP = Number(process.env.PUERTO_APP ?? 3001);
const HOST_APP = `app.localhost:${PUERTO_APP}`;
const BASE_APP = `http://${HOST_APP}`;
const HOST_PLAT = `plataforma.localhost:${PUERTO_APP}`;
const PHONE_ID = "PHONE_PRUEBA";
const APP_SECRET = "secreto-app-prueba";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const sufijo = String(Date.now()).slice(-7);
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
const mas = (d) => new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10) + d)).toISOString().slice(0, 10);

// ── Dobles: Graph de WhatsApp (guarda lo mandado) y Anthropic (lee «cartillas») ────────
const mock = { wa: [], ia: [] };
const LECTURA = {
  es_cartilla: true, nombre_mascota: "Prueba", especie: "gato", peso_kg: 4.2,
  registros: [
    { tipo: "vacuna", nombre: "Triple felina", fecha_aplicacion: mas(-355), proxima_dosis: mas(10), lote: "TF551", laboratorio: "Zoetis", confianza: 0.95 },
    { tipo: "vacuna", nombre: "Antirrábica", fecha_aplicacion: mas(-355), proxima_dosis: mas(10), lote: null, laboratorio: null, confianza: 0.6 },
    { tipo: "desparasitacion", nombre: "Drontal", subtipo: "interna", fecha_aplicacion: mas(-20), proxima_dosis: mas(70), lote: null, laboratorio: "Bayer", confianza: 0.9 },
  ],
  observaciones: "La segunda fila está un poco borrosa.",
};
const doble = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const json = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.method === "POST" && /\/messages$/.test(req.url ?? "") && !/\/v1\/messages$/.test(req.url ?? "")) {
    try { mock.wa.push(JSON.parse(cuerpo)); } catch { /* vacío */ }
    return json(200, { messages: [{ id: `wamid.${randomUUID()}` }] });
  }
  if (req.method === "POST" && /\/v1\/messages$/.test(req.url ?? "")) {
    let b = {};
    try { b = JSON.parse(cuerpo); } catch { /* vacío */ }
    mock.ia.push(b);
    const conImagen = JSON.stringify(b).includes('"type":"image"');
    const tool = (b.tools ?? [])[0]?.name ?? "registrar_cartilla";
    return json(200, { id: "msg_prueba", content: [{ type: "tool_use", id: "tu_1", name: tool, input: conImagen ? LECTURA : { es_cartilla: false, registros: [] } }], usage: { input_tokens: 1500, output_tokens: 300 } });
  }
  if (/message_templates/.test(req.url ?? "")) return json(200, { data: [{ name: "peludesk_rec_vacuna_v2", status: "APPROVED", category: "UTILITY" }, { name: "peludesk_mascota_perdida_v1", status: "APPROVED", category: "UTILITY" }] });
  return json(200, {});
});
await new Promise((r) => doble.listen(4456, "127.0.0.1", r));

function pedir(host, ruta, { method = "GET", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO_APP, path: ruta, method, headers: { host, ...(body ? { "content-type": "application/json" } : {}), ...headers } }, (res) => {
      const partes = [];
      res.on("data", (c) => partes.push(c));
      res.on("end", () => resolve({ status: res.statusCode, cuerpo: Buffer.concat(partes), headers: res.headers }));
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}
const firmar = (cuerpo) => `sha256=${createHmac("sha256", APP_SECRET).update(cuerpo).digest("hex")}`;
const cuerpoWa = (telefonoWa, mensaje, perfil = null) => JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: PHONE_ID, display_phone_number: "525649160742" }, contacts: [{ wa_id: telefonoWa, ...(perfil ? { profile: { name: perfil } } : {}) }], messages: [{ from: telefonoWa, id: `wamid.${randomUUID()}`, timestamp: `${Math.floor(Date.now() / 1000)}`, ...mensaje }] } }] }],
});
async function alBot(telefono10, mensaje, perfil = null) {
  const antes = mock.wa.length;
  const cuerpo = cuerpoWa(`521${telefono10}`, mensaje, perfil);
  const r = await pedir(HOST_PLAT, "/api/whatsapp/webhook", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": firmar(cuerpo) } });
  if (r.status !== 200) throw new Error(`webhook ${r.status}: ${r.cuerpo.toString().slice(0, 200)}`);
  for (let i = 0; i < 60; i++) {
    const nuevas = mock.wa.slice(antes).filter((m) => m.to === `52${telefono10}` && m.type === "text");
    if (nuevas.length) return nuevas[0].text?.body ?? "";
    await new Promise((x) => setTimeout(x, 500));
  }
  return null;
}
const texto = (telefono10, body, perfil) => alBot(telefono10, { type: "text", text: { body } }, perfil);
const boton = (telefono10, payload) => alBot(telefono10, { type: "button", button: { payload, text: "Agendar" } });

// ── Datos ─────────────────────────────────────────────────────────
const { data: hue } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const H = hue.id;
const servicioH = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const sinNegocio = (token) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const anonimo = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: miembros } = await servicioH.from("membresias").select("profile_id, cliente_id").eq("negocio_id", H).eq("rol", "cliente").is("deleted_at", null).not("cliente_id", "is", null).limit(40);
const clientes = [];
for (const m of miembros ?? []) {
  const { data: c } = await servicioH.from("clientes").select("telefono, nombre").eq("id", m.cliente_id).maybeSingle();
  if (c?.telefono) clientes.push({ ...m, telefono: c.telefono, nombre: c.nombre });
  if (clientes.length >= 2) break;
}
if (clientes.length < 2) throw new Error("Huellitas necesita dos clientes con cuenta (negocio-prueba-dev.mjs).");
const [C1, C2] = clientes;
console.log(`Huellitas ${H} · dueño ${C1.telefono} · quien la encuentra ${C2.telefono}`);
const REF = new globalThis.URL(URL).hostname.split(".")[0];
async function cookiesDe(profileId, dominio) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return galletas(`sb-${REF}-portal-auth-token`).map(([name, value]) => ({ name, value, domain: dominio, path: "/" }));
}
// Sus filas de dueño (la Fase 0 las creó por el puente; si no, se crean al entrar).
await A.from("duenos").upsert([{ id: C1.profile_id, updated_at: new Date().toISOString() }, { id: C2.profile_id, updated_at: new Date().toISOString() }], { onConflict: "id", ignoreDuplicates: true });
const LAT = 22.1565, LNG = -100.9855; // San Luis Potosí
const zonaC2 = (await A.from("duenos").select("lat, lng").eq("id", C2.profile_id).single()).data;
await A.from("duenos").update({ lat: LAT + 0.008, lng: LNG + 0.008 }).eq("id", C2.profile_id); // a ~1 km
const { data: sucursal } = await A.from("sucursales").select("id, lat, lng").eq("negocio_id", H).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
if (sucursal) await A.from("sucursales").update({ lat: LAT + 0.02, lng: LNG - 0.02 }).eq("id", sucursal.id);
const dir = path.join(os.tmpdir(), "peludesk-cartillas-prueba");
const [cartilla] = await generarCartillas(dir);
const fotoPerfil = path.join(dir, "perfil-prueba.jpg");
fs.writeFileSync(fotoPerfil, await sharp({ create: { width: 600, height: 600, channels: 3, background: "#a7d8c8" } }).jpeg().toBuffer());
let mascotaId = null;
const nombreMascota = `Prueba F1 ${sufijo}`;

const nav = await abrirNavegador();
try {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 800 } });
  await ctx.addCookies(await cookiesDe(C1.profile_id, "app.localhost"));
  await ctx.grantPermissions(["geolocation"], { origin: BASE_APP });
  await ctx.setGeolocation({ latitude: LAT, longitude: LNG });
  const p = await ctx.newPage();
  const ancho = async (nombre) => {
    const a = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
    if (a.s > a.w + 1) hallazgo(`${nombre} desborda a 390 px (${a.s} > ${a.w})`);
  };

  console.log("\n1. Alta de mascota con foto");
  await p.goto(`${BASE_APP}/`, { waitUntil: "networkidle" });
  if (!(await p.locator("[data-agregar-mascota]").count())) hallazgo("no está «Agregar mascota» en Mis mascotas");
  await p.goto(`${BASE_APP}/mascotas/nueva`, { waitUntil: "networkidle" });
  await ancho("/mascotas/nueva");
  await p.locator("[data-campo-nombre]").fill(nombreMascota);
  await p.locator('[data-especie="gato"]').click();
  await p.getByRole("button", { name: "Hembra" }).click();
  await p.locator('input[name="foto"]').setInputFiles(fotoPerfil);
  await p.locator("[data-guardar-mascota]").click();
  await p.waitForURL(/\/cartilla\/leer\?nueva=1/, { timeout: 30_000 }).catch(() => hallazgo(`tras guardar no cayó en leer la cartilla (${p.url()})`));
  mascotaId = /\/mascotas\/([0-9a-f-]{36})\//.exec(p.url())?.[1] ?? null;
  const { data: creada } = mascotaId ? await A.from("mascotas").select("nombre, especie, sexo, origen, foto_path, token_publico, dueno_id").eq("id", mascotaId).maybeSingle() : { data: null };
  if (!creada || creada.especie !== "gato" || creada.sexo !== "hembra" || creada.origen !== "app" || !creada.foto_path || !/^[A-Z0-9]{10}$/.test(creada.token_publico) || creada.dueno_id !== C1.profile_id) hallazgo(`la mascota no quedó bien: ${JSON.stringify(creada)}`);
  else bien("la mascota quedó con especie, sexo, foto propia y token público; la pantalla siguió a su cartilla");

  console.log("\n2. Leer la cartilla con foto (doble de la IA)");
  await p.locator("[data-foto-cartilla]").setInputFiles(cartilla.archivo);
  await p.locator("[data-leer-cartilla]").click();
  await p.locator("[data-paso-revisar]").waitFor({ timeout: 60_000 }).catch(() => hallazgo("no apareció el paso de revisar la lectura"));
  const filas = await p.locator("[data-fila-lectura]").count();
  if (filas !== 3) hallazgo(`la revisión enseña ${filas} filas (se esperaban 3)`);
  else bien("la lectura enseña 3 registros para revisar (una marcada como dudosa)");
  if (!(await p.locator('[data-fila-lectura][data-confianza="0.6"]').count())) hallazgo("la fila dudosa no viene marcada con su confianza");
  const peticionIA = mock.ia.at(-1);
  if (!peticionIA || !JSON.stringify(peticionIA).includes('"type":"image"') || peticionIA.tool_choice?.name !== "registrar_cartilla") hallazgo("la petición a la IA no llevó la imagen o la herramienta obligatoria");
  else bien("la IA recibió la imagen con la herramienta obligatoria registrar_cartilla");
  await ancho("revisar lectura");
  // Corregir una fila antes de confirmar: la próxima dosis de la antirrábica.
  await p.locator("[data-fila-lectura]").nth(1).locator('input[type="date"]').nth(1).fill(mas(12));
  await p.locator("[data-confirmar-lectura]").click();
  await p.waitForURL(/\/cartilla\?guardado=3/, { timeout: 30_000 }).catch(() => hallazgo(`confirmar no llevó a la cartilla con guardado=3 (${p.url()})`));
  const { data: registros } = await A.from("mascotas_cartilla").select("tipo, nombre, fuente, confianza, proxima_dosis, foto_id").eq("mascota_id", mascotaId).is("deleted_at", null);
  if ((registros ?? []).length !== 3 || !registros.every((r) => r.fuente === "foto" && r.foto_id) || !registros.some((r) => r.nombre === "Antirrábica" && r.proxima_dosis === mas(12))) hallazgo(`la cartilla no quedó como se confirmó: ${JSON.stringify(registros)}`);
  else bien("quedaron 3 registros con fuente «foto», ligados a la foto, con la corrección del dueño");
  const { data: foto } = await A.from("mascotas_cartilla_fotos").select("estado, ms, tokens_in, confirmada_at, registros").eq("mascota_id", mascotaId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!foto || foto.estado !== "leida" || !(foto.ms > 0) || !foto.confirmada_at || foto.registros !== 3) hallazgo(`la foto no quedó con su lectura, tiempo y confirmación: ${JSON.stringify(foto)}`);
  else bien(`la foto quedó registrada: leída en ${foto.ms} ms, ${foto.tokens_in} tokens, confirmada con 3 registros`);
  const { data: pesoIA } = await A.from("mascotas_pesos").select("peso_kg").eq("mascota_id", mascotaId);
  if (!(pesoIA ?? []).some((x) => Number(x.peso_kg) === 4.2)) hallazgo("el peso leído de la cartilla no se guardó");
  else bien("el peso que venía en la cartilla quedó anotado");
  const { data: recs } = await A.from("app_recordatorios").select("tipo, para_at, estado").eq("mascota_id", mascotaId).eq("estado", "pendiente");
  if ((recs ?? []).length < 4) hallazgo(`se esperaban al menos 4 recordatorios pendientes (7 días antes y el día de 2 próximas dosis): ${JSON.stringify(recs)}`);
  else bien(`${recs.length} recordatorios programados (una semana antes y el mismo día de cada próxima dosis)`);

  console.log("\n3. A mano, PDF, peso, medicamento, gasto, QR");
  await p.locator("[data-abrir-captura]").click();
  await p.locator("#cm-nombre").fill("Leucemia felina");
  await p.locator("#cm-aplicada").fill(mas(-10));
  await p.locator("#cm-proxima").fill(mas(355));
  await p.locator("[data-guardar-manual]").click();
  await p.getByText("Anotado.").waitFor({ timeout: 15_000 }).catch(() => hallazgo("la captura a mano no confirmó"));
  const { count: nReg } = await A.from("mascotas_cartilla").select("id", { count: "exact", head: true }).eq("mascota_id", mascotaId).is("deleted_at", null);
  if (nReg !== 4) hallazgo(`tras anotar a mano hay ${nReg} registros (se esperaban 4)`);
  else bien("la captura a mano agrega el cuarto registro");
  const pdf = await p.request.get(`${BASE_APP}/mascotas/${mascotaId}/cartilla/pdf`);
  const pdfCuerpo = await pdf.body();
  if (pdf.status() !== 200 || !/application\/pdf/.test(pdf.headers()["content-type"] ?? "") || pdfCuerpo.subarray(0, 4).toString() !== "%PDF") hallazgo(`el PDF de la cartilla respondió ${pdf.status()}`);
  else bien(`la cartilla en PDF se descarga (${pdfCuerpo.length} bytes)`);
  await p.goto(`${BASE_APP}/mascotas/${mascotaId}/seguimiento`, { waitUntil: "networkidle" });
  await ancho("/seguimiento");
  await p.locator("[data-anotar-peso]").click();
  await p.locator("#pp-kg").fill("4.6");
  await p.getByRole("button", { name: "Anotar peso" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("4.6 kg"), null, { timeout: 15_000 }).catch(() => hallazgo("el peso anotado no se pintó"));
  await p.locator("[data-anotar-medicamento]").click();
  await p.locator("#md-n").fill("Amoxicilina");
  await p.locator("#md-d").fill("1 ml");
  await p.locator("#md-f").fill(mas(5));
  await p.locator("[data-guardar-medicamento]").click();
  await p.locator("[data-medicamento]").waitFor({ timeout: 15_000 }).catch(() => hallazgo("el medicamento no se pintó"));
  const { count: nMed } = await A.from("app_recordatorios").select("id", { count: "exact", head: true }).eq("mascota_id", mascotaId).eq("tipo", "medicamento").eq("estado", "pendiente");
  if (!(nMed >= 4)) hallazgo(`el medicamento (6 días, una hora al día) programó ${nMed} recordatorios`);
  else bien(`el medicamento programó ${nMed} recordatorios a su hora`);
  await p.locator("[data-anotar-gasto]").click();
  await p.locator("#gs-c").fill("Croquetas");
  await p.locator("#gs-m").fill("350.50");
  await p.locator("[data-guardar-gasto]").click();
  await p.waitForFunction(() => /\$350\.50/.test(document.querySelector("[data-total-mes]")?.textContent ?? ""), null, { timeout: 15_000 }).catch(() => hallazgo("el total del mes no refleja el gasto"));
  const { data: total } = await sinNegocio(await tokenDe(C1.profile_id)).rpc("app_gastos_mes", { p_mascota: mascotaId, p_anio: Number(hoy.slice(0, 4)), p_mes: Number(hoy.slice(5, 7)) });
  if (Number((Array.isArray(total) ? total[0] : total)?.total) !== 350.5) hallazgo(`app_gastos_mes devolvió ${JSON.stringify(total)}`);
  else bien("peso, medicamento y gasto anotados; el total del mes sale de la base ($350.50)");
  await p.goto(`${BASE_APP}/mascotas/${mascotaId}/qr`, { waitUntil: "networkidle" });
  await p.locator("[data-qr]").waitFor({ timeout: 15_000 }).catch(() => hallazgo("el QR no se dibujó"));
  const srcQr = await p.locator("[data-qr]").getAttribute("src");
  if (!srcQr?.startsWith("data:image/png")) hallazgo("el QR no es un PNG");
  else bien("el QR de la placa se dibuja y se puede bajar");
  await ancho("/qr");
  await p.goto(`${BASE_APP}/mascotas/${mascotaId}`, { waitUntil: "networkidle" });
  if ((await p.locator("[data-toca]").count()) < 2) hallazgo("la ficha no enseña «lo que le toca»");
  else bien("la ficha enseña lo que le toca con su fecha");
  await ancho("ficha");

  console.log("\n4. Perfil público y mensajes relevados");
  const token = creada.token_publico;
  const publico = await nav.newContext({ viewport: { width: 390, height: 800 } });
  const q = await publico.newPage();
  const rPub = await q.goto(`${BASE_APP}/m/${token}`, { waitUntil: "networkidle" });
  if (rPub?.status() !== 200 || !(await q.getByText(nombreMascota).count())) hallazgo(`/m/<token> sin sesión respondió ${rPub?.status()}`);
  else bien("/m/<token> se abre sin sesión con la mascota");
  const rMal = await q.request.get(`${BASE_APP}/m/ZZZZZZZZZZ`);
  if (rMal.status() !== 404) hallazgo(`un token inexistente respondió ${rMal.status()}`);
  const cartel = await q.request.get(`${BASE_APP}/m/${token}/cartel`);
  if (cartel.status() !== 200 || !/image\/png/.test(cartel.headers()["content-type"] ?? "")) hallazgo(`el cartel respondió ${cartel.status()}`);
  else bien("el cartel se genera en PNG");
  await q.locator("#hl-texto").fill("La vi en el parque, está bien");
  await q.locator("#hl-wa").fill(C2.telefono);
  await q.locator("[data-mandar-mensaje]").click();
  await q.getByText("ya le avisamos a su familia").waitFor({ timeout: 20_000 }).catch(() => hallazgo("el mensaje desde la página no confirmó"));
  const { data: msgs1 } = await A.from("mascotas_mensajes").select("de, hallador_telefono, texto").eq("mascota_id", mascotaId);
  if (!(msgs1 ?? []).some((m) => m.de === "hallador" && m.hallador_telefono === C2.telefono)) hallazgo(`el mensaje no quedó con el teléfono de quien escribió: ${JSON.stringify(msgs1)}`);
  else bien("el mensaje desde la página quedó guardado (con el WhatsApp de quien escribió, solo en el servidor)");
  const { data: avisoMsg } = await A.from("app_avisos").select("id").eq("dueno_id", C1.profile_id).eq("tipo", "mensaje").eq("mascota_id", mascotaId);
  if (!(avisoMsg ?? []).length) hallazgo("al dueño no le llegó el aviso del mensaje");
  else bien("al dueño le llegó el aviso del mensaje");
  const rBot = await texto(C2.telefono, `encontré ${token}: la tengo conmigo`, "Vecina");
  if (!/Ya le avisamos/.test(rBot ?? "")) hallazgo(`«ENCONTRE <token>» por WhatsApp no se atendió: «${rBot}»`);
  else bien("«ENCONTRE <token>: …» por WhatsApp le avisa al dueño y contesta a quien escribió");
  await p.goto(`${BASE_APP}/mascotas/${mascotaId}/perdida`, { waitUntil: "networkidle" });
  if ((await p.locator('[data-mensaje="hallador"]').count()) < 2) hallazgo("el dueño no ve los dos mensajes de quien la encontró");
  else bien("el dueño ve los mensajes en su app (sin el teléfono de quien escribió)");
  const antesWa = mock.wa.length;
  await p.locator("#pd-resp").fill("¡Gracias! ¿Dónde te veo?");
  await p.locator("[data-responder]").click();
  await p.getByText("le llegó por WhatsApp").waitFor({ timeout: 20_000 }).catch(() => hallazgo("la respuesta del dueño no se entregó por WhatsApp (ventana abierta)"));
  const salida = mock.wa.slice(antesWa).find((m) => m.to === `52${C2.telefono}` && /te contesta/.test(m.text?.body ?? ""));
  if (!salida) hallazgo("la respuesta del dueño no salió por el bot al WhatsApp de quien escribió");
  else bien("la respuesta del dueño salió por el bot al WhatsApp de quien escribió (sin su teléfono)");
  await q.reload({ waitUntil: "networkidle" });
  await q.locator('[data-mensaje="dueno"]').first().waitFor({ timeout: 20_000 }).catch(() => hallazgo("quien escribió no ve la respuesta en la página pública"));
  if (await q.locator('[data-mensaje="dueno"]').count()) bien("quien escribió ve la respuesta en la misma página");
  const cuerpoPub = await q.content();
  if (cuerpoPub.includes(C1.telefono)) hallazgo("el perfil público enseña el teléfono del dueño");
  const { data: hiloC2 } = await sinNegocio(await tokenDe(C2.profile_id)).rpc("app_mensajes_de", { p_mascota: mascotaId });
  if ((hiloC2 ?? []).length) hallazgo("otro dueño lee el hilo de mensajes por app_mensajes_de");
  await publico.close();

  console.log("\n5. Mascota perdida");
  await p.goto(`${BASE_APP}/mascotas/${mascotaId}/perdida`, { waitUntil: "networkidle" });
  await ancho("/perdida");
  await p.locator("[data-ubicar-perdida]").click();
  await p.getByText("Ubicación lista").waitFor({ timeout: 15_000 }).catch(() => hallazgo("no tomó la ubicación"));
  await p.locator("#pd-nota").fill("Parque de prueba");
  const antesPerdida = mock.wa.length;
  await p.locator("[data-marcar-perdida]").click();
  await p.locator("[data-perdida-activa]").waitFor({ timeout: 30_000 }).catch(() => hallazgo("marcar perdida no cambió la pantalla"));
  const { data: perd } = await A.from("mascotas").select("perdida_at, perdida_lat, perdida_nota").eq("id", mascotaId).single();
  if (!perd?.perdida_at || perd.perdida_lat == null) hallazgo(`la mascota no quedó perdida con zona: ${JSON.stringify(perd)}`);
  else bien("quedó marcada como perdida con su zona y su nota");
  const { data: avisoC2 } = await A.from("app_avisos").select("id, titulo").eq("dueno_id", C2.profile_id).eq("tipo", "perdida").gte("created_at", new Date(Date.now() - 120_000).toISOString());
  if (!(avisoC2 ?? []).length) hallazgo("el dueño a 1 km no recibió el aviso de mascota perdida");
  else bien("el dueño de la app a 1 km recibió el aviso «Se perdió … cerca de ti»");
  const plantillaPerdida = mock.wa.slice(antesPerdida).find((m) => m.template?.name === "peludesk_mascota_perdida_v1");
  const { data: adminsH } = await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "admin").is("deleted_at", null);
  let adminConTelefono = false;
  for (const a of adminsH ?? []) { const { data: u } = await A.auth.admin.getUserById(a.profile_id); if (/@telefono\.ludogteka\.mx$/.test(u?.user?.email ?? "")) adminConTelefono = true; }
  if (sucursal && adminConTelefono && !plantillaPerdida) hallazgo("el negocio PeluDesk cerca no recibió la plantilla de mascota perdida");
  else bien(sucursal ? (adminConTelefono ? "el negocio PeluDesk cerca recibió la plantilla de mascota perdida" : "el negocio cerca se detectó (sus admins no tienen teléfono, así que no hay a quién mandarle)") : "Huellitas no tiene sucursal con ubicación: sin negocios cerca que avisar");
  const pubPerdida = await pedir(HOST_APP, `/m/${token}`);
  if (!/Su familia la está buscando/.test(pubPerdida.cuerpo.toString())) hallazgo("el perfil público no enseña que está perdida");
  else bien("el perfil público enseña el aviso de perdida");
  await p.locator("[data-marcar-encontrada]").click();
  await p.waitForFunction(() => !document.querySelector("[data-perdida-activa]"), null, { timeout: 20_000 }).catch(() => hallazgo("«¡Ya apareció!» no cerró la búsqueda"));
  const { data: enc } = await A.from("mascotas").select("encontrada_at").eq("id", mascotaId).single();
  if (!enc?.encontrada_at) hallazgo("no quedó encontrada_at");
  else bien("«¡Ya apareció!» la cierra y suma a la métrica pública");
  const entrarPub = await pedir(HOST_APP, "/entrar");
  if (!/data-encontradas/.test(entrarPub.cuerpo.toString())) hallazgo("/entrar no enseña la métrica de encontradas");

  console.log("\n6. Cron de recordatorios y botón «Agendar»");
  const { data: recVac } = await A.from("app_recordatorios").select("id").eq("mascota_id", mascotaId).eq("tipo", "vacuna").eq("estado", "pendiente").order("para_at").limit(1).single();
  await A.from("app_recordatorios").update({ para_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", recVac.id);
  const antesCron = mock.wa.length;
  const cron = await pedir(HOST_PLAT, "/api/cron/app-recordatorios", { headers: { authorization: "Bearer mock-cron" } });
  const resCron = JSON.parse(cron.cuerpo.toString());
  const { data: recTras } = await A.from("app_recordatorios").select("estado, wa_estado, push_enviadas").eq("id", recVac.id).single();
  const plantillaRec = mock.wa.slice(antesCron).find((m) => m.to === `52${C1.telefono}` && m.template?.name === "peludesk_rec_vacuna_v2");
  if (cron.status !== 200 || recTras?.estado !== "enviado" || recTras.wa_estado !== "enviado" || !plantillaRec) hallazgo(`el cron no mandó el recordatorio: ${cron.status} ${JSON.stringify(resCron)} ${JSON.stringify(recTras)}`);
  else bien(`el cron mandó el recordatorio vencido: aviso, push (${recTras.push_enviadas} suscripciones) y plantilla de vacuna por WhatsApp`);
  const { data: avisoRec } = await A.from("app_avisos").select("id").eq("dueno_id", C1.profile_id).eq("tipo", "recordatorio").eq("mascota_id", mascotaId);
  if (!(avisoRec ?? []).length) hallazgo("el recordatorio no quedó en Avisos");
  const payload = plantillaRec?.template?.components?.find((c) => c.type === "button")?.parameters?.[0]?.payload ?? `app:${recVac.id}:agendar`;
  const rBoton = await boton(C1.telefono, payload);
  if (!/\/cita/.test(rBoton ?? "")) hallazgo(`el botón Agendar no contestó con la liga de la cita: «${rBoton}»`);
  else bien("el botón «Agendar» contesta con la liga para pedir la cita");
  const cronSin = await pedir(HOST_PLAT, "/api/cron/app-recordatorios");
  if (cronSin.status !== 401) hallazgo(`el cron sin secreto respondió ${cronSin.status}`);
  await p.goto(`${BASE_APP}/mascotas/${mascotaId}/cita`, { waitUntil: "networkidle" });
  await ancho("/cita");
  if (!(await p.getByText(/Ver veterinarias cerca|Pedir cita por WhatsApp|Abrir su portal/).count())) hallazgo("la pantalla de cita no ofrece un camino");
  else bien("la pantalla «Pedir cita» ofrece un camino");

  console.log("\n7. RLS y funciones");
  const c2 = sinNegocio(await tokenDe(C2.profile_id));
  for (const t of ["mascotas_cartilla", "mascotas_cartilla_fotos", "mascotas_pesos", "mascotas_medicamentos", "mascotas_gastos", "app_recordatorios"]) {
    const { data } = await c2.from(t).select("id").eq("mascota_id", mascotaId);
    if ((data ?? []).length) hallazgo(`otro dueño ve ${t} de esta mascota`);
    const { data: an } = await anonimo.from(t).select("id").limit(1);
    if ((an ?? []).length) hallazgo(`el anónimo ve ${t}`);
  }
  const { error: eMsgTabla } = await c2.from("mascotas_mensajes").select("id").limit(1);
  const { data: dMsgTabla } = await c2.from("mascotas_mensajes").select("id").limit(1);
  if (!eMsgTabla && (dMsgTabla ?? []).length) hallazgo("un dueño lee mascotas_mensajes directo (con el teléfono de quien escribió)");
  const { error: eIns } = await c2.from("mascotas_cartilla").insert({ mascota_id: mascotaId, tipo: "vacuna", nombre: "intrusa", updated_at: new Date().toISOString() });
  if (!eIns) hallazgo("otro dueño pudo escribir en la cartilla de esta mascota");
  for (const [fn, args] of [["app_mascota_publica", { p_token: token }], ["app_duenos_cerca", { p_lat: LAT, p_lng: LNG, p_km: 5, p_excluir: C1.profile_id }], ["app_negocios_cerca", { p_lat: LAT, p_lng: LNG, p_km: 15 }]]) {
    const r1 = await c2.rpc(fn, args);
    const r2 = await anonimo.rpc(fn, args);
    if (!r1.error || !r2.error) hallazgo(`${fn} la ejecuta un dueño o el anónimo`);
  }
  bien("otro dueño y el anónimo no alcanzan la cartilla, pesos, medicamentos, gastos, recordatorios ni mensajes; las funciones de servidor no las ejecuta nadie más");
  await ctx.close();
} finally {
  await nav.close();
  doble.close();
  if (mascotaId) await A.from("mascotas").delete().eq("id", mascotaId);
  await A.from("app_avisos").delete().eq("dueno_id", C2.profile_id).eq("tipo", "perdida").gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  await A.from("app_avisos").delete().eq("dueno_id", C1.profile_id).in("tipo", ["mensaje", "recordatorio", "bienvenida"]).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  await A.from("duenos").update({ lat: zonaC2?.lat ?? null, lng: zonaC2?.lng ?? null }).eq("id", C2.profile_id);
  if (sucursal) await A.from("sucursales").update({ lat: sucursal.lat, lng: sucursal.lng }).eq("id", sucursal.id);
  if (C1.profile_id && mascotaId) {
    const { data: restos } = await A.storage.from("app-mascotas").list(`${C1.profile_id}/${mascotaId}/cartilla`);
    if (restos?.length) await A.storage.from("app-mascotas").remove(restos.map((f) => `${C1.profile_id}/${mascotaId}/cartilla/${f.name}`));
    const { data: restos2 } = await A.storage.from("app-mascotas").list(`${C1.profile_id}/${mascotaId}/perfil`);
    if (restos2?.length) await A.storage.from("app-mascotas").remove(restos2.map((f) => `${C1.profile_id}/${mascotaId}/perfil/${f.name}`));
  }
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ App para dueños · Fase 1: todo en orden.");
process.exit(hallazgos.length ? 1 : 0);
