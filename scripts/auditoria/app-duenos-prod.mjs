// App para dueños · verificación en PRODUCCIÓN con la dueña de la demo (Patitas & Co., Fernanda Luna, 4420000201).
// Solo lectura del negocio: abre la app con la sesión de esa cuenta (enlace mágico canjeado aquí, como el corredor),
// y comprueba hosts, manifest, service worker, Mis mascotas (Canela y Pimienta), Avisos, Cerca de mí y Mi cuenta.
// Lo único que escribe es lo de la propia dueña de la demo (su fila en duenos: último acceso).
//
//   node scripts/auditoria/app-duenos-prod.mjs
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { llavesProd, URL_PROD, REF_PROD } from "../lib/prod.mjs";

const APP = "https://app.peludesk.mx";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

const S = createClient(URL_PROD, llavesProd().servicio, { auth: { persistSession: false } });
const { data: demo } = await S.from("negocios").select("id, slug").eq("slug", "patitasyco").single();
if (!demo) throw new Error("No está el negocio demo.");
const servicioDemo = createClient(URL_PROD, llavesProd().servicio, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": demo.id } } });
const { data: cliente } = await servicioDemo.from("clientes").select("id, nombre").eq("negocio_id", demo.id).eq("telefono", "4420000201").is("deleted_at", null).single();
const { data: m } = await servicioDemo.from("membresias").select("profile_id").eq("negocio_id", demo.id).eq("cliente_id", cliente.id).eq("rol", "cliente").is("deleted_at", null).single();
const { data: perros } = await servicioDemo.from("perros").select("nombre").eq("cliente_id", cliente.id).is("deleted_at", null).eq("fallecido", false);
console.log(`Demo ${demo.id} · ${cliente.nombre} · mascotas: ${(perros ?? []).map((p) => p.nombre).join(", ")}`);

console.log("\n1. Hosts y PWA");
const pedir = async (ruta, init = {}) => { const r = await fetch(`${APP}${ruta}`, { redirect: "manual", ...init }); return { status: r.status, location: r.headers.get("location"), tipo: r.headers.get("content-type"), cuerpo: await r.text() }; };
const raiz = await pedir("/");
if (![302, 307, 308].includes(raiz.status) || !/\/entrar/.test(raiz.location ?? "")) hallazgo(`/ sin sesión → ${raiz.status} ${raiz.location}`);
else bien("/ sin sesión → /entrar");
const entrar = await pedir("/entrar");
if (entrar.status !== 200 || !/Tu número de WhatsApp/.test(entrar.cuerpo)) hallazgo(`/entrar → ${entrar.status}`);
else bien("/entrar se abre");
const man = await pedir("/manifest.webmanifest");
let manifest = null;
try { manifest = JSON.parse(man.cuerpo); } catch { /* no */ }
if (manifest?.name !== "PeluDesk") hallazgo(`manifest: ${man.status} ${man.cuerpo.slice(0, 100)}`);
else bien("manifest de PeluDesk");
const sw = await pedir("/sw-app.js");
if (sw.status !== 200 || !/notificationclick/.test(sw.cuerpo)) hallazgo(`sw-app.js → ${sw.status}`);
else bien("sw-app.js con push");
const icono = await pedir("/icono-pwa?s=512&m=1");
if (icono.status !== 200 || !/image\/png/.test(icono.tipo ?? "")) hallazgo(`icono-pwa → ${icono.status}`);
else bien("ícono maskable");
for (const ruta of ["/portal", "/plataforma", "/app"]) {
  const r = await pedir(ruta);
  if (r.status !== 404) hallazgo(`${ruta} en la app → ${r.status} (se esperaba 404)`);
}
const plat = await fetch("https://peludesk.mx/plataforma", { redirect: "manual" });
if (![302, 307, 308].includes(plat.status) || !/plataforma\/entrar/.test(plat.headers.get("location") ?? "")) hallazgo(`peludesk.mx/plataforma → ${plat.status} ${plat.headers.get("location")} (la plataforma debe seguir en peludesk.mx)`);
else bien("peludesk.mx sigue siendo la plataforma");
const appPlat = await fetch(`${APP}/plataforma/entrar`, { redirect: "manual" });
if (appPlat.status !== 404) hallazgo(`app.peludesk.mx/plataforma/entrar → ${appPlat.status} (ya no es host de plataforma)`);
else bien("app.peludesk.mx ya no abre la plataforma");
bien("/portal, /plataforma y /app no existen en la app");

console.log("\n2. Con la sesión de la dueña de la demo");
const { data: u } = await S.auth.admin.getUserById(m.profile_id);
const { data: link } = await S.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
const cli = createClient(URL_PROD, llavesProd().anon, { auth: { persistSession: false } });
const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (error) throw error;
const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
const trozos = valor.match(/.{1,3180}/g);
const galletas = trozos.length === 1 ? [[`sb-${REF_PROD}-portal-auth-token`, valor]] : trozos.map((t, i) => [`sb-${REF_PROD}-portal-auth-token.${i}`, t]);
const nav = await abrirNavegador();
try {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 800 } });
  await ctx.addCookies(galletas.map(([name, value]) => ({ name, value, domain: "app.peludesk.mx", path: "/", secure: true, sameSite: "Lax" })));
  const p = await ctx.newPage();
  const inicio = Date.now();
  await p.goto(`${APP}/`, { waitUntil: "networkidle" });
  const ms = Date.now() - inicio;
  const tarjetas = await p.locator("[data-mascota]").count();
  if (tarjetas < (perros ?? []).length) hallazgo(`Mis mascotas enseña ${tarjetas}; la demo tiene ${(perros ?? []).length}`);
  else bien(`Mis mascotas: ${tarjetas} mascota(s) (${(perros ?? []).map((x) => x.nombre).join(", ")}) en ${ms} ms`);
  if (!(await p.getByText("En Patitas & Co.").first().count())) hallazgo("ninguna tarjeta dice «En Patitas & Co.»");
  else bien("las tarjetas dicen «En Patitas & Co.»");
  await p.locator("[data-mascota]").first().click();
  await p.waitForURL(/\/mascotas\//, { timeout: 20_000 });
  const portal = await p.locator("[data-vinculo]").first().getAttribute("href");
  if (!/patitasyco|peludesk/.test(portal ?? "")) hallazgo(`el vínculo no abre el portal del demo: ${portal}`);
  else bien(`la ficha abre su expediente en ${portal}`);
  for (const ruta of ["/avisos", "/cerca", "/yo"]) {
    await p.goto(`${APP}${ruta}`, { waitUntil: "networkidle" });
    const a = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth, nav: document.querySelectorAll(".apd-nav a").length }));
    if (a.s > a.w + 1 || a.nav !== 3) hallazgo(`${ruta}: desborda (${a.s}>${a.w}) o faltan pestañas (${a.nav})`);
  }
  bien("Avisos, Cerca de mí y Mi cuenta abren a 390 px con las tres pestañas");
  await p.goto(`${APP}/avisos`, { waitUntil: "networkidle" });
  const estado = await p.locator("[data-activar-avisos]").getAttribute("data-estado");
  bien(`Avisos: la tarjeta de notificaciones está (estado en este navegador: ${estado})`);
  const swReg = await p.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return r ? r.active?.scriptURL ?? "instalando" : null; });
  if (!swReg) hallazgo("el service worker no se registró");
  else bien(`service worker registrado: ${swReg}`);
  const { data: dueno } = await S.from("duenos").select("telefono, ultimo_acceso_at").eq("id", m.profile_id).maybeSingle();
  if (!dueno) hallazgo("la dueña de la demo no tiene fila en duenos");
  else bien(`duenos: teléfono ${dueno.telefono}, último acceso ${dueno.ultimo_acceso_at}`);
  await ctx.close();
} finally {
  await nav.close();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ App para dueños en producción: todo en orden.");
process.exit(hallazgos.length ? 1 : 0);
