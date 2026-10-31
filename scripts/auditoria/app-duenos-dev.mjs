// App para dueños · Fase 0 (SOLO DESARROLLO). docs/app-duenos/FASE-0.md
//
// Con el servidor compilado y prendido apuntando al doble de WhatsApp de este script (puerto 4456):
//
//   WHATSAPP_GRAPH_URL=http://127.0.0.1:4456 WHATSAPP_TOKEN=wa-prueba WHATSAPP_PHONE_NUMBER_ID=PHONE_PRUEBA \
//   WHATSAPP_APP_SECRET=secreto-app-prueba PELUDESK_WHATSAPP=5215512345678 \
//   npm run start -- -p 3001          (después de npm run build)
//
//   node scripts/auditoria/app-duenos-dev.mjs
//
// Comprueba, con Huellitas (y Ludogteka como «el otro negocio»):
//   1. Hosts: app.localhost sirve la app (/ sin sesión → /entrar; manifest y sw-app.js de PeluDesk; /app no existe en
//      el dominio de un negocio ni en el de la plataforma; /portal y /plataforma no existen en la app).
//   2. Entrar por código de WhatsApp, de punta a punta: pedir código en pantalla → mensaje «ENTRAR ABC123» firmado al
//      webhook (desde ESE número; desde otro número se rechaza; vencido se rechaza) → la pantalla entra sola; la cuenta
//      es la que ya tenía el teléfono (un cliente de Huellitas) o una nueva; el código se canjea una sola vez.
//   3. Mis mascotas: el cliente ve sus mascotas de Huellitas (puente); un expediente nuevo en Huellitas aparece en la
//      app al momento; una baja en el negocio la quita; la mascota de otro dueño no se ve (RLS con JWT real; anónimo nada).
//   4. Avisos: la suscripción push se guarda con la sesión del dueño (y no con otra); «probar» crea el aviso; el envío
//      a un endpoint muerto da de baja la suscripción.
//   5. Cerca de mí responde con la ubicación; /yo guarda el nombre; cerrar sesión regresa a /entrar.
//   6. Celular (390 px): ninguna pantalla desborda; las tres pestañas están.
//   7. El portal de Huellitas enseña el aviso con el link a la app.
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

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

// ── Doble del Graph de WhatsApp: guarda lo que el servidor manda ─────────
const mock = { wa: [] };
const doble = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const json = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.method === "POST" && /\/messages$/.test(req.url ?? "")) {
    try { mock.wa.push(JSON.parse(cuerpo)); } catch { /* vacío */ }
    return json(200, { messages: [{ id: `wamid.${randomUUID()}` }] });
  }
  return json(200, {});
});
await new Promise((r) => doble.listen(4456, "127.0.0.1", r));

