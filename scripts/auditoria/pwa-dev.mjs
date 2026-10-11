// App instalable (PWA) y modo de solo lectura sin conexión (SOLO DESARROLLO, en Huellitas).
//
//   node scripts/auditoria/pwa-dev.mjs        (necesita `npm run build`)
//
// Levanta `next start` en el 3006 y prueba, con el service worker REAL en Chromium:
//  1. El manifiesto de cada negocio (nombre, color, íconos, standalone) y que cambia por
//     dominio; el ícono con el logo del negocio (o su inicial); instalable según Chromium.
//  2. El service worker y la pantalla «sin conexión» son públicos y no llevan datos.
//  3. Lo que se guarda para ver sin conexión: SOLO el tablero del día, la agenda de estética
//     y la ficha de un cliente y de una mascota ya abiertas; nada de caja, API ni POST.
//  4. Sin conexión: el aviso, las pantallas guardadas se ven, las demás muestran «sin
//     conexión», y NADA se escribe (un formulario y una acción se detienen antes de salir).
//  5. Al volver la conexión el aviso se va; al cerrar sesión o entrar otra persona, la
//     copia se borra; un cliente del portal no ve pantallas del personal.
// Sale con 1 si algo falla.
import { spawn } from "node:child_process";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, B, SB, URL, env, personas, comprobar, hallazgo, seccion, terminar } from "./veterinaria-comun-dev.mjs";

const PUERTO = 3006;
const BASE = `http://huellitas.localhost:${PUERTO}`;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const P = await personas();

const servidor = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], {
  env: { ...process.env, PELUDESK_URL_DESARROLLO: `http://{slug}.localhost:${PUERTO}` },
  stdio: ["ignore", "pipe", "pipe"],
});
let bitacora = "";
servidor.stdout.on("data", (d) => (bitacora += d));
servidor.stderr.on("data", (d) => (bitacora += d));
process.on("exit", () => { try { servidor.kill(); } catch { /* ya cerró */ } });

