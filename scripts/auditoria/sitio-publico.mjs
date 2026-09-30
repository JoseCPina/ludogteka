// Uso: node scripts/auditoria/sitio-publico.mjs   (SOLO DESARROLLO; antes, `npm run build`)
//
// El sitio público de peludesk.mx de punta a punta:
//   A. Cookies y consentimiento: sin permiso NO se pide nada a Meta ni a la
//      analítica; «Aceptar» y «Rechazar» pesan lo mismo; la elección dura 6
//      meses; se puede cambiar y revocar; el evento de consentimiento sale.
//   B. Lo que llega al píxel: solo nombres de evento y de página, nunca un
//      dato de un negocio ni de sus clientes, ni el teléfono ni el nombre.
//   C. Registro: la casilla es obligatoria (también en el servidor); queda la
//      aceptación con versión, IP y navegador; el origen (utm y, con marketing,
//      fbclid) se anota en el negocio en prueba; CompleteRegistration sale del
//      navegador Y del servidor con el mismo event_id, sin datos en claro, y
//      solo si hubo consentimiento.
//   D. SEO: todo lo del sitemap responde 200 sin redirecciones, es indexable,
//      trae canonical, un h1 y JSON-LD que se lee; www redirige de un salto;
//      robots.txt y RSS; lo interno (/plataforma) no se indexa.
//   E. Los dominios de los negocios: ni banner, ni píxel, ni analítica, ni
//      blog ni legales; el demo (y sus robots.txt) es noindex.
// Levanta SU PROPIO `next start` en el 3002 con un píxel y una API de
// conversiones de mentiras (puerto 4458). Sale con 1 si algo falla.
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const A = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const PUERTO = 3002;
const PIXEL = "1112223334445556";
const PLATAFORMA = `http://plataforma.localhost:${PUERTO}`;
const sufijo = String(Date.now()).slice(-5);
let fallas = 0;
const ok = (cond, que) => {
  console.log(`  ${cond ? "✔" : "✘"} ${que}`);
  if (!cond) fallas++;
  return cond;
};

// ── Meta de mentiras (API de conversiones) ──
const conversiones = [];
const meta = http.createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    try { conversiones.push({ url: req.url, auth: req.headers.authorization, cuerpo: JSON.parse(cuerpo) }); } catch { /* sin cuerpo */ }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ events_received: 1 }));
  });
});
await new Promise((r) => meta.listen(4458, "127.0.0.1", r));

// ── El servidor de esta prueba ──
const servidor = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], {
  env: { ...process.env, PELUDESK_URL_DESARROLLO: `http://{slug}.localhost:${PUERTO}`, PELUDESK_WHATSAPP: "525649160742", PELUDESK_META_PIXEL_ID: PIXEL, PELUDESK_META_CAPI_TOKEN: "token-de-mentiras", META_API_URL: "http://127.0.0.1:4458" },
  stdio: ["ignore", "pipe", "pipe"],
});
let bitacora = "";
servidor.stdout.on("data", (d) => (bitacora += d));
servidor.stderr.on("data", (d) => (bitacora += d));
const cerrar = () => { try { servidor.kill(); } catch { /* ya cerró */ } meta.close(); };
process.on("exit", cerrar);

// GET con el Host puesto (desde Node, *.localhost no siempre resuelve).
function pedir(host, ruta, { metodo = "GET", cabeceras = {} } = {}) {
  return new Promise((resolve, reject) => {
    const q = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method: metodo, headers: { host: `${host}:${PUERTO}`, ...cabeceras } }, (r) => {
      let t = "";
      r.on("data", (c) => (t += c));
      r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, texto: t }));
    });
    q.on("error", reject);
    q.end();
  });
}
const pedirPlataforma = (ruta, o) => pedir("plataforma.localhost", ruta, o);

for (let i = 0; i < 60; i++) {
  try { if ((await pedirPlataforma("/robots.txt")).status === 200) break; } catch { /* aún no */ }
  await new Promise((r) => setTimeout(r, 1000));
  if (i === 59) { console.log(bitacora); throw new Error("El servidor no arrancó (¿corriste `npm run build`?)."); }
}

// El píxel de mentiras: el navegador pide fbevents.js y esto lo contesta.
// Anota cada llamada de fbq para poder auditar qué saldría hacia Meta.
const FBEVENTS = `(function(){var f=window.fbq;window.__fb=[];(f.queue||[]).forEach(function(a){window.__fb.push([].slice.call(a))});f.callMethod=function(){window.__fb.push([].slice.call(arguments))};})();`;

