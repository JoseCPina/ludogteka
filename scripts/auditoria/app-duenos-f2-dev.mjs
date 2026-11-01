// App para dueños · Fase 2 (SOLO DESARROLLO). docs/app-duenos/FASE-2.md
//
// Con el servidor compilado y prendido apuntando a los dobles de este script (puerto 4456: Graph de WhatsApp):
//
//   WHATSAPP_GRAPH_URL=http://127.0.0.1:4456 WHATSAPP_TOKEN=wa-prueba WHATSAPP_PHONE_NUMBER_ID=PHONE_PRUEBA \
//   WHATSAPP_APP_SECRET=secreto-app-prueba PELUDESK_WHATSAPP=5215512345678 PELUDESK_WABA_ID=WABA_PRUEBA \
//   CRON_SECRET=mock-cron PELUDESK_SITIO_URL=http://plataforma.localhost:3001 \
//   npm run start -- -p 3001          (después de npm run build)
//
//   node scripts/auditoria/app-duenos-f2-dev.mjs
//
// Un cliente de Huellitas (C1) es el dueño de tres mascotas de prueba; un negocio SIN PeluDesk (un teléfono sin
// sesión) escanea sus QR:
//   1. Escaneo: el perfil público ofrece «Registrar atención»; el formulario enseña nombre, especie, raza y cartilla y
//      NADA de la familia (ni en la página ni en la respuesta de la acción); el escaneo queda contado.
//   2. Veterinaria (vacuna con lote y próxima dosis, peso, nota, firma), estética (servicio y próxima cita) y hotel
//      (fechas): cada uno queda en app_atenciones, la cartilla (fuente qr) y los pesos; al dueño le llega el aviso.
//   3. Al tercer registro, la oferta «Ya registraste 3 pacientes aquí…».
//   4. Edición: el mismo teléfono corrige dentro de 24 h; otro teléfono no ve cómo; pasadas las 24 h se rechaza.
//   5. Dueño: la ficha enseña «Lo que registraron los negocios», la cartilla nombra al negocio; ocultar quita el
//      registro de la cartilla sin borrarlo y volver a mostrar lo regresa.
//   6. Recordatorio firmado: el cron manda la plantilla de vacuna con el nombre del negocio y «Agendar» contesta con su
//      WhatsApp; la cita sugerida (plantilla aún sin aprobar en el doble) sale solo por push y Avisos.
//   7. Reclamo: «Abrir mi cuenta gratis» da un código; «RECLAMO <código>» desde el WhatsApp del negocio por el webhook
//      lo verifica; el registro abre la prueba con «Pacientes del QR de PeluDesk» (WhatsApp del negocio, sin datos de
//      las familias), sus 3 mascotas y las notas clínicas. La métrica de /plataforma/app-duenos lo pone «En prueba».
//   8. Límites: 6 por mascota al día y 30 por número al día.
//   9. RLS: el anónimo y otro dueño no leen app_atenciones ni app_qr_escaneos, ni la función del dueño de otra mascota.
//  10. Celular (390 px) sin desbordes.
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { claveAleatoria } from "../lib/clave.mjs";
import { limpiarAlTerminar } from "../lib/limpieza-dev.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
limpiarAlTerminar({ prefijos: ["qrf2-prueba-"], bitacoras: ["aceptaciones_legales"] });
const PUERTO = Number(process.env.PUERTO_APP ?? 3001);
const HOST_APP = `app.localhost:${PUERTO}`;
const BASE_APP = `http://${HOST_APP}`;
const HOST_PLAT = `plataforma.localhost:${PUERTO}`;
const PLATAFORMA = `http://${HOST_PLAT}`;
const PHONE_ID = "PHONE_PRUEBA";
const APP_SECRET = "secreto-app-prueba";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const ok = (cond, t, detalle = "") => (cond ? bien(t) : hallazgo(`${t}${detalle ? ` — ${detalle}` : ""}`));
const sufijo = String(Date.now()).slice(-7);
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
const mas = (d) => new Date(Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10) + d)).toISOString().slice(0, 10);
const TEL_NEG = `56${sufijo}9`.padEnd(10, "1").slice(0, 10);
const TEL_LIM = `56${sufijo}8`.padEnd(10, "2").slice(0, 10);
const NOMBRE_NEG = `Qrf2 prueba ${sufijo}`;