const pedir = (host, ruta, { cabeceras = {} } = {}) => new Promise((resolve, reject) => {
  const q = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method: "GET", headers: { host: `${host}:${PUERTO}`, ...cabeceras } }, (r) => {
    const trozos = [];
    r.on("data", (c) => trozos.push(c));
    r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, cuerpo: Buffer.concat(trozos) }));
  });
  q.on("error", reject);
  q.end();
});
const esperarHasta = async (fn, ms = 20000, paso = 300) => { const t = Date.now(); for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t > ms) return null; await new Promise((x) => setTimeout(x, paso)); } };
async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: ses, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(ses.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const dimensionesPng = (buf) => (buf.length > 24 && buf.toString("latin1", 1, 4) === "PNG" ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null);

let nav;
const MARCA = `ZZPWA${String(Date.now()).slice(-5)}`;
let marcaOriginal = null;
try {
  const listo = await esperarHasta(async () => (await pedir("huellitas.localhost", "/login").catch(() => null))?.status === 200, 60000, 1000);
  comprobar(listo, "el servidor de la prueba arrancó (necesita `npm run build`)");
  if (!listo) throw new Error("sin servidor:\n" + bitacora.slice(-1500));

  const { data: neg } = await SB.from("negocios").select("nombre, marca").eq("id", B).single();
  marcaOriginal = neg.marca;

  // ═══ 1. Manifiesto e íconos ═══
  seccion("1. Manifiesto e íconos");
  const m = await pedir("huellitas.localhost", "/manifest.webmanifest");
  const man = JSON.parse(m.cuerpo.toString("utf8"));
  comprobar(m.status === 200 && /manifest\+json/.test(m.headers["content-type"] ?? ""), "el manifiesto responde como application/manifest+json");
  comprobar(man.name === neg.nombre && man.display === "standalone" && man.start_url === "/" && man.scope === "/" && man.lang === "es-MX", `nombre del negocio (${man.name}), standalone, start_url y scope`);
  comprobar(man.icons.some((i) => i.sizes === "192x192") && man.icons.some((i) => i.sizes === "512x512" && i.purpose === "any") && man.icons.some((i) => i.purpose === "maskable"), "íconos de 192, 512 y maskable");
  comprobar(/^#[0-9a-f]{6}$/i.test(man.theme_color) && man.background_color === "#ffffff", `color del tema (${man.theme_color})`);
  comprobar(Array.isArray(man.shortcuts) && man.shortcuts.length >= 1, "atajos a la pantalla de inicio");
  const ludo = await pedir("ludogteka.localhost", "/manifest.webmanifest");
  const manL = JSON.parse(ludo.cuerpo.toString("utf8"));
  comprobar(manL.name !== man.name && !/peludesk/i.test(manL.name), `otro negocio, otro manifiesto (${manL.name})`);
  for (const [ruta, lado] of [["/icono-pwa?s=192", 192], ["/icono-pwa?s=512", 512], ["/icono-pwa?s=512&m=1", 512]]) {
    const r = await pedir("huellitas.localhost", ruta);
    const d = dimensionesPng(r.cuerpo);
    comprobar(r.status === 200 && d && d.w === lado && d.h === lado, `${ruta}: PNG de ${lado}×${lado}`);
  }
  const sinLogo = await pedir("huellitas.localhost", "/icono-pwa?s=192");
  await SB.from("negocios").update({ marca: { ...(neg.marca ?? {}), logo: "/marca/peludesk/favicon-180.png" } }).eq("id", B);
  await new Promise((r) => setTimeout(r, 400));
  const conLogo = await pedir("huellitas.localhost", "/icono-pwa?s=192");
  comprobar(conLogo.status === 200 && dimensionesPng(conLogo.cuerpo)?.w === 192 && !conLogo.cuerpo.equals(sinLogo.cuerpo), "con logo configurado, el ícono cambia (lleva el logo del negocio)");
  await SB.from("negocios").update({ marca: neg.marca }).eq("id", B);
  const plat = await pedir("plataforma.localhost", "/icono-pwa?s=192");
  comprobar(!dimensionesPng(plat.cuerpo), `en el dominio de la plataforma no se entrega un ícono de negocio (${plat.status})`);

  // ═══ 2. Service worker y pantalla sin conexión: públicos y sin datos ═══
  seccion("2. Service worker y pantalla «sin conexión»");
  const sw = await pedir("huellitas.localhost", "/sw.js");
  comprobar(sw.status === 200 && /javascript/.test(sw.headers["content-type"] ?? ""), "/sw.js se sirve sin sesión, como JavaScript");
  comprobar(/no-cache|no-store/.test(sw.headers["cache-control"] ?? "") && sw.headers["service-worker-allowed"] === "/", "…siempre se revisa si hay uno nuevo y controla todo el sitio");
  const textoSw = sw.cuerpo.toString("utf8");
  comprobar(!/eyJ|sb-|apikey|service_role|Bearer/.test(textoSw), "…y no lleva llaves ni datos");
  comprobar(/method !== "GET"\) return/.test(textoSw), "…y por código ignora todo lo que no sea un GET (ninguna acción de la app pasa por él)");
  const off = await pedir("huellitas.localhost", "/sin-conexion");
  comprobar(off.status === 200 && off.cuerpo.toString("utf8").includes("Sin conexión"), "/sin-conexion se abre sin sesión");
  const priv = await pedir("huellitas.localhost", "/recepcion");
  comprobar(priv.status >= 300 && priv.status < 400, `una pantalla del personal sin sesión sigue pidiendo login (${priv.status})`);

  // ═══ 3. Con el service worker real ═══
  seccion("3. Qué se guarda para ver sin conexión");
  const cli = (await SB.from("clientes").select("id, nombre").eq("negocio_id", B).eq("publico_general", false).is("deleted_at", null).order("created_at").limit(1).single()).data;
  let perro = (await SB.from("perros").select("id, nombre").eq("cliente_id", cli.id).is("deleted_at", null).limit(1).maybeSingle()).data;
  if (!perro) {
    const nuevo = await SB.from("perros").insert({ negocio_id: B, cliente_id: cli.id, nombre: `${MARCA} Mascota` }).select("id, nombre").single();
    perro = nuevo.data;
  }
  nav = await abrirNavegador();
  const ctx = await nav.newContext({ serviceWorkers: "allow" });
  await ctx.addCookies(await cookiesDe(P.adminId));
  const pag = await ctx.newPage();
  // La base de desarrollo está lejos: una ficha tarda de 6 a 20 s en cargar.
  pag.setDefaultNavigationTimeout(90000);
  const cdp = await ctx.newCDPSession(pag);
  const erroresPagina = [];
  pag.on("pageerror", (e) => erroresPagina.push(String(e.message)));
  pag.on("console", (m) => { if (m.type() === "error") erroresPagina.push(m.text()); });
  await pag.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  comprobar(await pag.locator('link[rel="manifest"]').count() === 1, "la página enlaza el manifiesto");
  const ctrl = await esperarHasta(() => pag.evaluate(async () => { await navigator.serviceWorker.ready; return Boolean(navigator.serviceWorker.controller); }), 20000);
  if (!ctrl) { await pag.reload({ waitUntil: "networkidle" }); }
  comprobar(await pag.evaluate(() => Boolean(navigator.serviceWorker.controller)), "el service worker se registra y toma el control");
  const errores = await cdp.send("Page.getInstallabilityErrors").catch(() => ({ installabilityErrors: [{ errorId: "no-cdp" }] }));
  comprobar(errores.installabilityErrors.length === 0, `Chromium considera la app instalable (${errores.installabilityErrors.map((e) => e.errorId).join(",") || "sin errores"})`);

  await pag.goto(`${BASE}/estetica`, { waitUntil: "networkidle" });
  await pag.goto(`${BASE}/clientes/${cli.id}`, { waitUntil: "networkidle" });
  await pag.goto(`${BASE}/perros/${perro.id}`, { waitUntil: "networkidle" });
  await pag.goto(`${BASE}/caja`, { waitUntil: "networkidle" });
  await pag.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  await new Promise((r) => setTimeout(r, 1200));
  const llaves = async () => pag.evaluate(async () => {
    const salida = {};
    for (const n of await caches.keys()) salida[n] = (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search);
    return salida;
  });
  let c = await llaves();
  const paginas = c["peludesk-paginas-v1"] ?? [];
  comprobar(paginas.includes("/recepcion") && paginas.includes("/estetica") && paginas.includes(`/clientes/${cli.id}`) && paginas.includes(`/perros/${perro.id}`), `se guardan el tablero, la agenda, la ficha del cliente y la de la mascota (${paginas.length})`);
  comprobar(!paginas.some((p) => p.startsWith("/caja") || p.startsWith("/api") || p.startsWith("/auth") || p.startsWith("/login")), "…y NADA de caja, API, auth ni login");
  comprobar(Object.values(c).flat().every((p) => !/supabase/.test(p)), "…ni llamadas a la base de datos");
  comprobar(Object.keys(c).includes("peludesk-estaticos-v1") && c["peludesk-estaticos-v1"].includes("/sin-conexion") && c["peludesk-estaticos-v1"].some((p) => p.startsWith("/_next/static/")), "la pantalla «sin conexión» y los archivos de la app quedan guardados");

  // ═══ 4. Sin conexión ═══
  seccion("4. Sin conexión: se consulta, no se escribe");
  const textoOnline = await pag.locator("main").first().innerText().catch(() => "");
  await pag.goto(`${BASE}/clientes/nuevo`, { waitUntil: "networkidle" });
  const T = `44${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  await pag.getByLabel("Nombre del dueño").fill(`${MARCA} Offline`);
  await pag.getByLabel("Teléfono").fill(T);
  await ctx.setOffline(true);
  comprobar(await pag.getByTestId("aviso-sin-conexion").waitFor({ timeout: 8000 }).then(() => true).catch(() => false), "al irse el internet sale el aviso «Sin conexión»");
  comprobar(await pag.evaluate(() => document.documentElement.hasAttribute("data-sin-conexion")), "…y la página queda marcada");
  await pag.getByRole("button", { name: "Crear cliente", exact: true }).click();
  comprobar(await pag.getByTestId("aviso-sin-guardar").waitFor({ timeout: 6000 }).then(() => true).catch(() => false), "guardar sin conexión se detiene con un aviso claro");
  const rechazo = await pag.evaluate(async () => { try { await fetch("/clientes/nuevo", { method: "POST", body: "x" }); return "salió"; } catch (e) { return String(e.message); } });
  comprobar(/Sin conexión: no se guardó nada/.test(rechazo), `una acción (POST) ni sale: ${rechazo.slice(0, 60)}`);
  // La base se mira con la llave de servidor: el navegador sigue SIN conexión.
  comprobar(!(await SB.from("clientes").select("id").eq("negocio_id", B).eq("telefono", T).maybeSingle()).data, "…y nada se guardó en la base");
  await pag.goto(`${BASE}/recepcion`, { waitUntil: "domcontentloaded" });
  const textoOff = await pag.locator("main").first().innerText().catch(() => "");
  const titulo = textoOnline.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  comprobar(textoOff.length > 50 && titulo.length > 3 && textoOff.includes(titulo), `el tablero del día se abre sin conexión con lo último que se vio (${titulo.slice(0, 40)})`);
  const avisoOff = await pag.getByTestId("aviso-sin-conexion").waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
  const estadoOff = avisoOff ? "" : ` [onLine=${await pag.evaluate(() => navigator.onLine)}, marca=${await pag.evaluate(() => document.documentElement.hasAttribute("data-sin-conexion"))}, errores=${erroresPagina.slice(-2).join(" | ").slice(0, 200)}]`;
  comprobar(avisoOff, `…con el aviso de «Sin conexión»${estadoOff}`);
  await pag.goto(`${BASE}/estetica`, { waitUntil: "domcontentloaded" });
  comprobar((await pag.locator("main").first().innerText().catch(() => "")).length > 20, "la agenda de estética también");
  await pag.goto(`${BASE}/clientes/${cli.id}`, { waitUntil: "domcontentloaded" });
  comprobar(await pag.getByText(cli.nombre, { exact: false }).first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false), "la ficha del cliente ya abierta");
  await pag.goto(`${BASE}/perros/${perro.id}`, { waitUntil: "domcontentloaded" });
  comprobar(await pag.getByText(perro.nombre, { exact: false }).first().waitFor({ timeout: 8000 }).then(() => true).catch(() => false), "la ficha de la mascota ya abierta");
  await pag.goto(`${BASE}/caja`, { waitUntil: "domcontentloaded" });
  comprobar(await pag.getByText("No hay internet en este momento").waitFor({ timeout: 8000 }).then(() => true).catch(() => false), "una pantalla que no se había abierto (Caja) dice «sin conexión», sin error feo");
  await pag.goto(`${BASE}/clientes/${P.adminId}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  comprobar(await pag.getByText("No hay internet en este momento").waitFor({ timeout: 8000 }).then(() => true).catch(() => false), "la ficha de un cliente que NO se abrió tampoco se inventa");
  await ctx.setOffline(false);
  await pag.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  comprobar(!(await pag.getByTestId("aviso-sin-conexion").isVisible().catch(() => false)), "al volver la conexión el aviso se va");

  // ═══ 5. Sesión y privacidad de la copia ═══
  seccion("5. Cerrar sesión y cambiar de persona borran la copia");
  c = await llaves();
  comprobar((c["peludesk-paginas-v1"] ?? []).length >= 4, "antes: hay copias");
  await ctx.clearCookies();
  await ctx.addCookies(await cookiesDe(P.recConId));
  await pag.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  await new Promise((r) => setTimeout(r, 1500));
  c = await llaves();
  const trasCambio = c["peludesk-paginas-v1"] ?? [];
  comprobar(!trasCambio.includes(`/clientes/${cli.id}`) && !trasCambio.includes(`/perros/${perro.id}`), `otra persona en el mismo equipo no hereda la copia (${trasCambio.join(",")})`);
  await ctx.clearCookies();
  await pag.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await new Promise((r) => setTimeout(r, 1500));
  c = await llaves();
  comprobar((c["peludesk-paginas-v1"] ?? []).length === 0, "al llegar al login (sesión cerrada) se borra todo lo guardado");

  // El portal de un cliente: ni precarga pantallas del personal.
  const ctxC = await nav.newContext({ serviceWorkers: "allow" });
  const datosB = JSON.parse((await import("node:fs")).readFileSync((await import("node:path")).join((await import("node:os")).tmpdir(), "peludesk-negocio-b.json"), "utf8"));
  await ctxC.addCookies(await cookiesDe(datosB.cuentaSoloB));
  const pc = await ctxC.newPage();
  await pc.goto(`${BASE}/portal`, { waitUntil: "networkidle" });
  await new Promise((r) => setTimeout(r, 3500));
  const cC = await pc.evaluate(async () => { const s = {}; for (const n of await caches.keys()) s[n] = (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname); return s; });
  comprobar(!(cC["peludesk-paginas-v1"] ?? []).some((p) => p.startsWith("/recepcion") || p.startsWith("/estetica") || p.startsWith("/clientes")), "el portal de un cliente no guarda pantallas del personal");
  comprobar(await pc.getByTestId("aviso-sin-conexion").count() === 0, "…y online no muestra el aviso");
  await ctxC.setOffline(true);
  comprobar(await pc.getByTestId("aviso-sin-conexion").waitFor({ timeout: 8000 }).then(() => true).catch(() => false), "…pero sí avisa si se va el internet");
} catch (e) {
  console.log(`  ✘ la prueba se detuvo: ${e.stack ?? e}`);
  hallazgo(`la prueba se detuvo: ${e.message}`);
} finally {
  try { await nav?.close(); } catch { /* ya cerró */ }
  try { servidor.kill(); } catch { /* ya cerró */ }
  if (marcaOriginal !== null) await SB.from("negocios").update({ marca: marcaOriginal }).eq("id", B);
  const { data: mios } = await SB.from("clientes").select("id").eq("negocio_id", B).like("nombre", `${MARCA}%`);
  if (mios?.length) await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).in("id", mios.map((x) => x.id));
  await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", B).like("nombre", `${MARCA}%`);
}
terminar();