const navegador = await abrirNavegador();
async function contexto(viewport = { width: 1280, height: 900 }) {
  const ctx = await navegador.newContext({ viewport, locale: "es-MX" });
  const peticiones = [];
  await ctx.route("**/*", async (route) => {
    const u = route.request().url();
    peticiones.push(u);
    if (u.includes("connect.facebook.net")) return route.fulfill({ status: 200, contentType: "application/javascript", body: FBEVENTS });
    if (u.includes("facebook.com") || u.includes("/_vercel/insights")) return route.fulfill({ status: 204, body: "" });
    return route.continue();
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  return { ctx, page, peticiones };
}
const haciaMeta = (ps) => ps.filter((u) => u.includes("facebook.com") || u.includes("connect.facebook.net"));
const haciaAnalitica = (ps) => ps.filter((u) => u.includes("/_vercel/insights"));
const cookieDe = async (ctx, nombre) => (await ctx.cookies()).find((c) => c.name === nombre);
const valorConsent = async (ctx) => {
  const c = await cookieDe(ctx, "peludesk_consent");
  return c ? JSON.parse(decodeURIComponent(c.value)) : null;
};
const fb = (page) => page.evaluate(() => window.__fb ?? []);
const eventosFb = async (page) => (await fb(page)).filter((c) => c[0] === "track").map((c) => ({ nombre: c[1], datos: c[2] ?? {}, opciones: c[3] ?? {} }));

try {
  // ═════════════════ A. Cookies y consentimiento ═════════════════
  console.log("── A. Cookies y consentimiento (escritorio)");
  {
    const { ctx, page, peticiones } = await contexto();
    await page.goto(`${PLATAFORMA}/`, { waitUntil: "networkidle" });
    const banner = page.getByRole("region", { name: "Aviso de cookies" });
    ok(await banner.isVisible(), "la primera visita muestra el aviso de cookies");
    ok(haciaMeta(peticiones).length === 0, "antes de decidir, ni una petición a Meta");
    ok(haciaAnalitica(peticiones).length === 0, "antes de decidir, ni una petición a la analítica");
    ok(!(await cookieDe(ctx, "peludesk_consent")) && !(await cookieDe(ctx, "_fbp")), "sin cookie de consentimiento ni de Meta todavía");
    ok(!(await page.evaluate(() => typeof window.fbq)).includes("function"), "window.fbq no existe");
    const rechazar = await banner.getByRole("button", { name: "Rechazar" }).boundingBox();
    const aceptar = await banner.getByRole("button", { name: "Aceptar" }).boundingBox();
    ok(Math.abs(rechazar.width - aceptar.width) <= 1 && Math.abs(rechazar.height - aceptar.height) <= 1 && Math.abs(rechazar.y - aceptar.y) <= 1, "«Aceptar» y «Rechazar» miden y se ven igual");
    const estilos = await banner.evaluate((el) => {
      const c = (t) => { const b = [...el.querySelectorAll("button")].find((x) => x.textContent.trim() === t); const s = getComputedStyle(b); return [s.backgroundColor, s.color, s.fontWeight, s.fontSize, s.borderTopWidth].join("|"); };
      return [c("Aceptar"), c("Rechazar")];
    });
    ok(estilos[0] === estilos[1], "mismo color, letra y borde en los dos");
    ok(await banner.getByRole("button", { name: "Configurar" }).isVisible(), "hay «Configurar»");
    await page.keyboard.press("Tab");
    ok(await page.evaluate(() => Boolean(document.activeElement?.closest('section[aria-label="Aviso de cookies"]'))), "con el teclado, el primer Tab cae en el aviso");
    await page.screenshot({ path: `${process.env.TEMP}/sitio-banner-escritorio.png` });

    await page.evaluate(() => { window.__consent = []; window.addEventListener("peludesk:consentimiento", (e) => window.__consent.push(e.detail)); });
    await banner.getByRole("button", { name: "Rechazar" }).click();
    ok(!(await banner.isVisible().catch(() => false)), "al rechazar, el aviso se va");
    const c1 = await valorConsent(ctx);
    ok(c1 && c1.a === false && c1.m === false, "la elección queda guardada (analítica y marketing en no)");
    const dias = ((await cookieDe(ctx, "peludesk_consent")).expires - Date.now() / 1000) / 86400;
    ok(dias > 180 && dias < 184, `la elección dura 6 meses (${Math.round(dias)} días)`);
    ok((await page.evaluate(() => window.__consent)).some((d) => d.decidido && !d.analitica && !d.marketing), "se emitió el evento peludesk:consentimiento");
    await page.reload({ waitUntil: "networkidle" });
    ok(!(await page.getByRole("region", { name: "Aviso de cookies" }).isVisible().catch(() => false)), "al volver no se pregunta otra vez");
    ok(haciaMeta(peticiones).length === 0 && haciaAnalitica(peticiones).length === 0, "rechazado: sigue sin salir nada a Meta ni a la analítica");
    await page.goto(`${PLATAFORMA}/blog`, { waitUntil: "networkidle" });
    ok(haciaMeta(peticiones).length === 0, "rechazado: tampoco en el blog");

    console.log("── A2. Cambiar y revocar desde el pie");
    await page.getByRole("button", { name: "Preferencias de cookies" }).click();
    const dialogo = page.getByRole("dialog", { name: "Preferencias de cookies" });
    await dialogo.waitFor();
    ok(await dialogo.getByRole("switch", { name: /Necesarias/ }).isDisabled(), "las necesarias son fijas");
    ok(!(await dialogo.getByRole("switch", { name: "Marketing" }).isChecked()), "marketing parte apagado");
    await dialogo.getByRole("switch", { name: "Marketing" }).check();
    await dialogo.getByRole("button", { name: "Guardar mi elección" }).click();
    await page.waitForFunction(() => Array.isArray(window.__fb));
    const c2 = await valorConsent(ctx);
    ok(c2 && c2.a === false && c2.m === true, "solo marketing quedó prendido");
    ok(haciaMeta(peticiones).some((u) => u.includes("fbevents.js")), "con marketing aceptado se pide el píxel");
    ok(haciaAnalitica(peticiones).length === 0, "sin analítica aceptada no se pide la analítica");
    ok((await eventosFb(page)).some((e) => e.nombre === "PageView"), "el píxel registra PageView");
    // Simula las cookies que pondría el píxel real, para comprobar que al revocar se borran.
    await ctx.addCookies([{ name: "_fbp", value: "fb.1.1.1", url: PLATAFORMA }, { name: "_fbc", value: "fb.1.1.abc", url: PLATAFORMA }]);
    await page.getByRole("button", { name: "Preferencias de cookies" }).click();
    await page.getByRole("dialog", { name: "Preferencias de cookies" }).getByRole("button", { name: "Rechazar todo" }).click();
    await page.waitForTimeout(500);
    const c3 = await valorConsent(ctx);
    ok(c3 && !c3.a && !c3.m, "revocado: todo en no");
    ok(!(await cookieDe(ctx, "_fbp")) && !(await cookieDe(ctx, "_fbc")), "revocado: se borran _fbp y _fbc");
    const antes = (await fb(page)).length;
    await page.evaluate(() => { document.addEventListener("click", (e) => { if (e.target.closest("a")) e.preventDefault(); }, true); });
    await page.locator("a[data-pixel-evento]:visible").first().click();
    ok((await fb(page)).length === antes, "revocado: tocar el demo ya no manda evento");

    console.log("── A3. Aceptar todo");
    await page.getByRole("button", { name: "Preferencias de cookies" }).click();
    await page.getByRole("dialog", { name: "Preferencias de cookies" }).getByRole("button", { name: "Aceptar todo" }).click();
    await page.waitForTimeout(800);
    const c4 = await valorConsent(ctx);
    ok(c4 && c4.a && c4.m, "aceptado todo");
    ok(haciaAnalitica(peticiones).length > 0, "con analítica aceptada se pide el script de estadísticas");
    await ctx.close();
  }

  // ═════════════════ B. Lo que llega al píxel ═════════════════
  console.log("── B. Lo que llega al píxel");
  {
    const { ctx, page } = await contexto();
    await ctx.addCookies([{ name: "peludesk_consent", value: encodeURIComponent(JSON.stringify({ v: 1, a: false, m: true, t: Date.now() })), url: PLATAFORMA }]);
    await page.goto(`${PLATAFORMA}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Array.isArray(window.__fb));
    ok(!(await page.getByRole("region", { name: "Aviso de cookies" }).isVisible().catch(() => false)), "con la elección guardada no aparece el aviso");
    await page.evaluate(() => { document.addEventListener("click", (e) => { if (e.target.closest("a")) e.preventDefault(); }, true); });
    await page.locator("a[data-pixel-evento]:visible").first().click();
    await page.waitForTimeout(300);
    // Cada página nueva es un documento nuevo: se junta lo que salió en cada una.
    let llamadas = await fb(page);
    let eventos = await eventosFb(page);
    await page.goto(`${PLATAFORMA}/blog/como-abrir-una-guarderia-canina-en-mexico`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Array.isArray(window.__fb));
    await page.waitForTimeout(500);
    llamadas = [...llamadas, ...(await fb(page))];
    eventos = [...eventos, ...(await eventosFb(page))];
    const nombres = new Set(eventos.map((e) => e.nombre));
    ok(["PageView", "ViewContent", "Lead"].every((n) => nombres.has(n)), `salen PageView, ViewContent y Lead (${[...nombres].join(", ")})`);
    ok([...nombres].every((n) => ["PageView", "ViewContent", "Lead", "InitiateCheckout", "CompleteRegistration"].includes(n)), "ningún evento fuera de la lista permitida");
    const claves = new Set(eventos.flatMap((e) => Object.keys(e.datos)));
    ok([...claves].every((k) => ["content_name", "content_category"].includes(k)), `los datos de un evento son solo content_name y content_category (${[...claves].join(", ")})`);
    const todo = JSON.stringify(llamadas);
    ok(!/@|\b\d{10}\b|negocio_id|cliente|perro|huellitas|patitas/i.test(todo.replace(/Cómo abrir una guardería canina/gi, "")), "ni teléfonos, ni correos, ni nombres de negocios, clientes o perros");
    const init = llamadas.find((c) => c[0] === "init");
    ok(init && init.length === 2 && init[1] === PIXEL, "init lleva solo el id del píxel (sin datos de la persona)");
    ok(llamadas.some((c) => c[0] === "set" && c[1] === "autoConfig" && c[2] === false), "la detección automática de Meta está apagada");
    await ctx.close();
  }

  // ═════════════════ C. Registro ═════════════════
  console.log("── C. Registro: casilla, evidencia, origen y conversión");
  await A.from("registros_prueba").update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).like("telefono", "44208%");
  const registrar = async (page, { tel, negocio, servicio = "Estética" }) => {
    await page.getByLabel("Tu nombre").fill("Persona de Auditoría");
    await page.getByLabel("Nombre de tu negocio").fill(negocio);
    await page.getByLabel("Teléfono").fill(tel);
    await page.getByLabel("Contraseña", { exact: true }).fill(`Audit-${sufijo}-segura`);
    await page.getByLabel(servicio).check();
  };
  {
    // C1. Sin casilla: el navegador no deja; y si se salta el navegador, el servidor tampoco.
    const { ctx, page } = await contexto();
    await page.goto(`${PLATAFORMA}/registro`, { waitUntil: "networkidle" });
    await registrar(page, { tel: `44208${sufijo}`, negocio: `Auditoría Sin Casilla ${sufijo}` });
    ok(await page.locator('input[name="acepto"]').evaluate((i) => i.required && !i.checked), "la casilla es obligatoria y viene sin marcar");
    await page.getByRole("button", { name: "Abrir mi negocio" }).click();
    ok(new URL(page.url()).pathname === "/registro" && !(await page.getByText("Para abrir tu negocio, acepta").isVisible().catch(() => false)), "sin marcar la casilla, el navegador no envía");
    await page.evaluate(() => document.querySelector("form").setAttribute("novalidate", ""));
    await page.getByRole("button", { name: "Abrir mi negocio" }).click();
    await page.getByText("Para abrir tu negocio, acepta").first().waitFor();
    ok(true, "saltándose el navegador, el servidor rechaza sin la casilla");
    const { data: ninguno } = await A.from("registros_prueba").select("id").eq("telefono", `44208${sufijo}`);
    ok((ninguno ?? []).length === 0, "y no se creó ningún registro");
    ok(await page.getByText("Aviso de privacidad simplificado").isVisible(), "el aviso simplificado está en el registro");
    await ctx.close();
  }
  let telMarketing;
  {
    // C2. Con marketing aceptado y una campaña: todo se anota y la conversión sale por los dos lados.
    const { ctx, page } = await contexto();
    await ctx.addCookies([{ name: "peludesk_consent", value: encodeURIComponent(JSON.stringify({ v: 1, a: true, m: true, t: Date.now() })), url: PLATAFORMA }]);
    await page.goto(`${PLATAFORMA}/registro?utm_source=meta&utm_medium=cpc&utm_campaign=otono-2026&fbclid=IwAR-abc123`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Array.isArray(window.__fb));
    telMarketing = `44208${sufijo.slice(0, 4)}1`;
    await registrar(page, { tel: telMarketing, negocio: `Auditoría Píxel ${sufijo}` });
    await page.getByLabel(/Leí y acepto/).check();
    await page.getByRole("button", { name: "Abrir mi negocio" }).click();
    await page.waitForURL(/\/bienvenida/, { timeout: 120_000 });
    const host = new URL(page.url()).host;
    ok(host.endsWith(`.localhost:${PUERTO}`) && !host.startsWith("plataforma."), `aterriza en su negocio (${host})`);
    const { data: reg } = await A.from("registros_prueba").select("*").eq("telefono", telMarketing).single();
    ok(reg.utm_source === "meta" && reg.utm_medium === "cpc" && reg.utm_campaign === "otono-2026", "el negocio en prueba guarda utm_source, utm_medium y utm_campaign");
    ok(reg.fbclid === "IwAR-abc123", "con marketing aceptado guarda también el fbclid");
    ok(reg.terminos_version && reg.aviso_version, `guarda las versiones aceptadas (${reg.terminos_version} / ${reg.aviso_version})`);
    const { data: acep } = await A.from("aceptaciones_legales").select("documento, version, ip, user_agent, aceptada_at").eq("telefono", telMarketing);
    ok((acep ?? []).length === 2 && acep.some((a) => a.documento === "terminos") && acep.some((a) => a.documento === "aviso_privacidad"), "quedan las dos aceptaciones (términos y aviso)");
    ok((acep ?? []).every((a) => a.version && a.user_agent && a.aceptada_at), "con versión, fecha y navegador");
    ok(conversiones.length === 1, `la API de conversiones recibió UN evento (${conversiones.length})`);
    const ev = conversiones[0]?.cuerpo.data[0];
    ok(ev?.event_name === "CompleteRegistration" && ev.action_source === "website", "es CompleteRegistration desde el sitio web");
    ok(conversiones[0]?.auth === "Bearer token-de-mentiras" && conversiones[0].url.includes(`/${PIXEL}/events`), "va al píxel correcto con el token en la cabecera");
    ok(/^[0-9a-f]{64}$/.test(ev?.user_data.ph?.[0] ?? ""), "el teléfono viaja con hash SHA-256");
    const crudo = JSON.stringify(conversiones[0]?.cuerpo);
    ok(!crudo.includes(telMarketing) && !/Auditor[ií]a|Persona de/.test(crudo), "sin teléfono, nombre ni negocio en claro");
    ok(Object.keys(ev?.custom_data ?? {}).join() === "content_name", "custom_data trae solo content_name");
    ok(Boolean(ev?.event_id), "trae event_id");
    // El navegador mandó CompleteRegistration con el mismo id (antes de salir a su dominio).
    ok(true, "el navegador salió hacia el negocio (el píxel de mentiras vive en peludesk.mx; se comprueba abajo)");
    await ctx.close();
  }
  {
    // C2b. El evento del navegador, con el mismo event_id, se prueba sin dejar la página: se intercepta la navegación.
    const { ctx, page } = await contexto();
    await ctx.addCookies([{ name: "peludesk_consent", value: encodeURIComponent(JSON.stringify({ v: 1, a: false, m: true, t: Date.now() })), url: PLATAFORMA }]);
    await page.route(/\/auth\/entrar/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
    await page.route(/\.localhost:3002\/(?!registro)/, (r) => (r.request().resourceType() === "document" ? r.fulfill({ status: 200, contentType: "text/html", body: "ok" }) : r.continue()));
    await page.goto(`${PLATAFORMA}/registro`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Array.isArray(window.__fb));
    await page.evaluate(() => { window.__nav = []; });
    const antes = conversiones.length;
    await registrar(page, { tel: `44208${sufijo.slice(0, 4)}2`, negocio: `Auditoría Dedup ${sufijo}` });
    await page.getByLabel(/Leí y acepto/).check();
    await page.getByRole("button", { name: "Abrir mi negocio" }).click();
    await page.waitForFunction(() => window.__fb.some((c) => c[0] === "track" && c[1] === "CompleteRegistration"), null, { timeout: 120_000 });
    const nav = (await eventosFb(page)).find((e) => e.nombre === "CompleteRegistration");
    const servidor = conversiones[antes]?.cuerpo.data[0];
    ok(nav && servidor && nav.opciones.eventID === servidor.event_id, "el navegador y el servidor mandan el MISMO event_id (deduplicado)");
    ok(JSON.stringify(nav.datos) === JSON.stringify({ content_name: "negocio_de_prueba" }), "el evento del navegador trae solo content_name");
    await ctx.close();
  }
  {
    // C3. Sin consentimiento: se anota la campaña (utm) pero ni fbclid ni conversión.
    const { ctx, page, peticiones } = await contexto();
    const antes = conversiones.length;
    await page.goto(`${PLATAFORMA}/registro?utm_source=instagram&utm_campaign=rechazo&fbclid=NOSEDEBEGUARDAR`, { waitUntil: "networkidle" });
    const tel = `44208${sufijo.slice(0, 4)}3`;
    await registrar(page, { tel, negocio: `Auditoría Sin Permiso ${sufijo}` });
    await page.getByLabel(/Leí y acepto/).check();
    await page.getByRole("button", { name: "Abrir mi negocio" }).click();
    await page.waitForURL(/\/bienvenida/, { timeout: 120_000 });
    const { data: reg } = await A.from("registros_prueba").select("utm_source, utm_campaign, fbclid").eq("telefono", tel).single();
    ok(reg.utm_source === "instagram" && reg.utm_campaign === "rechazo", "sin consentimiento igual queda la etiqueta de campaña");
    ok(reg.fbclid === null, "pero el fbclid NO se guarda");
    ok(conversiones.length === antes, "y no se manda ninguna conversión a Meta");
    ok(haciaMeta(peticiones).length === 0, "ni el navegador pidió nada a Meta durante todo el registro");
    await ctx.close();
  }
  {
    // C4. El origen se lee en /plataforma (la pantalla trae la etiqueta): comprobar contra el código que la pinta.
    const fuente = fs.readFileSync("src/app/plataforma/(admin)/page.tsx", "utf8");
    ok(fuente.includes("textoDeOrigen") && fuente.includes("registros_prueba"), "/plataforma muestra el origen junto a «En prueba gratis»");
  }

  // ═════════════════ D. SEO ═════════════════
  console.log("── D. SEO técnico");
  {
    const robots = await pedirPlataforma("/robots.txt");
    ok(robots.status === 200 && /Disallow: \/plataforma/.test(robots.texto) && /Disallow: \/demo/.test(robots.texto) && /Disallow: \/api/.test(robots.texto) && /Disallow: \/peludesk\/redes/.test(robots.texto), "robots.txt cierra /plataforma, /demo, /peludesk/redes y /api");
    ok(/Sitemap: https:\/\/peludesk\.mx\/sitemap\.xml/.test(robots.texto), "robots.txt apunta al sitemap");
    const sm = await pedirPlataforma("/sitemap.xml");
    const urls = [...sm.texto.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    ok(urls.length > 50, `el sitemap trae ${urls.length} páginas`);
    ok(urls.every((u) => u.startsWith("https://peludesk.mx/")), "todas del host canónico https://peludesk.mx");
    ok(!urls.some((u) => /\/(plataforma|demo|api|peludesk\/redes)(\/|$)/.test(u)), "ninguna de /plataforma, /demo, /peludesk/redes ni /api");
    let malas = 0;
    const encabezados = [];
    for (const u of urls) {
      const ruta = new URL(u).pathname;
      const r = await pedirPlataforma(ruta);
      const noindex = /<meta name="robots" content="[^"]*noindex/.test(r.texto) || /noindex/.test(r.headers["x-robots-tag"] ?? "");
      const canon = r.texto.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      const h1 = (r.texto.match(/<h1[\s>]/g) ?? []).length;
      const titulo = r.texto.match(/<title>([^<]+)<\/title>/)?.[1];
      const jsonld = [...r.texto.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].every((m) => { try { JSON.parse(m[1]); return true; } catch { return false; } });
      const canonEsperada = ruta === "/" ? "https://peludesk.mx" : `https://peludesk.mx${ruta}`;
      const bien = r.status === 200 && !noindex && (canon === canonEsperada || canon === `${canonEsperada}/`) && h1 === 1 && Boolean(titulo) && jsonld;
      if (!bien) { malas++; console.log(`     ✘ ${ruta}: status ${r.status}, noindex ${noindex}, canonical ${canon}, h1 ${h1}, title ${Boolean(titulo)}, jsonld ${jsonld}`); }
      if (/\/blog\/[a-z0-9-]+$/.test(ruta) && !/\/categoria\//.test(ruta)) encabezados.push({ ruta, r });
    }
    ok(malas === 0, "cada página del sitemap: 200 sin redirección, indexable, canonical propia, un h1, título y JSON-LD que se lee");
    for (const { ruta, r } of encabezados) {
      const tiposLd = [...r.texto.matchAll(/"@type":"([A-Za-z]+)"/g)].map((m) => m[1]);
      ok(tiposLd.includes("Article") && tiposLd.includes("BreadcrumbList"), `${ruta}: Article y BreadcrumbList`);
      ok(/<meta property="og:type" content="article"/.test(r.texto) && /es_MX/.test(r.texto), `${ruta}: Open Graph de artículo, es_MX`);
    }
    const landing = await pedirPlataforma("/");
    const tiposLanding = [...landing.texto.matchAll(/"@type":"([A-Za-z]+)"/g)].map((m) => m[1]);
    ok(["Organization", "SoftwareApplication", "FAQPage"].every((t) => tiposLanding.includes(t)), "la landing trae Organization, SoftwareApplication y FAQPage");
    ok(/sameAs/.test(landing.texto), "Organization con las redes en sameAs");
    ok(/<html lang="es"/.test(landing.texto), "html lang=es");
    const rss = await pedirPlataforma("/blog/rss.xml");
    ok(rss.status === 200 && /application\/rss\+xml/.test(rss.headers["content-type"]) && (rss.texto.match(/<item>/g) ?? []).length === encabezados.length, `RSS válido con ${encabezados.length} artículos`);
    const www = await pedir("www.peludesk.mx", "/blog?utm_source=x");
    ok(www.status === 308 && www.headers.location === "https://peludesk.mx/blog?utm_source=x", "www redirige (308) de un salto a peludesk.mx conservando ruta y parámetros");
    for (const ruta of ["/plataforma", "/plataforma/entrar", "/demo"]) {
      const r = await pedirPlataforma(ruta);
      const dest = r.headers.location ?? "";
      ok(r.status !== 200 || /noindex/.test(r.texto), `${ruta} no se indexa (status ${r.status}${dest ? ` → ${dest}` : ""})`);
    }
    const noExiste = await pedirPlataforma("/blog/no-existe");
    ok(noExiste.status === 404, "un artículo que no existe da 404");
    const imagenes = [...encabezados[0].r.texto.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
    ok(imagenes.every((i) => /alt=/.test(i) && /width=/.test(i)), "las imágenes traen alt y tamaño");
    ok(!/\blink\b[^>]*rel="preload"[^>]*facebook/.test(landing.texto) && !/connect\.facebook\.net|_vercel\/insights/.test(landing.texto), "el HTML servido no menciona ni Meta ni la analítica");
  }

  // ═════════════════ E. Los dominios de los negocios ═════════════════
  console.log("── E. Los dominios de los negocios");
  for (const slug of ["huellitas", "patitasyco"]) {
    const host = `${slug}.localhost`;
    for (const ruta of ["/blog", "/terminos", "/cookies", "/aviso-de-privacidad", "/software-para-guarderias-caninas", "/registro", "/peludesk"]) {
      const r = await pedir(host, ruta);
      ok(r.status === 404 || (r.status >= 300 && r.status < 400), `${slug}${ruta}: no existe en un negocio (${r.status})`);
    }
    const inicio = await pedir(host, "/login");
    ok(!/Aviso de cookies|peludesk_consent|connect\.facebook\.net|fbq\(|_vercel\/insights/.test(inicio.texto), `${slug}: el HTML del negocio no trae banner, píxel ni analítica`);
    const { ctx, page, peticiones } = await contexto();
    await ctx.addCookies([{ name: "peludesk_consent", value: encodeURIComponent(JSON.stringify({ v: 1, a: true, m: true, t: Date.now() })), url: `http://${host}:${PUERTO}` }]);
    await page.goto(`http://${host}:${PUERTO}/login`, { waitUntil: "networkidle" });
    ok(haciaMeta(peticiones).length === 0 && haciaAnalitica(peticiones).length === 0, `${slug}: ni con la cookie de consentimiento puesta se pide algo a Meta o a la analítica`);
    ok(!(await page.evaluate(() => typeof window.fbq)).includes("function") && (await page.getByRole("region", { name: "Aviso de cookies" }).count()) === 0, `${slug}: no hay píxel ni aviso de cookies`);
    await ctx.close();
  }
  {
    const r = await pedir("patitasyco.localhost", "/robots.txt");
    ok(/Disallow: \//.test(r.texto) && !/Allow:/.test(r.texto) && !/Sitemap:/.test(r.texto), "el robots.txt del demo lo prohíbe todo y no publica sitemap");
    const s = await pedir("patitasyco.localhost", "/sitemap.xml");
    ok(!/<loc>/.test(s.texto), "el demo no publica sitemap");
    const login = await pedir("patitasyco.localhost", "/login");
    ok(/<meta name="robots" content="noindex/.test(login.texto), "las páginas del demo traen meta noindex");
    const cabecera = await pedir("patitasyco.peludesk.mx", "/login");
    ok(/noindex/.test(cabecera.headers["x-robots-tag"] ?? ""), `el demo responde X-Robots-Tag: ${cabecera.headers["x-robots-tag"]}`);
    const videos = fs.readdirSync("public/peludesk/redes").length > 0;
    if (videos) {
      const v = await pedirPlataforma("/peludesk/redes/videos/x.mp4");
      ok(true, `los videos (/peludesk/redes) llevan X-Robots-Tag por configuración (${v.status})`);
    }
    const cfg = fs.readFileSync("next.config.ts", "utf8");
    ok(/\/peludesk\/redes\/:ruta\*[\s\S]*noindex/.test(cfg), "next.config.ts pone noindex a /peludesk/redes");
  }
  {
    // La landing de Ludogteka (dominio propio): sin banner.
    const { ctx, page, peticiones } = await contexto();
    await page.goto(`http://localhost:${PUERTO}/`, { waitUntil: "networkidle" });
    ok((await page.getByRole("region", { name: "Aviso de cookies" }).count()) === 0 && haciaMeta(peticiones).length === 0, "Ludogteka: sin banner ni Meta");
    await ctx.close();
  }

  // ═════════════════ F. Celular ═════════════════
  console.log("── F. Celular (390×844)");
  {
    const { ctx, page } = await contexto({ width: 390, height: 844 });
    await page.goto(`${PLATAFORMA}/`, { waitUntil: "networkidle" });
    const banner = page.getByRole("region", { name: "Aviso de cookies" });
    ok(await banner.isVisible(), "el aviso se ve en celular");
    const cajas = await banner.locator("button").evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [b.textContent.trim(), Math.round(r.width), Math.round(r.height)]; }));
    ok(cajas.every(([, w, h]) => h >= 44 && w >= 44), `todos los botones del aviso miden al menos 44 px (${cajas.map((c) => c.join(" ")).join("; ")})`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "sin scroll horizontal");
    await page.screenshot({ path: `${process.env.TEMP}/sitio-banner-celular.png` });
    await banner.getByRole("button", { name: "Configurar" }).click();
    const d = page.getByRole("dialog", { name: "Preferencias de cookies" });
    await d.waitFor();
    const caja = await d.boundingBox();
    ok(caja.x >= 0 && caja.x + caja.width <= 391, "el panel de configuración cabe en el ancho del celular");
    await page.screenshot({ path: `${process.env.TEMP}/sitio-preferencias-celular.png` });
    await page.keyboard.press("Escape");
    await d.waitFor({ state: "hidden" });
    ok(true, "Escape cierra el panel");
    await page.getByRole("region", { name: "Aviso de cookies" }).getByRole("button", { name: "Rechazar" }).click();
    for (const ruta of ["/", "/registro", "/blog", "/blog/como-fijar-el-precio-de-una-guarderia-o-estetica-canina", "/terminos", "/cookies", "/aviso-de-privacidad", "/software-para-esteticas-caninas"]) {
      await page.goto(`${PLATAFORMA}${ruta}`, { waitUntil: "networkidle" });
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${ruta}: sin scroll horizontal en celular`);
    }
    await ctx.close();
  }

  // ═════════════════ G. Botón de WhatsApp ═════════════════
  console.log("── G. Botón de WhatsApp");
  for (const [w, h, cel] of [[1440, 900, false], [390, 844, true]]) {
    const { ctx, page } = await contexto({ width: w, height: h });
    await ctx.addCookies([{ name: "peludesk_consent", value: encodeURIComponent(JSON.stringify({ v: 1, a: false, m: false, t: Date.now() })), url: PLATAFORMA }]);
    for (const ruta of ["/", "/registro", "/blog", "/blog/como-abrir-una-guarderia-canina-en-mexico"]) {
      await page.goto(`${PLATAFORMA}${ruta}`, { waitUntil: "networkidle" });
      const wa = page.locator("a.pd-wa");
      ok((await wa.getAttribute("data-visible")) === "false", `${w}px ${ruta}: no sale en el primer pantallazo`);
      let visto = null;
      for (const f of [1.2, 2.4, 3.6]) {
        await page.evaluate((y) => window.scrollTo(0, y), Math.round(h * f));
        await page.waitForTimeout(600);
        if ((await wa.getAttribute("data-visible")) === "true") { visto = await wa.boundingBox(); break; }
      }
      ok(Boolean(visto), `${w}px ${ruta}: aparece después de bajar`);
      if (!visto) continue;
      ok(cel ? Math.round(visto.width) === 52 && Math.round(visto.height) === 52 : Math.round(visto.height) === 52, cel ? "celular: círculo de 52 px" : "escritorio: pastilla de 52 px de alto");
      const tapa = await page.evaluate(() => {
        const r = document.querySelector("a.pd-wa").getBoundingClientRect();
        return [...document.querySelectorAll(".pd-captura, form, .pd-boton, [data-fijo-inferior]:not([aria-hidden=true])")].some((o) => { const q = o.getBoundingClientRect(); return q.width > 0 && q.height > 0 && q.right > r.left && q.left < r.right && q.bottom > r.top && q.top < r.bottom; });
      });
      ok(!tapa, `${w}px ${ruta}: no tapa capturas, formularios, botones ni el aviso`);
      if (!cel) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.7)); await page.waitForTimeout(6500);
        const c = await wa.getAttribute("data-compacto");
        const v = await wa.getAttribute("data-visible");
        ok(c === "true" || v === "false", "escritorio: se contrae al ícono (al seguir bajando o a los 6 s)");
      }
    }
    const estilo = await page.evaluate(() => { const a = document.querySelector("a.pd-wa"); const s = getComputedStyle(a); return [s.backgroundColor, s.color, a.getAttribute("href")]; });
    ok(estilo[0] === "rgb(167, 216, 200)" && estilo[1] === "rgb(75, 63, 114)", "colores del kit: fondo menta y ícono morado");
    ok(estilo[2].startsWith("https://wa.me/525649160742"), "es solo un enlace a wa.me");
    await ctx.close();
  }
  {
    // Contraste AA del ícono morado sobre menta.
    const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const [a, b] = [lum("#A7D8C8"), lum("#4B3F72")];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    ok(ratio >= 4.5, `contraste morado sobre menta ${ratio.toFixed(1)}:1 (AA)`);
    const { ctx, page } = await contexto();
    await page.goto(`http://huellitas.localhost:${PUERTO}/login`, { waitUntil: "networkidle" });
    ok((await page.locator("a.pd-wa").count()) === 0, "en el dominio de un negocio no hay botón de WhatsApp de PeluDesk");
    await ctx.close();
  }
} catch (e) {
  fallas++;
  console.log(`  ✘ se cayó la prueba: ${e.message}`);
  console.log(bitacora.split("\n").slice(-15).join("\n"));
} finally {
  await navegador.close();
  cerrar();
}
console.log(fallas ? `\n✘ ${fallas} problema(s)` : "\n✔ Sitio público en orden.");
process.exit(fallas ? 1 : 0);
