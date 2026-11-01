// App para dueños · verificación en PRODUCCIÓN con la dueña de la demo (Patitas & Co., Fernanda Luna, 4420000201).
// Solo lectura del negocio: abre la app con la sesión de esa cuenta (enlace mágico canjeado aquí, como el corredor),
// y comprueba hosts, manifest, service worker, Mis mascotas (Canela y Pimienta), Avisos, Cerca de mí y Mi cuenta.
// Lo único que escribe es lo de la propia dueña de la demo (su fila en duenos: último acceso).
//
//   node scripts/auditoria/app-duenos-prod.mjs [--escribir] [--plantillas]
//
// Fase 2 (docs/app-duenos/FASE-2.md), con una mascota de la dueña de la demo:
//   · siempre (lectura): /m/<token> ofrece «Registrar atención»; /m/<token>/registrar enseña la mascota y nada de la
//     familia; /plataforma/app-duenos no se abre sin sesión.
//   · --escribir: un negocio de prueba («Prueba QR PeluDesk», WhatsApp 5599990001; nunca Ludogteka) registra una vacuna
//     con firma desde un navegador sin sesión; se comprueban la cartilla (fuente qr), el aviso, el recordatorio firmado
//     y la ficha de la dueña. Al final se borra TODO lo que creó (atención, escaneo, cartilla, peso, recordatorios,
//     avisos, firma y prospecto).
//   · --plantillas: con la sesión de administración de la plataforma, «Mandar a aprobar» peludesk_cita_sugerida_v1 en
//     /plataforma/plantillas-whatsapp si todavía no existe en Meta, y su estado.
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { llavesProd, URL_PROD, REF_PROD } from "../lib/prod.mjs";