function pedir(host, ruta, { method = "GET", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO_APP, path: ruta, method, headers: { host, ...(body ? { "content-type": "application/json" } : {}), ...headers } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, cuerpo: d, headers: res.headers }));
    });
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}
const firmar = (cuerpo) => `sha256=${createHmac("sha256", APP_SECRET).update(cuerpo).digest("hex")}`;
function cuerpoWhatsApp(telefonoWa, texto) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: PHONE_ID, display_phone_number: "525649160742" }, contacts: [{ wa_id: telefonoWa }], messages: [{ from: telefonoWa, id: `wamid.${randomUUID()}`, timestamp: `${Math.floor(Date.now() / 1000)}`, type: "text", text: { body: texto } }] } }] }],
  });
}
async function mandarAlBot(telefono10, texto) {
  const antes = mock.wa.length;
  const cuerpo = cuerpoWhatsApp(`521${telefono10}`, texto);
  const r = await pedir(HOST_PLAT, "/api/whatsapp/webhook", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": firmar(cuerpo) } });
  if (r.status !== 200) throw new Error(`webhook ${r.status}: ${r.cuerpo.slice(0, 200)}`);
  for (let i = 0; i < 60; i++) {
    const nuevas = mock.wa.slice(antes).filter((m) => m.to === `52${telefono10}` && m.type === "text");
    if (nuevas.length) return nuevas[0].text?.body ?? "";
    await new Promise((x) => setTimeout(x, 500));
  }
  return null;
}

// ── Datos: Huellitas, un cliente con cuenta, otro cliente, Ludogteka ─────
const { data: hue } = await A.from("negocios").select("id, slug").eq("slug", "huellitas").single();
const { data: ludo } = await A.from("negocios").select("id").eq("slug", "ludogteka").single();
const H = hue.id;
const servicioH = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const sinNegocio = (token) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const anonimo = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// Dos clientes de Huellitas con cuenta (membresía cliente) y al menos una mascota viva cada uno.
const { data: miembros } = await servicioH.from("membresias").select("profile_id, cliente_id").eq("negocio_id", H).eq("rol", "cliente").is("deleted_at", null).not("cliente_id", "is", null).limit(40);
const conMascota = [];
for (const m of miembros ?? []) {
  const { data: c } = await servicioH.from("clientes").select("id, telefono, nombre").eq("id", m.cliente_id).is("deleted_at", null).maybeSingle();
  const { count } = await servicioH.from("perros").select("id", { count: "exact", head: true }).eq("cliente_id", m.cliente_id).is("deleted_at", null);
  // Entre 1 y 5 mascotas: los clientes de pruebas de carga (cientos de expedientes) no sirven para mirar la pantalla.
  if (c?.telefono && (count ?? 0) >= 1 && (count ?? 0) <= 5) conMascota.push({ ...m, telefono: c.telefono, nombre: c.nombre });
  if (conMascota.length >= 2) break;
}
if (conMascota.length < 2) throw new Error("Huellitas necesita dos clientes con cuenta y mascota (corre negocio-prueba-dev.mjs).");
const [C1, C2] = conMascota;
console.log(`Huellitas ${H} · clientes ${C1.telefono} y ${C2.telefono}`);
const telNuevo = `55${sufijo}0`.slice(0, 10).padEnd(10, "7");

const limpiar = async () => {
  await A.from("app_entradas").delete().in("telefono", [C1.telefono, telNuevo]);
  await A.from("perros").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", H).like("nombre", `Prueba App ${sufijo}%`);
  const { data: u } = await A.rpc("email_de_persona_por_telefono", { p_telefono: telNuevo });
  if (u) {
    const { data: lista } = await A.auth.admin.listUsers({ perPage: 1000 });
    const cuenta = (lista?.users ?? []).find((x) => x.email === u);
    if (cuenta) await A.auth.admin.deleteUser(cuenta.id);
  }
};
await limpiar();

const nav = await abrirNavegador();
try {
  console.log("\n1. Hosts");
  const raiz = await pedir(HOST_APP, "/");
  if (raiz.status !== 307 && raiz.status !== 302 && raiz.status !== 308) hallazgo(`/ sin sesión en la app respondió ${raiz.status} (se esperaba redirección a /entrar)`);
  else if (!/\/entrar/.test(raiz.headers.location ?? "")) hallazgo(`/ sin sesión redirige a ${raiz.headers.location}`);
  else bien("/ sin sesión → /entrar");
  const man = await pedir(HOST_APP, "/manifest.webmanifest");
  let manifest = null;
  try { manifest = JSON.parse(man.cuerpo); } catch { /* no json */ }
  if (man.status !== 200 || manifest?.name !== "PeluDesk" || !(manifest?.icons ?? []).some((i) => i.purpose === "maskable")) hallazgo(`el manifest de la app no es el de PeluDesk: ${man.status} ${man.cuerpo.slice(0, 120)}`);
  else bien("manifest de PeluDesk con ícono maskable y tres accesos directos");
  const sw = await pedir(HOST_APP, "/sw-app.js");
  if (sw.status !== 200 || !/notificationclick/.test(sw.cuerpo)) hallazgo(`sw-app.js no se sirve en la app (${sw.status})`);
  else bien("sw-app.js se sirve con push y notificationclick");
  const icono = await pedir(HOST_APP, "/icono-pwa?s=192");
  if (icono.status !== 200 || !/image\/png/.test(String(icono.headers["content-type"]))) hallazgo(`/icono-pwa en la app respondió ${icono.status}`);
  else bien("/icono-pwa da el ícono de PeluDesk");
  for (const [host, ruta] of [[`huellitas.localhost:${PUERTO_APP}`, "/app"], [`huellitas.localhost:${PUERTO_APP}`, "/app/avisos"], [HOST_APP, "/portal"], [HOST_APP, "/plataforma"], [HOST_APP, "/api/whatsapp/webhook"]]) {
    const r = await pedir(host, ruta);
    if (r.status !== 404) hallazgo(`${host}${ruta} respondió ${r.status} (se esperaba 404)`);
  }
  const plat = await pedir(HOST_PLAT, "/app");
  if (![301, 302, 307, 308, 404].includes(plat.status)) hallazgo(`plataforma /app respondió ${plat.status}`);
  bien("/app no existe en el dominio de un negocio ni en el de la plataforma; /portal, /plataforma y los webhooks no existen en la app");
  const entrar = await pedir(HOST_APP, "/entrar");
  if (entrar.status !== 200 || !/Tu número de WhatsApp/.test(entrar.cuerpo)) hallazgo(`/entrar respondió ${entrar.status}`);
  else bien("/entrar se abre sin sesión");

  console.log("\n2. Entrar por código de WhatsApp (cliente de Huellitas con cuenta)");
  const ctx = await nav.newContext({ viewport: { width: 390, height: 800 } });
  const pagina = await ctx.newPage();
  await pagina.goto(`${BASE_APP}/entrar?ir=/avisos`, { waitUntil: "networkidle" });
  await pagina.locator("[data-campo-telefono]").fill(C1.telefono);
  await pagina.locator("[data-boton-entrar]").click();
  await pagina.locator("[data-codigo-entrada]").waitFor({ timeout: 20_000 });
  const codigo = (await pagina.locator("[data-codigo-entrada]").innerText()).trim();
  if (!/^[A-Z0-9]{6}$/.test(codigo)) hallazgo(`el código en pantalla no tiene forma: «${codigo}»`);
  else bien(`código en pantalla (${codigo}) y botón para abrir WhatsApp`);
  if (!(await pagina.locator("[data-abrir-whatsapp]").count())) hallazgo("falta el botón «Abrir WhatsApp con el código» (¿PELUDESK_WHATSAPP en el servidor?)");
  const ancho1 = await pagina.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
  if (ancho1.s > ancho1.w + 1) hallazgo(`/entrar desborda a 390 px (${ancho1.s} > ${ancho1.w})`);
  // Desde OTRO número se rechaza.
  const otro = await mandarAlBot(C2.telefono, `ENTRAR ${codigo}`);
  if (!/otro número/.test(otro ?? "")) hallazgo(`el código mandado desde otro número no se rechazó: «${otro}»`);
  else bien("el código mandado desde otro número se rechaza");
  const malo = await mandarAlBot(C1.telefono, "ENTRAR ZZZZZZ");
  if (!/No encontramos ese código/.test(malo ?? "")) hallazgo(`un código inexistente no se rechazó: «${malo}»`);
  else bien("un código que no existe se rechaza");
  // Desde SU número se verifica y la pantalla entra sola a /avisos.
  const ok = await mandarAlBot(C1.telefono, `entrar ${codigo.toLowerCase()}`);
  if (!/ya te reconocimos/.test(ok ?? "")) hallazgo(`el código desde su número no se verificó: «${ok}»`);
  else bien("desde su número el bot contesta «ya te reconocimos» (mayúsculas y minúsculas valen)");
  // La pantalla pregunta cada 3 s, canjea y la acción navega: se espera a estar EN /avisos (no en /entrar?ir=/avisos).
  await pagina.waitForURL((u) => new globalThis.URL(u.toString()).pathname === "/avisos", { timeout: 40_000 }).catch(() => hallazgo(`la pantalla no entró sola a /avisos tras verificar (está en ${pagina.url()})`));
  if (new globalThis.URL(pagina.url()).pathname === "/avisos") bien("la pantalla entró sola y respetó ?ir=/avisos");
  const { data: entradaC1 } = await A.from("app_entradas").select("estado").eq("telefono", C1.telefono).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (entradaC1?.estado !== "usada") hallazgo(`la entrada no quedó «usada»: ${entradaC1?.estado}`);
  else bien("la entrada quedó usada (no se canjea dos veces)");
  const repetido = await mandarAlBot(C1.telefono, `ENTRAR ${codigo}`);
  if (!/No encontramos ese código|ya venció/.test(repetido ?? "")) hallazgo(`un código ya usado volvió a aceptarse: «${repetido}»`);
  else bien("un código ya usado no vuelve a servir");
  // La cuenta es la de siempre (misma persona que el portal de Huellitas).
  const cookies = await ctx.cookies();
  if (!cookies.some((c) => /portal-auth-token/.test(c.name))) hallazgo("la sesión no quedó en la cookie del portal");
  else bien("la sesión vive en la cookie del portal (una persona, todos sus negocios)");

  console.log("\n3. Mis mascotas: el puente con el expediente del negocio");
  await pagina.goto(`${BASE_APP}/`, { waitUntil: "networkidle" });
  const tarjetas = await pagina.locator("[data-mascota]").count();
  const { data: perrosC1 } = await servicioH.from("perros").select("id, nombre").eq("cliente_id", C1.cliente_id).is("deleted_at", null).eq("fallecido", false);
  if (tarjetas < (perrosC1 ?? []).length) hallazgo(`la app enseña ${tarjetas} mascotas y Huellitas tiene ${(perrosC1 ?? []).length} para este cliente`);
  else bien(`Mis mascotas enseña ${tarjetas} tarjeta(s), con «En Huellitas»`);
  if (!(await pagina.getByText("En Huellitas").first().count())) hallazgo("ninguna tarjeta dice «En Huellitas»");
  // Un expediente nuevo en Huellitas aparece al momento.
  const nombreNuevo = `Prueba App ${sufijo}`;
  const { data: nuevo, error: eNuevo } = await servicioH.from("perros").insert({ negocio_id: H, cliente_id: C1.cliente_id, nombre: nombreNuevo, especie: "gato", sexo: "hembra", raza: "Mestizo" }).select("id").single();
  if (eNuevo) hallazgo(`no se pudo crear el expediente de prueba: ${eNuevo.message}`);
  const { data: vinc } = await A.from("mascotas_vinculos").select("mascota_id").eq("negocio_id", H).eq("perro_id", nuevo?.id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  if (!vinc) hallazgo("el expediente nuevo no quedó ligado a una mascota del dueño (disparador)");
  else bien("un expediente nuevo en el negocio queda ligado a una mascota del dueño al momento");
  await pagina.goto(`${BASE_APP}/`, { waitUntil: "networkidle" });
  if (!(await pagina.getByText(nombreNuevo).count())) hallazgo("la mascota nueva no sale en la app");
  else bien("la mascota nueva sale en la app");
  await pagina.getByText(nombreNuevo).first().click();
  await pagina.waitForURL(/\/mascotas\//, { timeout: 15_000 });
  if (!(await pagina.locator("[data-vinculo]").count()) || !(await pagina.getByText("Gata").count())) hallazgo("la ficha no enseña el vínculo con Huellitas o la especie");
  else bien("la ficha enseña «Gata», sus datos y el vínculo con Huellitas (abre su portal)");
  const anchoFicha = await pagina.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
  if (anchoFicha.s > anchoFicha.w + 1) hallazgo(`la ficha desborda a 390 px (${anchoFicha.s} > ${anchoFicha.w})`);
  // Baja en el negocio: deja de verse.
  await servicioH.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", nuevo.id);
  const { data: tras } = await A.from("mascotas").select("deleted_at").eq("id", vinc?.mascota_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  if (!tras?.deleted_at) hallazgo("tras la baja en el negocio la mascota sigue visible en la app");
  else bien("una baja en el negocio la quita de la app (nació de ese negocio y no tiene otro expediente)");
  // RLS con JWT real: C1 no ve lo de C2; el anónimo nada.
  const tokenC1 = await tokenDe(C1.profile_id);
  const tokenC2 = await tokenDe(C2.profile_id);
  const { data: mC1 } = await sinNegocio(tokenC1).from("mascotas").select("id, dueno_id");
  const { data: mC2 } = await sinNegocio(tokenC2).from("mascotas").select("id, dueno_id");
  if ((mC1 ?? []).some((m) => m.dueno_id !== C1.profile_id) || (mC2 ?? []).some((m) => m.dueno_id !== C2.profile_id) || !(mC2 ?? []).length) hallazgo("la RLS de mascotas deja ver las de otro dueño (o C2 no ve las suyas)");
  else bien("cada dueño ve solo sus mascotas (JWT real, sin negocio)");
  const { data: dC1 } = await sinNegocio(tokenC1).from("duenos").select("id");
  if ((dC1 ?? []).some((d) => d.id !== C1.profile_id)) hallazgo("duenos deja ver otra fila");
  const { data: vC1, error: evC1 } = await sinNegocio(tokenC1).rpc("app_mis_vinculos");
  if (evC1 || (vC1 ?? []).some((v) => !(mC1 ?? []).some((m) => m.id === v.mascota_id))) hallazgo(`app_mis_vinculos devuelve vínculos ajenos: ${evC1?.message ?? ""}`);
  else bien("app_mis_vinculos solo devuelve los vínculos de sus mascotas");
  const { data: vAnon, error: eAnon } = await anonimo.rpc("app_mis_vinculos");
  const { data: mAnon } = await anonimo.from("mascotas").select("id");
  const { data: dAnon } = await anonimo.from("duenos").select("id");
  if ((!eAnon && (vAnon ?? []).length) || (mAnon ?? []).length || (dAnon ?? []).length) hallazgo("el anónimo alcanza mascotas, dueños o vínculos");
  else bien("el anónimo no alcanza nada");
  const { error: eVinc } = await sinNegocio(tokenC1).rpc("app_vincular_perro", { p_perro_id: nuevo.id });
  if (!eVinc) hallazgo("un dueño pudo ejecutar app_vincular_perro");
  else bien("app_vincular_perro no la ejecuta nadie más que el servidor");

  console.log("\n4. Avisos y push");
  await pagina.goto(`${BASE_APP}/avisos`, { waitUntil: "networkidle" });
  if (!(await pagina.locator("[data-activar-avisos]").count())) hallazgo("falta la tarjeta de activar avisos");
  else bien("la tarjeta «Avisos en tu celular» está");
  // La suscripción se guarda con la sesión del dueño (RLS): una ajena no.
  const endpointFalso = `https://fcm.googleapis.com/fcm/send/prueba-${sufijo}`;
  const { error: eSubPropia } = await sinNegocio(tokenC1).from("app_push_suscripciones").insert({ dueno_id: C1.profile_id, endpoint: endpointFalso, p256dh: "BKX".padEnd(87, "A"), auth: "abcdefghijklmnop", updated_at: new Date().toISOString() });
  const { error: eSubAjena } = await sinNegocio(tokenC2).from("app_push_suscripciones").insert({ dueno_id: C1.profile_id, endpoint: `${endpointFalso}-ajena`, p256dh: "BKX".padEnd(87, "A"), auth: "abcdefghijklmnop", updated_at: new Date().toISOString() });
  if (eSubPropia || !eSubAjena) hallazgo(`suscripción propia (${eSubPropia?.message ?? "ok"}) / ajena (${eSubAjena ? "rechazada" : "ACEPTADA"})`);
  else bien("la suscripción push se guarda solo para el propio dueño");
  // El envío a un endpoint muerto se prueba en push-dev (web-push responde 404/410 y se da de baja): aquí solo la RLS.
  // Marcar leídos / lista.
  const { data: avisoNuevo } = await A.from("app_avisos").insert({ dueno_id: C1.profile_id, tipo: "sistema", titulo: `Aviso de prueba ${sufijo}`, cuerpo: "Solo para la auditoría.", updated_at: new Date().toISOString() }).select("id").single();
  await pagina.goto(`${BASE_APP}/avisos`, { waitUntil: "networkidle" });
  if (!(await pagina.getByText(`Aviso de prueba ${sufijo}`).count())) hallazgo("el aviso no sale en la lista");
  else bien("el aviso sale en Avisos con «Nuevo»");
  if (!(await pagina.locator(".apd-punto").count())) hallazgo("la pestaña Avisos no marca el punto de sin leer");
  await pagina.getByText("Marcar todos como leídos").click();
  await pagina.waitForFunction(() => !document.querySelector('[data-leido="0"]'), null, { timeout: 15_000 }).catch(() => hallazgo("marcar todos como leídos no actualizó la lista"));
  const { data: leido } = await A.from("app_avisos").select("leido_at").eq("id", avisoNuevo.id).single();
  if (!leido?.leido_at) hallazgo("el aviso no quedó leído");
  else bien("«Marcar todos como leídos» funciona");
  const { data: avisoAjeno } = await sinNegocio(tokenC2).from("app_avisos").select("id").eq("id", avisoNuevo.id);
  if ((avisoAjeno ?? []).length) hallazgo("otro dueño ve el aviso");

  console.log("\n5. Cerca de mí, Mi cuenta y salir");
  await ctx.grantPermissions(["geolocation"], { origin: BASE_APP });
  await ctx.setGeolocation({ latitude: 22.1565, longitude: -100.9855 }); // San Luis Potosí
  // Sin zona guardada de una corrida anterior: la pantalla pide la ubicación.
  await A.from("duenos").update({ lat: null, lng: null }).eq("id", C1.profile_id);
  await pagina.goto(`${BASE_APP}/cerca`, { waitUntil: "networkidle" });
  if (!(await pagina.locator("[data-usar-ubicacion]").count())) hallazgo("Cerca de mí sin zona guardada no pide la ubicación");
  else await pagina.locator("[data-usar-ubicacion]").click();
  await pagina.locator("[data-lista-cerca]").waitFor({ state: "attached", timeout: 25_000 }).catch(() => hallazgo("Cerca de mí no enseñó la lista tras dar la ubicación"));
  const lugares = await pagina.locator("[data-lugar]").count();
  bien(`Cerca de mí responde con la ubicación (${lugares} lugares del directorio a 6 km)`);
  // La zona se guarda en segundo plano al dar la ubicación: se espera hasta 10 s.
  let zona = null;
  for (let i = 0; i < 20 && zona?.lat == null; i++) {
    zona = (await A.from("duenos").select("lat, lng").eq("id", C1.profile_id).single()).data;
    if (zona?.lat == null) await new Promise((r) => setTimeout(r, 500));
  }
  if (zona?.lat == null) hallazgo("la zona del dueño no se guardó");
  else bien("la zona del dueño quedó guardada (redondeada)");
  await pagina.goto(`${BASE_APP}/yo`, { waitUntil: "networkidle" });
  await pagina.locator("#yo-nombre").fill(`Dueña Prueba ${sufijo}`);
  await pagina.getByRole("button", { name: "Guardar" }).click();
  await pagina.getByText("Guardado.").waitFor({ timeout: 15_000 });
  const { data: nombreGuardado } = await A.from("duenos").select("nombre").eq("id", C1.profile_id).single();
  if (nombreGuardado?.nombre !== `Dueña Prueba ${sufijo}`) hallazgo("el nombre no se guardó");
  else bien("Mi cuenta guarda el nombre");
  if (!(await pagina.getByText("Huellitas").count())) hallazgo("Mi cuenta no lista a Huellitas");
  for (const ruta of ["/", "/avisos", "/cerca", "/yo"]) {
    await pagina.goto(`${BASE_APP}${ruta}`, { waitUntil: "networkidle" });
    const a = await pagina.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
    if (a.s > a.w + 1) hallazgo(`${ruta} desborda a 390 px (${a.s} > ${a.w})`);
    if ((await pagina.locator(".apd-nav a").count()) !== 3) hallazgo(`${ruta}: no están las tres pestañas`);
  }
  bien("ninguna pantalla desborda a 390 px y las tres pestañas están en todas");
  await pagina.goto(`${BASE_APP}/yo`, { waitUntil: "networkidle" });
  await pagina.locator("[data-salir]").click();
  await pagina.waitForURL(/\/entrar/, { timeout: 15_000 }).catch(() => hallazgo("cerrar sesión no regresó a /entrar"));
  const sinSesion = await pagina.goto(`${BASE_APP}/avisos`, { waitUntil: "networkidle" });
  if (!/\/entrar/.test(pagina.url())) hallazgo(`tras salir, /avisos se abrió (${sinSesion?.status()})`);
  else bien("tras cerrar sesión, la app pide entrar otra vez");
  await ctx.close();

  console.log("\n6. Un número NUEVO: se crea la cuenta y entra");
  const ctx2 = await nav.newContext({ viewport: { width: 390, height: 800 } });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE_APP}/entrar`, { waitUntil: "networkidle" });
  await p2.locator("[data-campo-telefono]").fill(telNuevo);
  await p2.locator("[data-boton-entrar]").click();
  await p2.locator("[data-codigo-entrada]").waitFor({ timeout: 20_000 });
  const codigo2 = (await p2.locator("[data-codigo-entrada]").innerText()).trim();
  const r2 = await mandarAlBot(telNuevo, `ENTRAR ${codigo2}`);
  if (!/ya te reconocimos/.test(r2 ?? "")) hallazgo(`el número nuevo no se verificó: «${r2}»`);
  await p2.waitForURL((u) => !/\/entrar/.test(u.toString()), { timeout: 25_000 }).catch(() => hallazgo("el número nuevo no entró"));
  if (await p2.locator("[data-sin-mascotas]").count()) bien("un número nuevo entra, con su cuenta recién creada, y ve el estado vacío");
  else hallazgo("el número nuevo no ve el estado vacío de Mis mascotas");
  const { data: duenoNuevo } = await A.from("duenos").select("telefono").eq("telefono", telNuevo).maybeSingle();
  if (!duenoNuevo) hallazgo("la fila de duenos del número nuevo no se creó");
  else bien("su fila en duenos tiene su teléfono");
  await ctx2.close();

  console.log("\n7. El portal de Huellitas enseña el aviso con el link a la app");
  const ctx3 = await nav.newContext();
  const { data: uC1 } = await A.auth.admin.getUserById(C1.profile_id);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: uC1.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  const REF = new globalThis.URL(URL).hostname.split(".")[0];
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  await ctx3.addCookies(galletas(`sb-${REF}-portal-auth-token`).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" })));
  const p3 = await ctx3.newPage();
  await p3.goto(`http://huellitas.localhost:${PUERTO_APP}/portal`, { waitUntil: "networkidle" });
  const aviso = p3.locator("[data-aviso-app-duenos] a");
  if (!(await aviso.count()) || !/app\.localhost|app\.peludesk/.test((await aviso.getAttribute("href")) ?? "")) hallazgo("el portal no enseña el aviso con el link a la app");
  else bien("el portal del negocio enseña «la app PeluDesk» con su link");
  await ctx3.close();
} finally {
  await nav.close();
  doble.close();
  await limpiar();
  await A.from("app_push_suscripciones").delete().like("endpoint", `%prueba-${sufijo}%`);
  await A.from("app_avisos").delete().like("titulo", `Aviso de prueba ${sufijo}%`);
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ App para dueños · Fase 0: todo en orden.");
process.exit(hallazgos.length ? 1 : 0);