// ── Doble de Graph: guarda lo mandado; la plantilla de vacuna aprobada, la de cita sugerida pendiente ──
const mock = { wa: [] };
const doble = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const json = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.method === "POST" && /\/messages$/.test(req.url ?? "")) {
    try { mock.wa.push(JSON.parse(cuerpo)); } catch { /* vacío */ }
    return json(200, { messages: [{ id: `wamid.${randomUUID()}` }] });
  }
  if (/message_templates/.test(req.url ?? "")) return json(200, { data: [{ name: "peludesk_rec_vacuna_v2", status: "APPROVED", category: "UTILITY" }, { name: "peludesk_cita_sugerida_v1", status: "PENDING", category: "UTILITY" }] });
  return json(200, {});
});
await new Promise((r) => doble.listen(4456, "127.0.0.1", r));

function pedir(host, ruta, { method = "GET", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method, headers: { host, ...(body ? { "content-type": "application/json" } : {}), ...headers } }, (res) => {
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
async function alBot(telefono10, texto) {
  const cuerpo = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: PHONE_ID, display_phone_number: "525649160742" }, contacts: [{ wa_id: `521${telefono10}` }], messages: [{ from: `521${telefono10}`, id: `wamid.${randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), ...texto }] } }] }],
  });
  const antes = mock.wa.length;
  const r = await pedir(HOST_PLAT, "/api/whatsapp/webhook", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": firmar(cuerpo) } });
  if (r.status !== 200) throw new Error(`webhook ${r.status}: ${r.cuerpo.toString().slice(0, 200)}`);
  for (let i = 0; i < 60; i++) {
    const nuevas = mock.wa.slice(antes).filter((m) => m.to === `52${telefono10}` && m.type === "text");
    if (nuevas.length) return nuevas[0].text?.body ?? "";
    await new Promise((x) => setTimeout(x, 500));
  }
  return null;
}

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
await A.from("duenos").upsert([{ id: C1.profile_id, updated_at: new Date().toISOString() }, { id: C2.profile_id, updated_at: new Date().toISOString() }], { onConflict: "id", ignoreDuplicates: true });
const { data: duenoC1 } = await A.from("duenos").select("nombre, telefono").eq("id", C1.profile_id).single();
const REF = new globalThis.URL(URL).hostname.split(".")[0];
async function sesionDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  return valor.match(/.{1,3180}/g);
}
const galletas = (trozos, nombre, dominio) => (trozos.length === 1 ? [[nombre, trozos[0]]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: dominio, path: "/" }));

const mascotas = [];
for (const [i, [nombre, especie, raza]] of [["Bruno", "perro", "Schnauzer"], ["Luna", "perro", "Poodle"], ["Michi", "gato", "Siamés"]].entries()) {
  const { data, error } = await A.from("mascotas").insert({ dueno_id: C1.profile_id, nombre: `${nombre} F2 ${sufijo}`, especie, raza_texto: raza, origen: "app", updated_at: new Date().toISOString() }).select("id, nombre, token_publico").single();
  if (error) throw new Error(`mascota ${i}: ${error.message}`);
  mascotas.push(data);
}
const [M1, M2, M3] = mascotas;
// Una vacuna previa en la cartilla de M1: el negocio la tiene que ver.
await A.from("mascotas_cartilla").insert({ mascota_id: M1.id, tipo: "vacuna", nombre: "Múltiple (séxtuple)", fecha_aplicacion: mas(-200), proxima_dosis: mas(165), fuente: "manual", updated_at: new Date().toISOString() });
console.log(`Huellitas ${H} · dueño ${C1.telefono} · mascotas ${mascotas.map((m) => m.token_publico).join(", ")} · negocio ${TEL_NEG}`);

let prospectoId = null;
const nav = await abrirNavegador();
try {
  const ctxNeg = await nav.newContext({ viewport: { width: 390, height: 860 } });
  const p = await ctxNeg.newPage();
  const respuestasAccion = [];
  p.on("response", async (r) => {
    if (r.request().method() === "POST" && /\/m\/[A-Z0-9]{10}\/registrar/.test(r.url())) respuestasAccion.push(await r.text().catch(() => ""));
  });
  const ancho = async (pg, nombre) => {
    const a = await pg.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
    if (a.s > a.w + 1) hallazgo(`${nombre} desborda a 390 px (${a.s} > ${a.w})`);
  };
  const firmarConDedo = async () => {
    await p.locator("[data-firma]").scrollIntoViewIfNeeded();
    const caja = await p.locator("[data-firma]").boundingBox();
    await p.mouse.move(caja.x + 30, caja.y + caja.height / 2);
    await p.mouse.down();
    for (let k = 1; k <= 12; k++) await p.mouse.move(caja.x + 30 + k * 20, caja.y + caja.height / 2 + (k % 2 ? 15 : -15));
    await p.mouse.up();
  };
  const llenarNegocio = async () => {
    await p.locator('input[name="negocio_nombre"]').fill(NOMBRE_NEG);
    await p.locator('input[name="negocio_whatsapp"]').fill(TEL_NEG);
  };
  const guardar = async () => {
    await p.locator("[data-guardar-atencion]").click();
    return p.locator("[data-atencion-guardada]").waitFor({ timeout: 30_000 }).then(() => true).catch(async () => {
      const err = await p.locator("[data-error-atencion]").innerText().catch(() => "");
      hallazgo(`no se guardó la atención (${err || "sin mensaje"})`);
      return false;
    });
  };

  console.log("\n1. Escaneo y lo que ve el negocio");
  const pub = await pedir(HOST_APP, `/m/${M1.token_publico}`);
  ok(/data-registrar-atencion/.test(pub.cuerpo.toString()) && pub.cuerpo.toString().includes(`/m/${M1.token_publico}/registrar`), "el perfil público ofrece «Registrar atención»");
  const t0 = Date.now();
  await p.goto(`${BASE_APP}/m/${M1.token_publico}/registrar`, { waitUntil: "networkidle" });
  const html = await p.content();
  ok(html.includes(M1.nombre) && /Perro · Schnauzer/.test(await p.locator("[data-mascota-negocio]").innerText()) && /Múltiple/.test(await p.locator("[data-cartilla-negocio]").innerText()), "el formulario enseña el nombre, la especie, la raza y la cartilla");
  const prohibidos = [C1.telefono, duenoC1?.telefono, duenoC1?.nombre, C1.nombre].filter((x) => x && String(x).length > 3);
  ok(!prohibidos.some((x) => html.includes(String(x))), "la página no trae nada de la familia (nombre ni teléfono)");
  await ancho(p, "/m/<token>/registrar");
  const { data: esc } = await A.from("app_qr_escaneos").select("id").eq("mascota_id", M1.id);
  ok((esc ?? []).length === 1, "el escaneo quedó contado");

  console.log("\n2. Veterinaria, estética y hotel");
  await p.locator('[data-giro="veterinaria"]').click();
  await p.locator('[data-agregar-vacuna="Antirrábica"]').click();
  await p.locator('input[name="lote-0"]').fill(`LOT${sufijo}`);
  await p.locator('input[name="proxima-0"]').fill(mas(5));
  await p.locator('input[name="peso"]').fill("8.4");
  await p.locator('input[name="nota"]').fill("Se portó tranquilo");
  await llenarNegocio();
  await p.locator("[data-guardar-atencion]").click();
  ok(/Falta la firma/.test(await p.locator("[data-error-atencion]").innerText({ timeout: 10_000 }).catch(() => "")), "sin firma, guardar dice que falta la firma");
  await firmarConDedo();
  if (await guardar()) {
    bien(`la vet registró en ${((Date.now() - t0) / 1000).toFixed(1)} s (con el navegador automático)`);
    const { data: at } = await A.from("app_atenciones").select("id, prospecto_id, giro, datos, peso_kg, firma_path, escaneo_id").eq("mascota_id", M1.id).single();
    prospectoId = at?.prospecto_id ?? null;
    const { data: cart } = await A.from("mascotas_cartilla").select("id, nombre, lote, proxima_dosis, fuente").eq("atencion_id", at?.id).is("deleted_at", null);
    const { data: peso } = await A.from("mascotas_pesos").select("peso_kg").eq("atencion_id", at?.id).is("deleted_at", null);
    ok(at?.giro === "veterinaria" && at.escaneo_id && /^atenciones\//.test(at.firma_path), "la atención quedó con su escaneo y su firma");
    ok(cart?.length === 1 && cart[0].fuente === "qr" && cart[0].lote === `LOT${sufijo}` && cart[0].proxima_dosis === mas(5), "la vacuna entró a la cartilla (fuente qr, lote y próxima dosis)");
    ok(Number(peso?.[0]?.peso_kg) === 8.4, "el peso entró a su historial");
    const { data: av } = await A.from("app_avisos").select("titulo").eq("dueno_id", C1.profile_id).eq("tipo", "registro").eq("mascota_id", M1.id);
    ok((av ?? []).some((a) => a.titulo.includes(NOMBRE_NEG)), "al dueño le llegó el aviso con el nombre del negocio");
    const { data: rec } = await A.from("app_recordatorios").select("cuerpo").eq("mascota_id", M1.id).eq("ref_id", cart?.[0]?.id).eq("estado", "pendiente");
    ok((rec ?? []).some((r) => r.cuerpo.includes(`De parte de ${NOMBRE_NEG}`)), "el recordatorio de la próxima dosis va firmado por el negocio");
    const { data: pr } = await A.from("prospectos").select("fuente, telefono_norm, nombre").eq("id", prospectoId).maybeSingle();
    ok(pr?.fuente === "qr" && String(pr.telefono_norm ?? "").endsWith(TEL_NEG), "el negocio quedó como prospecto por reclamar (fuente qr, con su WhatsApp)");
    ok(!(await p.locator("[data-oferta-cuenta]").count()), "con un registro todavía no hay oferta");
  }

  await p.goto(`${BASE_APP}/m/${M2.token_publico}/registrar`, { waitUntil: "networkidle" });
  ok((await p.locator('input[name="negocio_nombre"]').count()) === 1 && (await p.locator('input[name="negocio_nombre"]').inputValue()) === NOMBRE_NEG, "el teléfono recuerda el negocio para el siguiente paciente");
  await p.locator('[data-giro="estetica"]').click();
  await p.locator('input[name="servicio"]').fill("Baño y corte");
  await p.locator('[data-proxima-cita="14"]').click();
  await firmarConDedo();
  if (await guardar()) {
    const { data: at2 } = await A.from("app_atenciones").select("id, datos, prospecto_id").eq("mascota_id", M2.id).single();
    ok(at2?.datos?.servicio === "Baño y corte" && at2.datos.proxima_cita === mas(14) && at2.prospecto_id === prospectoId, "la estética quedó con su servicio, la próxima cita y el mismo negocio");
    const { data: recCita } = await A.from("app_recordatorios").select("id, cuerpo").eq("ref_id", at2?.id).eq("tipo", "cita_sugerida").eq("estado", "pendiente");
    ok((recCita ?? []).length === 2 && recCita.every((r) => r.cuerpo.includes(NOMBRE_NEG)), "la próxima cita sugerida tiene sus 2 recordatorios firmados (3 días antes y el día)");
  }

  await p.goto(`${BASE_APP}/m/${M3.token_publico}/registrar`, { waitUntil: "networkidle" });
  await p.locator('[data-giro="hotel"]').click();
  await p.locator('input[name="entrada"]').fill(mas(-3));
  await p.locator('input[name="salida"]').fill(hoy);
  await firmarConDedo();
  if (await guardar()) {
    const { data: at3 } = await A.from("app_atenciones").select("datos").eq("mascota_id", M3.id).single();
    ok(at3?.datos?.entrada === mas(-3) && at3.datos.salida === hoy, "el hotel quedó con las fechas de la estancia");
    console.log("\n3. Oferta al tercer registro");
    const oferta = await p.locator("[data-oferta-cuenta]").innerText().catch(() => "");
    ok(/Ya registraste 3 pacientes aquí; abre tu cuenta gratis y quédate con su expediente/.test(oferta), "la oferta sale al tercer registro con su texto", oferta.slice(0, 120));
  }
  await ancho(p, "registro guardado");
  ok(!respuestasAccion.some((t) => prohibidos.some((x) => t.includes(String(x)))) && respuestasAccion.length >= 3, `las respuestas de las acciones (${respuestasAccion.length}) no traen nada de la familia`);

  console.log("\n4. Edición");
  await p.goto(`${BASE_APP}/m/${M1.token_publico}/registrar`, { waitUntil: "networkidle" });
  const botonEditar = p.locator("[data-editar-atencion]").first();
  if (!(await botonEditar.count())) hallazgo("el mismo teléfono no ve «Corregir» de su registro");
  else {
    await botonEditar.click();
    await p.locator("[data-editando]").waitFor({ timeout: 20_000 });
    await p.locator('input[name="nota"]').fill("Se portó tranquilo; pesó 8.6");
    await p.locator('input[name="peso"]').fill("8.6");
    if (await guardar()) {
      const { data: ed } = await A.from("app_atenciones").select("id, nota, peso_kg, editado_at, historial").eq("mascota_id", M1.id).single();
      const { data: pesoEd } = await A.from("mascotas_pesos").select("peso_kg").eq("atencion_id", ed?.id).is("deleted_at", null);
      ok(ed?.editado_at && /8\.6/.test(ed.nota) && (ed.historial ?? []).length === 1 && pesoEd?.length === 1 && Number(pesoEd[0].peso_kg) === 8.6, "el mismo teléfono corrigió dentro de 24 h (historial guardado, el peso se reemplazó)", JSON.stringify({ ed, pesoEd }));
    }
  }
  const ctxOtro = await nav.newContext({ viewport: { width: 390, height: 860 } });
  const pOtro = await ctxOtro.newPage();
  await pOtro.goto(`${BASE_APP}/m/${M1.token_publico}/registrar`, { waitUntil: "networkidle" });
  ok(!(await pOtro.locator("[data-editar-atencion]").count()), "otro teléfono no tiene cómo corregir el registro");
  await ctxOtro.close();
  const { data: at2b } = await A.from("app_atenciones").select("id").eq("mascota_id", M2.id).single();
  await A.from("app_atenciones").update({ editable_hasta: new Date(Date.now() - 60_000).toISOString() }).eq("id", at2b.id);
  await p.goto(`${BASE_APP}/m/${M2.token_publico}/registrar`, { waitUntil: "networkidle" });
  if (await p.locator("[data-editar-atencion]").count()) {
    await p.locator("[data-editar-atencion]").first().click();
    const msg = await p.locator("[data-error-atencion]").innerText({ timeout: 15_000 }).catch(() => "");
    ok(/Ya pasaron 24 horas/.test(msg), "pasadas las 24 horas, corregir se rechaza", msg);
  } else hallazgo("no apareció el registro de la estética para intentar corregirlo");

  console.log("\n5. Lo que ve el dueño");
  const ctxDueno = await nav.newContext({ viewport: { width: 390, height: 860 } });
  await ctxDueno.addCookies(galletas(await sesionDe(C1.profile_id), `sb-${REF}-portal-auth-token`, "app.localhost"));
  const d = await ctxDueno.newPage();
  await d.goto(`${BASE_APP}/mascotas/${M1.id}`, { waitUntil: "networkidle" });
  const seccion = await d.locator("[data-atenciones-negocios]").innerText().catch(() => "");
  ok(seccion.includes(NOMBRE_NEG) && /Antirrábica/.test(seccion), "la ficha enseña «Lo que registraron los negocios» con el negocio y la vacuna");
  await ancho(d, "/mascotas/<id> con atenciones");
  await d.goto(`${BASE_APP}/mascotas/${M1.id}/cartilla`, { waitUntil: "networkidle" });
  ok((await d.getByText(`lo registró ${NOMBRE_NEG} con el QR`).count()) >= 1, "la cartilla dice qué negocio registró la vacuna");
  await d.goto(`${BASE_APP}/mascotas/${M1.id}`, { waitUntil: "networkidle" });
  const { data: at1 } = await A.from("app_atenciones").select("id").eq("mascota_id", M1.id).single();
  await d.locator(`[data-ocultar-atencion="${at1.id}"]`).click();
  await d.locator(`[data-atencion="${at1.id}"][data-oculta="si"]`).waitFor({ timeout: 20_000 }).catch(() => hallazgo("la pantalla no pintó el registro como oculto"));
  const { data: oc } = await A.from("app_atenciones").select("oculto_at, deleted_at").eq("id", at1.id).single();
  const { data: cartOc } = await A.from("mascotas_cartilla").select("id").eq("atencion_id", at1.id).is("deleted_at", null);
  ok(oc?.oculto_at && !oc.deleted_at && !(cartOc ?? []).length, "ocultar quita el registro de la cartilla sin borrarlo");
  await d.locator(`[data-ocultar-atencion="${at1.id}"]`).click();
  await d.locator(`[data-atencion="${at1.id}"][data-oculta="no"]`).waitFor({ timeout: 20_000 }).catch(() => hallazgo("la pantalla no pintó el registro como visible"));
  const { data: cartVis } = await A.from("mascotas_cartilla").select("id").eq("atencion_id", at1.id).is("deleted_at", null);
  ok((cartVis ?? []).length === 1, "volver a mostrar lo regresa a la cartilla");

  console.log("\n6. Recordatorio firmado y cita sugerida");
  const { data: cartFinal } = await A.from("mascotas_cartilla").select("id").eq("atencion_id", at1.id).is("deleted_at", null).single();
  const { data: recVac } = await A.from("app_recordatorios").select("id").eq("ref_id", cartFinal.id).eq("estado", "pendiente").order("para_at").limit(1).single();
  const { data: recCita } = await A.from("app_recordatorios").select("id").eq("ref_id", at2b.id).eq("tipo", "cita_sugerida").eq("estado", "pendiente").order("para_at").limit(1).single();
  await A.from("app_recordatorios").update({ para_at: new Date(Date.now() - 60_000).toISOString() }).in("id", [recVac.id, recCita.id]);
  const antesCron = mock.wa.length;
  const cron = await pedir(HOST_PLAT, "/api/cron/app-recordatorios", { headers: { authorization: "Bearer mock-cron" } });
  const { data: tras } = await A.from("app_recordatorios").select("id, estado, wa_estado").in("id", [recVac.id, recCita.id]);
  const trasVac = tras?.find((r) => r.id === recVac.id);
  const trasCita = tras?.find((r) => r.id === recCita.id);
  const plantilla = mock.wa.slice(antesCron).find((m) => m.to === `52${C1.telefono}` && m.template?.name === "peludesk_rec_vacuna_v2");
  const params = plantilla?.template?.components?.find((c) => c.type === "body")?.parameters?.map((x) => x.text) ?? [];
  ok(cron.status === 200 && trasVac?.wa_estado === "enviado" && params.includes(NOMBRE_NEG), "el recordatorio de la vacuna salió por WhatsApp firmado por el negocio", JSON.stringify({ s: cron.status, trasVac, params }));
  ok(trasCita?.estado === "enviado" && trasCita.wa_estado === "plantilla_no_aprobada" && !mock.wa.slice(antesCron).some((m) => m.template?.name === "peludesk_cita_sugerida_v1"), "con la plantilla de cita sin aprobar, la cita sugerida sale solo por push y Avisos", JSON.stringify(trasCita));
  const { data: avCita } = await A.from("app_avisos").select("cuerpo").eq("dueno_id", C1.profile_id).eq("tipo", "recordatorio").eq("mascota_id", M2.id);
  ok((avCita ?? []).some((a) => a.cuerpo.includes(NOMBRE_NEG)), "el aviso de la cita sugerida dice qué negocio la sugirió");
  const payload = plantilla?.template?.components?.find((c) => c.type === "button")?.parameters?.[0]?.payload ?? `app:${recVac.id}:agendar`;
  const rBoton = await alBot(C1.telefono, { type: "button", button: { payload, text: "Agendar" } });
  ok((rBoton ?? "").includes(`wa.me/52${TEL_NEG}`) && (rBoton ?? "").includes(NOMBRE_NEG), "«Agendar» contesta con el WhatsApp del negocio que la registró", rBoton ?? "sin respuesta");

  console.log("\n7. Reclamo y prueba con los pacientes precargados");
  await p.goto(`${BASE_APP}/m/${M3.token_publico}/registrar`, { waitUntil: "networkidle" });
  // El cuarto registro (M3 otra vez) vuelve a enseñar la oferta.
  await p.locator('[data-giro="veterinaria"]').click();
  await p.locator("[data-agregar-desparasitacion]").click();
  await firmarConDedo();
  if (await guardar()) {
    await p.locator("[data-pedir-cuenta]").click();
    const codigo = await p.locator("[data-codigo-reclamo]").innerText({ timeout: 20_000 }).catch(() => "");
    ok(/^[A-Z0-9]{6}$/.test(codigo.trim()), "«Abrir mi cuenta gratis» da un código para mandar por WhatsApp", codigo);
    await alBot(TEL_NEG, { type: "text", text: { body: `RECLAMO ${codigo.trim()}` } });
    const abrir = p.locator("[data-abrir-registro]");
    await abrir.waitFor({ timeout: 20_000 }).catch(() => hallazgo("la pantalla no detectó el código verificado"));
    const href = (await abrir.getAttribute("href").catch(() => null)) ?? "";
    ok(href.startsWith(`${PLATAFORMA}/registro?`) && /reclamo=/.test(href) && /utm_source=app_duenos/.test(href), "«Abrir mi cuenta» lleva al registro con el reclamo", href);
    if (href) {
      await p.goto(href, { waitUntil: "load" });
      ok((await p.inputValue("input[name=negocio]")) === NOMBRE_NEG && (await p.inputValue("input[name=telefono]")) === TEL_NEG, "el registro viene con el nombre y el WhatsApp del negocio");
      await p.fill("input[name=nombre]", "Prueba Auditoría QR");
      if (!(await p.inputValue("input[name=ciudad]"))) await p.fill("input[name=ciudad]", "San Luis Potosí");
      await p.fill("input[name=password]", claveAleatoria());
      if (!(await p.isChecked("input[name=servicios][value=estetica]"))) await p.check("input[name=servicios][value=estetica]");
      await p.check("input[name=acepto]");
      await p.getByRole("button", { name: /Abrir mi negocio/ }).first().click();
      await p.waitForURL(/bienvenida|login|auth\/entrar/, { timeout: 90_000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 3000));
      const { data: neg } = await A.from("negocios").select("id, slug, plan").like("slug", `qrf2-prueba-${sufijo}%`).is("deleted_at", null).maybeSingle();
      ok(neg?.plan === "prueba", `el negocio abrió su prueba (${neg?.slug ?? "no se creó"})`);
      if (neg) {
        const { data: cli } = await A.from("clientes").select("id, nombre, telefono").eq("negocio_id", neg.id).eq("nombre", "Pacientes del QR de PeluDesk").is("deleted_at", null);
        ok(cli?.length === 1 && cli[0].telefono === TEL_NEG, "entró el cliente «Pacientes del QR de PeluDesk» con el WhatsApp del propio negocio");
        const { data: perros } = await A.from("perros").select("id, nombre, especie, raza").eq("negocio_id", neg.id).eq("cliente_id", cli?.[0]?.id ?? randomUUID()).is("deleted_at", null);
        ok((perros ?? []).length === 3 && mascotas.every((m) => perros.some((x) => x.nombre === m.nombre)), `entraron sus 3 pacientes (${(perros ?? []).length})`);
        // Con Veterinaria: la nota clínica de cada mascota; sin ella: la nota interna del cliente, un bloque por mascota.
        const { data: vetMod } = await A.from("negocio_modulos").select("id").eq("negocio_id", neg.id).eq("modulo", "veterinaria").eq("activo", true).is("deleted_at", null).maybeSingle();
        let nota = "";
        if (vetMod) {
          // La precarga corre al terminar el registro: se espera a que termine (hasta 20 s).
          let notas = [];
          for (let k = 0; k < 20 && notas.length < 3; k++) {
            notas = (await A.from("perros_notas_clinicas").select("notas").eq("negocio_id", neg.id)).data ?? [];
            if (notas.length < 3) await new Promise((x) => setTimeout(x, 1000));
          }
          nota = (notas ?? []).map((n) => n.notas).join(" | ");
          ok((notas ?? []).length === 3 && /Antirrábica/.test(nota) && /Baño y corte/.test(nota), "con Veterinaria, cada paciente trae su nota clínica con lo registrado", JSON.stringify({ n: notas.length, perros: (perros ?? []).map((x) => x.id), pnc: (await A.from("perros_notas_clinicas").select("perro_id, notas").eq("negocio_id", neg.id)).data }).slice(0, 900));
        } else {
          let notaCli = null;
          for (let k = 0; k < 20 && !notaCli; k++) {
            notaCli = (await A.from("clientes_notas_internas").select("notas").eq("cliente_id", cli?.[0]?.id ?? randomUUID()).maybeSingle()).data;
            if (!notaCli) await new Promise((x) => setTimeout(x, 1000));
          }
          nota = notaCli?.notas ?? "";
          ok(mascotas.every((m) => nota.includes(`${m.nombre}:`)) && /Antirrábica/.test(nota) && /Baño y corte/.test(nota), "sin Veterinaria, lo registrado quedó en la nota interna del cliente", nota.slice(0, 300));
        }
        const texto = JSON.stringify({ cli, perros, nota });
        ok(!prohibidos.some((x) => texto.includes(String(x))), "nada de las familias viajó al negocio");
        const { data: vinc } = await A.from("mascotas_vinculos").select("mascota_id").eq("negocio_id", neg.id).is("deleted_at", null);
        ok((vinc ?? []).length === 3, "cada paciente quedó ligado a la mascota del dueño (lo que registre después le llega)");
        const { data: prF } = await A.from("prospectos").select("negocio_cliente_id").eq("id", prospectoId).single();
        ok(prF?.negocio_cliente_id === neg.id, "el prospecto quedó ligado al negocio");
        const { data: pa } = await A.from("plataforma_admins").select("profile_id").limit(1);
        if (pa?.[0]) {
          const ctxPlat = await nav.newContext({ viewport: { width: 390, height: 900 } });
          await ctxPlat.addCookies(galletas(await sesionDe(pa[0].profile_id), `sb-${REF}-auth-token`, "plataforma.localhost"));
          const pp = await ctxPlat.newPage();
          await pp.goto(`${PLATAFORMA}/plataforma/app-duenos`, { waitUntil: "networkidle" });
          const fila = await pp.locator(`[data-negocio-qr="${prospectoId}"]`).innerText().catch(() => "");
          ok(/En prueba/.test(fila) && fila.includes(NOMBRE_NEG), "la métrica de /plataforma/app-duenos lo pone «En prueba»", fila.slice(0, 150));
          await ancho(pp, "/plataforma/app-duenos");
          await ctxPlat.close();
        }
        const sinSesion = await pedir(HOST_PLAT, "/plataforma/app-duenos");
        ok(sinSesion.status !== 200 || !sinSesion.cuerpo.toString().includes("data-metricas-app-duenos"), "las métricas no se ven sin sesión de la plataforma");
      }
    }
  }

  console.log("\n8. Límites");
  const fila = (mascotaId, whatsapp) => ({ mascota_id: mascotaId, prospecto_id: prospectoId, giro: "hotel", negocio_nombre: NOMBRE_NEG, negocio_whatsapp: whatsapp, datos: { giro: "hotel", entrada: hoy, salida: hoy }, fecha: hoy, firma_path: "atenciones/relleno.png", editor_hash: "relleno", editable_hasta: new Date().toISOString(), updated_at: new Date().toISOString() });
  const { count: deM1 } = await A.from("app_atenciones").select("id", { count: "exact", head: true }).eq("mascota_id", M1.id);
  await A.from("app_atenciones").insert(Array.from({ length: Math.max(0, 6 - (deM1 ?? 0)) }, () => fila(M1.id, TEL_LIM.replace(/.$/, "7"))));
  const ctxLim = await nav.newContext({ viewport: { width: 390, height: 860 } });
  const pl = await ctxLim.newPage();
  const intentar = async (mascota, tel) => {
    await pl.goto(`${BASE_APP}/m/${mascota.token_publico}/registrar`, { waitUntil: "networkidle" });
    await pl.locator('[data-giro="hotel"]').click();
    await pl.locator('input[name="negocio_nombre"]').fill(NOMBRE_NEG);
    await pl.locator('input[name="negocio_whatsapp"]').fill(tel);
    await pl.locator("[data-firma]").scrollIntoViewIfNeeded();
    const caja = await pl.locator("[data-firma]").boundingBox();
    await pl.mouse.move(caja.x + 30, caja.y + 40); await pl.mouse.down();
    for (let k = 1; k <= 10; k++) await pl.mouse.move(caja.x + 30 + k * 20, caja.y + 40 + (k % 2 ? 15 : -15));
    await pl.mouse.up();
    await pl.locator("[data-guardar-atencion]").click();
    return pl.locator("[data-error-atencion]").innerText({ timeout: 20_000 }).catch(() => "");
  };
  ok(/ya tiene varias atenciones registradas hoy/.test(await intentar(M1, TEL_NEG)), "la séptima atención de la misma mascota en el día se rechaza");
  await A.from("app_atenciones").insert(Array.from({ length: 30 }, () => fila(M2.id, TEL_LIM)));
  ok(/muchas atenciones hoy desde este número/.test(await intentar(M3, TEL_LIM)), "el registro 31 del mismo número en el día se rechaza");
  await ctxLim.close();

  console.log("\n9. RLS");
  const c2 = sinNegocio(await tokenDe(C2.profile_id));
  const c1 = sinNegocio(await tokenDe(C1.profile_id));
  for (const t of ["app_atenciones", "app_qr_escaneos"]) {
    const { data: a1 } = await anonimo.from(t).select("id").limit(1);
    const { data: a2 } = await c2.from(t).select("id").limit(1);
    const { data: a3 } = await c1.from(t).select("id").limit(1);
    ok(!(a1 ?? []).length && !(a2 ?? []).length && !(a3 ?? []).length, `nadie fuera del servidor lee ${t} directo (ni el dueño: va por función)`);
  }
  const propia = await c1.rpc("app_mis_atenciones", { p_mascota: M1.id });
  const ajena = await c2.rpc("app_mis_atenciones", { p_mascota: M1.id });
  const anon = await anonimo.rpc("app_mis_atenciones", { p_mascota: M1.id });
  ok((propia.data ?? []).length >= 1 && !(ajena.data ?? []).length && (anon.error || !(anon.data ?? []).length), "app_mis_atenciones: el dueño ve las suyas; otro dueño y el anónimo nada");
  ok(!JSON.stringify(propia.data ?? []).match(/editor_hash|ip_hash|prospecto_id|escaneo_id/), "la función del dueño no devuelve columnas internas (huellas, prospecto ni escaneo)");
  await ctxDueno.close();
  await ctxNeg.close();
} finally {
  await nav.close();
  doble.close();
  for (const m of mascotas) {
    const { data: restos } = await A.storage.from("app-mascotas").list(`atenciones/${m.id}`);
    if (restos?.length) await A.storage.from("app-mascotas").remove(restos.map((f) => `atenciones/${m.id}/${f.name}`));
  }
  await A.from("app_avisos").delete().eq("dueno_id", C1.profile_id).in("mascota_id", mascotas.map((m) => m.id));
  await A.from("mascotas").delete().in("id", mascotas.map((m) => m.id));
  const { data: prs } = await A.from("prospectos").select("id").or(`telefono_norm.like.%${TEL_NEG},nombre.eq."${NOMBRE_NEG}"`);
  for (const pr of prs ?? []) {
    await A.from("app_atenciones").delete().eq("prospecto_id", pr.id);
    await A.from("prospectos_reclamos").delete().eq("prospecto_id", pr.id);
    await A.from("prospectos_eventos").delete().eq("prospecto_id", pr.id);
    await A.from("prospectos").delete().eq("id", pr.id);
  }
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ App para dueños · Fase 2: todo en orden.");
process.exit(hallazgos.length ? 1 : 0);