const APP = "https://app.peludesk.mx";
const ESCRIBIR = process.argv.includes("--escribir");
const PLANTILLAS = process.argv.includes("--plantillas");
const TEL_PRUEBA = "5599990001";
const NEG_PRUEBA = "Prueba QR PeluDesk";
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

  console.log("\n3. Fase 2: el QR para negocios");
  const { data: masc } = await S.from("mascotas").select("id, nombre, token_publico").eq("dueno_id", m.profile_id).is("deleted_at", null).eq("fallecido", false).order("created_at").limit(1).maybeSingle();
  if (!masc) hallazgo("la dueña de la demo no tiene mascota en la app");
  else {
    const perfil = await pedir(`/m/${masc.token_publico}`);
    if (perfil.status !== 200 || !perfil.cuerpo.includes("data-registrar-atencion")) hallazgo(`/m/<token> no ofrece «Registrar atención» (${perfil.status})`);
    else bien(`/m/${masc.token_publico} ofrece «Registrar atención»`);
    const form = await pedir(`/m/${masc.token_publico}/registrar`);
    const familia = [cliente.nombre, "4420000201", u.user.email].filter(Boolean);
    if (form.status !== 200 || !form.cuerpo.includes(masc.nombre) || familia.some((x) => form.cuerpo.includes(x))) hallazgo(`/registrar: ${form.status}, o enseña algo de la familia`);
    else bien("/registrar enseña la mascota y nada de la familia");
    const met = await fetch("https://peludesk.mx/plataforma/app-duenos", { redirect: "manual" });
    if (![302, 307, 308].includes(met.status)) hallazgo(`/plataforma/app-duenos sin sesión → ${met.status}`);
    else bien("/plataforma/app-duenos pide sesión de la plataforma");

    if (ESCRIBIR) {
      const ctxN = await nav.newContext({ viewport: { width: 390, height: 860 } });
      const pn = await ctxN.newPage();
      try {
        const t0 = Date.now();
        await pn.goto(`${APP}/m/${masc.token_publico}/registrar`, { waitUntil: "networkidle" });
        await pn.locator('[data-giro="veterinaria"]').click();
        await pn.locator("[data-agregar-vacuna]").first().click();
        await pn.locator('input[name="lote-0"]').fill("QRPROD1");
        await pn.locator('input[name="peso"]').fill("7.5");
        await pn.locator('input[name="negocio_nombre"]').fill(NEG_PRUEBA);
        await pn.locator('input[name="negocio_whatsapp"]').fill(TEL_PRUEBA);
        await pn.locator("[data-firma]").scrollIntoViewIfNeeded();
        const caja = await pn.locator("[data-firma]").boundingBox();
        await pn.mouse.move(caja.x + 30, caja.y + 40);
        await pn.mouse.down();
        for (let k = 1; k <= 12; k++) await pn.mouse.move(caja.x + 30 + k * 20, caja.y + 40 + (k % 2 ? 15 : -15));
        await pn.mouse.up();
        await pn.locator("[data-guardar-atencion]").click();
        await pn.locator("[data-atencion-guardada]").waitFor({ timeout: 30_000 });
        const seg = ((Date.now() - t0) / 1000).toFixed(1);
        const { data: at } = await S.from("app_atenciones").select("id").eq("mascota_id", masc.id).eq("negocio_whatsapp", TEL_PRUEBA).order("created_at", { ascending: false }).limit(1).single();
        const { data: cart } = await S.from("mascotas_cartilla").select("id, fuente, lote").eq("atencion_id", at.id).is("deleted_at", null);
        const { data: av } = await S.from("app_avisos").select("id").eq("dueno_id", m.profile_id).eq("tipo", "registro").eq("mascota_id", masc.id).contains("datos", { atencion_id: at.id });
        const { data: rec } = await S.from("app_recordatorios").select("cuerpo").eq("ref_id", cart?.[0]?.id ?? at.id);
        if (cart?.length !== 1 || cart[0].fuente !== "qr" || cart[0].lote !== "QRPROD1") hallazgo("la vacuna no entró a la cartilla con fuente qr y lote");
        else bien(`la vacuna entró a la cartilla (fuente qr, lote) en ${seg} s desde abrir el formulario`);
        if (!(av ?? []).length) hallazgo("a la dueña no le llegó el aviso");
        else bien("a la dueña le llegó el aviso (push y Avisos)");
        if (!(rec ?? []).length || !rec.every((x) => x.cuerpo.includes(`De parte de ${NEG_PRUEBA}`))) hallazgo("los recordatorios no van firmados por el negocio");
        else bien(`${rec.length} recordatorio(s) firmados por el negocio`);
        const ctxD = await nav.newContext({ viewport: { width: 390, height: 800 } });
        await ctxD.addCookies(galletas.map(([name, value]) => ({ name, value, domain: "app.peludesk.mx", path: "/", secure: true, sameSite: "Lax" })));
        const pd = await ctxD.newPage();
        await pd.goto(`${APP}/mascotas/${masc.id}`, { waitUntil: "networkidle" });
        if (!(await pd.locator(`[data-atencion="${at.id}"]`).count())) hallazgo("la ficha de la dueña no enseña el registro");
        else bien("la ficha de la dueña enseña «Lo que registraron los negocios»");
        await ctxD.close();
      } catch (e) {
        hallazgo(`registro en producción: ${e instanceof Error ? e.message : e}`);
      } finally {
        await ctxN.close();
        // Limpieza: solo lo que creó la prueba (WhatsApp y nombre del negocio de prueba).
        const { data: ats } = await S.from("app_atenciones").select("id, firma_path").eq("mascota_id", masc.id).eq("negocio_whatsapp", TEL_PRUEBA);
        for (const a of ats ?? []) {
          const { data: cs } = await S.from("mascotas_cartilla").select("id").eq("atencion_id", a.id);
          const ids = (cs ?? []).map((c) => c.id);
          if (ids.length) await S.from("app_recordatorios").delete().in("ref_id", ids);
          await S.from("app_recordatorios").delete().eq("ref_id", a.id);
          await S.from("mascotas_cartilla").delete().eq("atencion_id", a.id);
          await S.from("mascotas_pesos").delete().eq("atencion_id", a.id);
          await S.from("app_avisos").delete().eq("dueno_id", m.profile_id).contains("datos", { atencion_id: a.id });
          if (a.firma_path) await S.storage.from("app-mascotas").remove([a.firma_path]);
          await S.from("app_atenciones").delete().eq("id", a.id);
        }
        await S.from("app_qr_escaneos").delete().eq("mascota_id", masc.id).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
        const { data: prs } = await S.from("prospectos").select("id").eq("nombre", NEG_PRUEBA).eq("fuente", "qr");
        for (const pr of prs ?? []) {
          await S.from("prospectos_eventos").delete().eq("prospecto_id", pr.id);
          await S.from("prospectos").delete().eq("id", pr.id);
        }
        const { count: quedan } = await S.from("app_atenciones").select("id", { count: "exact", head: true }).eq("negocio_whatsapp", TEL_PRUEBA);
        if (quedan) hallazgo(`quedaron ${quedan} atenciones de prueba`);
        else bien("se borró todo lo que creó la prueba");
      }
    }
  }

  if (PLANTILLAS) {
    console.log("\n4. Plantilla de cita sugerida");
    const { data: pa } = await S.from("plataforma_admins").select("profile_id").limit(1).single();
    const { data: ua } = await S.auth.admin.getUserById(pa.profile_id);
    const { data: la } = await S.auth.admin.generateLink({ type: "magiclink", email: ua.user.email });
    const { data: sa, error: ea } = await createClient(URL_PROD, llavesProd().anon, { auth: { persistSession: false } }).auth.verifyOtp({ type: "magiclink", token_hash: la.properties.hashed_token });
    if (ea) throw ea;
    const va = "base64-" + Buffer.from(JSON.stringify(sa.session)).toString("base64url");
    const ta = va.match(/.{1,3180}/g);
    const ga = ta.length === 1 ? [[`sb-${REF_PROD}-auth-token`, va]] : ta.map((t, i) => [`sb-${REF_PROD}-auth-token.${i}`, t]);
    const ctxP = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctxP.addCookies(ga.map(([name, value]) => ({ name, value, domain: "peludesk.mx", path: "/", secure: true, sameSite: "Lax" })));
    const pp = await ctxP.newPage();
    await pp.goto("https://peludesk.mx/plataforma/plantillas-whatsapp", { waitUntil: "networkidle" });
    const fila = pp.locator('[data-plantilla="peludesk_cita_sugerida_v1"]');
    let estado = await fila.getAttribute("data-estado").catch(() => null);
    if (estado === "NO_EXISTE") {
      await fila.getByRole("button", { name: "Mandar a aprobar" }).click();
      await pp.waitForTimeout(8000);
      await pp.goto("https://peludesk.mx/plataforma/plantillas-whatsapp", { waitUntil: "networkidle" });
      estado = await pp.locator('[data-plantilla="peludesk_cita_sugerida_v1"]').getAttribute("data-estado").catch(() => null);
    }
    const perdida = await pp.locator('[data-plantilla="peludesk_mascota_perdida_v1"]').getAttribute("data-estado").catch(() => null);
    if (!estado || estado === "NO_EXISTE") hallazgo(`peludesk_cita_sugerida_v1: ${estado ?? "no aparece en la lista"}`);
    else bien(`peludesk_cita_sugerida_v1: ${estado} · peludesk_mascota_perdida_v1: ${perdida}`);
    await ctxP.close();
  }
} finally {
  await nav.close();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ App para dueños en producción: todo en orden.");
process.exit(hallazgos.length ? 1 : 0);
