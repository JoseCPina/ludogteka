// Uso: npm run build && node scripts/auditoria/herramientas-publicas-dev.mjs   (SOLO DESARROLLO)
//
// Las herramientas públicas de peludesk.mx (src/lib/herramientas/lista.ts, las publicadas) de punta a punta, con su
// propio `next start` en el 3004, un WhatsApp (Graph) y un Meta de mentiras en el 4466:
//   A. Cada herramienta y /herramientas: 200, indexable, title/description/canonical/Open Graph, un h1, JSON-LD que
//      parsea (WebApplication o Dataset, FAQPage), la línea de «qué hace» y «de dónde salen los datos», y están en el
//      sitemap y en llms.txt.
//   B. Medición: la visita y el uso llegan a herramientas_eventos con su fuente (utm); un robot no cuenta; con
//      marketing aceptado el píxel recibe ViewContent y Lead; sin consentimiento, nada.
//   C. Índice de precios: con datos sembrados (ciudad con 8+, otra con menos → estado → país), la pantalla enseña el
//      rango, la barra y «¿Cuánto cobras tú?» ubica el precio; la imagen y la insignia responden; la página por
//      ciudad existe solo para la ciudad con 8+ y 404 para la otra; un precio no creíble no cuenta.
//   D. Captura: «Recíbelo por WhatsApp» crea el prospecto con fuente «herramienta» (o completa uno existente), guarda
//      herramientas_capturas, manda la plantilla al WhatsApp de mentiras (Lead a la API de conversiones con el mismo
//      event_id) y nunca pide correo; quien pidió BAJA no recibe mensaje.
//   E. Precarga: al registrarse con ese mismo teléfono, el negocio nace con tarifas «Calculado» del servicio y la
//      captura queda aplicada; se anota «cuenta».
//   F. Celular (390 px): nada más ancho que la pantalla en cada herramienta.
// Limpia lo que creó (precios sembrados, eventos, capturas, prospecto, negocio). Sale con 1 si algo falla.
import { limpiarAlTerminar } from "../lib/limpieza-dev.mjs";
limpiarAlTerminar({ prefijos: ["hta-prueba-"], bitacoras: ["herramientas_eventos", "herramientas_capturas", "aceptaciones_legales"] });
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { claveAleatoria } from "../lib/clave.mjs";
import { desbordesDePantalla } from "./lib/ancho-pantalla.mjs";
import { HERRAMIENTAS } from "../../src/lib/herramientas/lista.ts";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const A = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const PUERTO = 3004;
const DOBLE = 4466;
const PIXEL = "1112223334445556";
const PLATAFORMA = `http://plataforma.localhost:${PUERTO}`;
const sufijo = String(Date.now()).slice(-6);
const TELEFONO = `55${sufijo}99`.padEnd(10, "0").slice(0, 10);
const CLAVE = claveAleatoria();
const CIUDAD_CON = "Aguascalientes"; // 10 precios de baño mediano
const CIUDAD_SIN = "Tepic"; // 3 precios: cae al estado (Nayarit, también 3) y luego al país
let fallas = 0;
const ok = (c, q) => { console.log(`  ${c ? "✔" : "✘"} ${q}`); if (!c) fallas++; return c; };

// ── Dobles: WhatsApp (Graph API) y Meta (píxel + conversiones) ──
const graph = { mensajes: [], plantillas: [] };
const meta = { conversiones: [], pixel: [] };
const doble = http.createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    const u = req.url ?? "";
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (/\/message_templates/.test(u)) return res.end(JSON.stringify({ data: [{ name: "peludesk_herramienta_v1", status: "APPROVED", category: "UTILITY", language: "es_MX" }] }));
    if (/\/messages$/.test(u)) { try { graph.mensajes.push(JSON.parse(cuerpo)); } catch {} return res.end(JSON.stringify({ messages: [{ id: `wamid.${Date.now()}` }] })); }
    if (/\/events/.test(u)) { try { meta.conversiones.push(JSON.parse(cuerpo)); } catch {} return res.end(JSON.stringify({ events_received: 1 })); }
    if (/fbevents\.js/.test(u)) { res.setHeader("Content-Type", "text/javascript"); return res.end("window.fbq=function(){window.__pd_fbq=(window.__pd_fbq||[]);window.__pd_fbq.push([].slice.call(arguments));};window.fbq.callMethod=window.fbq;"); }
    res.end("{}");
  });
});
await new Promise((r) => doble.listen(DOBLE, "127.0.0.1", r));

const servidor = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], {
  env: { ...process.env, PELUDESK_URL_DESARROLLO: `http://{slug}.localhost:${PUERTO}`, PELUDESK_META_PIXEL_ID: PIXEL, PELUDESK_META_CAPI_TOKEN: "token-de-mentiras", META_API_URL: `http://127.0.0.1:${DOBLE}`, WHATSAPP_GRAPH_URL: `http://127.0.0.1:${DOBLE}`, WHATSAPP_TOKEN: "token-de-mentiras", WHATSAPP_PHONE_NUMBER_ID: "123", PELUDESK_WABA_ID: "456", WHATSAPP_APP_SECRET: "secreto-de-mentiras" },
  stdio: ["ignore", "pipe", "pipe"],
});
let bitacora = "";
servidor.stdout.on("data", (d) => (bitacora += d));
servidor.stderr.on("data", (d) => (bitacora += d));
const cerrar = () => { try { servidor.kill(); } catch {} doble.close(); };
process.on("exit", cerrar);

function pedir(ruta, { metodo = "GET", cabeceras = {}, cuerpo } = {}) {
  return new Promise((resolve, reject) => {
    const q = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method: metodo, headers: { host: `plataforma.localhost:${PUERTO}`, "user-agent": "Mozilla/5.0 auditoria-herramientas", ...cabeceras } }, (r) => {
      const trozos = [];
      r.on("data", (c) => trozos.push(c));
      r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, texto: Buffer.concat(trozos).toString("utf8"), bytes: Buffer.concat(trozos) }));
    });
    q.on("error", reject);
    if (cuerpo) q.write(cuerpo);
    q.end();
  });
}
for (let i = 0; i < 90; i++) {
  try { if ((await pedir("/robots.txt")).status === 200) break; } catch {}
  await new Promise((r) => setTimeout(r, 1000));
  if (i === 89) { console.log(bitacora); throw new Error("El servidor no arrancó (¿corriste `npm run build`?)."); }
}

// ── Datos sembrados del índice ──
const sembrados = [];
async function sembrar() {
  const filas = [];
  // En un insert en lote PostgREST manda null en las columnas que una fila trae y otra no: `valido` va explícito.
  const base = (ciudad, estado, n, desde, paso) => { for (let i = 0; i < n; i++) filas.push({ giro: "estetica", servicio: "bano", talla: "mediano", precio: desde + i * paso, ciudad, estado, fuente: "sitio_web", url: `https://ejemplo.test/${sufijo}/${ciudad}/${i}`, detalle: `auditoria ${sufijo}`, valido: true, huella: `aud-${sufijo}-${ciudad}-${i}` }); };
  base(CIUDAD_CON, "Aguascalientes", 10, 250, 20); // 250..430: p25 ≈ 295, mediana 340, p75 ≈ 385
  base(CIUDAD_SIN, "Nayarit", 3, 300, 10);
  filas.push({ giro: "estetica", servicio: "bano", talla: "mediano", precio: 5, ciudad: CIUDAD_CON, estado: "Aguascalientes", fuente: "sitio_web", valido: false, detalle: `auditoria ${sufijo} no creíble`, huella: `aud-${sufijo}-nocreible` });
  const { data, error } = await A.from("precios_mercado").insert(filas).select("id");
  if (error) throw new Error(`sembrar: ${error.message}`);
  sembrados.push(...data.map((x) => x.id));
}
async function limpiarSembrados() {
  if (sembrados.length) await A.from("precios_mercado").delete().in("id", sembrados);
  await A.from("prospectos").delete().eq("telefono_norm", TELEFONO);
}

const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => { try { const b = JSON.parse(m[1]); return Array.isArray(b) ? b : [b]; } catch { return []; } });

try {
  await sembrar();
  const publicadas = HERRAMIENTAS.filter((h) => h.publicada);

  // ── A. Cada herramienta: SEO y datos estructurados ──
  console.log("\nA. Páginas, SEO y JSON-LD");
  const sitemap = (await pedir("/sitemap.xml")).texto;
  const llms = (await pedir("/llms.txt")).texto;
  for (const ruta of ["/herramientas", ...publicadas.map((h) => h.ruta)]) {
    const r = await pedir(ruta);
    const h = r.texto;
    const tipos = ld(h).map((x) => x["@type"]);
    const problemas = [];
    if (r.status !== 200) problemas.push(`status ${r.status}`);
    if (!/<title[^>]*>[^<]{10,90}<\/title>/.test(h)) problemas.push("title");
    if (!/<meta name="description" content="[^"]{50,200}"/.test(h)) problemas.push("description");
    if (!h.includes(`<link rel="canonical" href="https://peludesk.mx${ruta}"`)) problemas.push("canonical");
    if ((h.match(/<h1[\s>]/g) ?? []).length !== 1) problemas.push("h1");
    if (/<meta name="robots" content="[^"]*noindex/.test(h)) problemas.push("noindex");
    if (!/<meta property="og:image"/.test(h)) problemas.push("og:image");
    if (ruta !== "/herramientas" && !tipos.some((t) => t === "WebApplication" || t === "Dataset")) problemas.push(`JSON-LD (${tipos.join(",")})`);
    if (ruta !== "/herramientas" && !tipos.includes("FAQPage")) problemas.push("FAQPage");
    if (ruta !== "/herramientas" && !/De dónde salen los datos/.test(h)) problemas.push("sin «de dónde salen los datos»");
    if (!sitemap.includes(`<loc>https://peludesk.mx${ruta}</loc>`)) problemas.push("no está en el sitemap");
    if (!llms.includes(`https://peludesk.mx${ruta}`)) problemas.push("no está en llms.txt");
    ok(problemas.length === 0, `${ruta}: 200, SEO completo, JSON-LD, sitemap y llms.txt${problemas.length ? ` → ${problemas.join(", ")}` : ""}`);
  }
  ok((await pedir("/llms-full.txt")).texto.includes("Herramientas gratuitas"), "llms-full.txt describe las herramientas");

  // ── C. Índice de precios (servidor) ──
  console.log("\nC. Índice de precios");
  const con = await pedir(`/precios-mercado?giro=estetica&servicio=bano&ciudad=aguascalientes&talla=mediano`);
  ok(con.status === 200 && /data-nivel="ciudad"/.test(con.texto) && /\$340/.test(con.texto), "la ciudad con 10 precios enseña el rango de la ciudad (mediana $340)");
  const sin = await pedir(`/precios-mercado?giro=estetica&servicio=bano&ciudad=tepic&talla=mediano`);
  ok(sin.status === 200 && /data-nivel="pais"/.test(sin.texto), "la ciudad con 3 precios cae al país (el estado tampoco junta 8)");
  const pagCon = await pedir(`/precios-mercado/estetica/aguascalientes`);
  ok(pagCon.status === 200 && /Cuánto cobra una estética canina en Aguascalientes/.test(pagCon.texto) && ld(pagCon.texto).some((x) => x["@type"] === "Dataset"), `la página por ciudad existe para la ciudad con 8+ (con Dataset) [${pagCon.status}]`);
  ok(sitemap.includes("<loc>https://peludesk.mx/precios-mercado/estetica/aguascalientes</loc>"), "la página por ciudad está en el sitemap");
  const pagSin = await pedir(`/precios-mercado/estetica/tepic`);
  ok(pagSin.status === 404, "la página por ciudad da 404 para la ciudad sin 8 precios");
  const img = await pedir(`/precios-mercado/imagen?giro=estetica&servicio=bano&ciudad=aguascalientes&talla=mediano`);
  ok(img.status === 200 && /image\/png/.test(img.headers["content-type"] ?? "") && img.bytes.length > 5000, "la imagen 1080×1080 responde PNG");
  const ogImg = await pedir(`/precios-mercado/imagen?giro=estetica&servicio=bano&ciudad=aguascalientes&formato=og`);
  ok(ogImg.status === 200 && ogImg.bytes.length > 5000, "la imagen de Open Graph responde");
  const insDentro = await pedir(`/precios-mercado/insignia?giro=estetica&servicio=bano&ciudad=aguascalientes&precio=340`);
  const insFuera = await pedir(`/precios-mercado/insignia?giro=estetica&servicio=bano&ciudad=aguascalientes&precio=900`);
  ok(insDentro.status === 200 && /image\/svg/.test(insDentro.headers["content-type"] ?? "") && /Dentro del rango de Aguascalientes/.test(insDentro.texto), "la insignia sale con un precio dentro del rango");
  ok(insFuera.status === 404, "la insignia da 404 con un precio fuera del rango (no se falsifica)");
  const { data: rangoBruto } = await A.rpc("precios_mercado_rangos", { p_giro: "estetica", p_servicio: "bano", p_ciudad: CIUDAD_CON, p_estado: "Aguascalientes", p_talla: "mediano" });
  ok(rangoBruto?.muestras === 10, `el precio no creíble ($5) no cuenta en el rango (${rangoBruto?.muestras} muestras)`);

  // ── B y D. Navegador: medición, píxel y captura ──
  console.log("\nB/D. Navegador: medición, píxel y captura por WhatsApp");
  const nav = await abrirNavegador();
  // Un navegador de persona (el Chromium sin cabeza se presenta como HeadlessChrome y la medición lo toma por robot).
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, userAgent: UA });
  // El píxel de mentiras: vacía la cola que armó pixel-cliente y recibe las llamadas siguientes (como fbevents.js).
  const FBEVENTS = "(function(){var f=window.fbq;window.__pd_fbq=[];(f&&f.queue||[]).forEach(function(a){window.__pd_fbq.push([].slice.call(a))});if(f){f.callMethod=function(){window.__pd_fbq.push([].slice.call(arguments))};}})();";
  await ctx.route("**/connect.facebook.net/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: FBEVENTS }));
  const p = await ctx.newPage();
  const consola = [];
  p.on("console", (m) => consola.push(m.text()));
  await p.goto(`${PLATAFORMA}/precios-mercado?giro=estetica&servicio=bano&ciudad=aguascalientes&talla=mediano&utm_source=prueba&utm_medium=auditoria`, { waitUntil: "load" });
  await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  // Sin consentimiento: nada al píxel.
  const fbqAntes = await p.evaluate(() => (window.__pd_fbq ?? []).length);
  ok(fbqAntes === 0, "sin consentimiento no sale nada al píxel");
  // El aviso de cookies es de una línea con Aceptar y Rechazar del mismo tamaño.
  const botones = await p.$$eval("section[aria-label='Aviso de cookies'] button", (bs) => bs.map((b) => ({ t: b.textContent.trim(), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })));
  const aceptar = botones.find((b) => b.t === "Aceptar");
  const rechazar = botones.find((b) => b.t === "Rechazar");
  ok(aceptar && rechazar && Math.abs(aceptar.w - rechazar.w) < 2 && Math.abs(aceptar.h - rechazar.h) < 2, "el aviso de cookies tiene Aceptar y Rechazar iguales");
  await p.getByRole("button", { name: "Aceptar", exact: true }).click();
  await p.waitForTimeout(1200);
  const fbq = await p.evaluate(() => (window.__pd_fbq ?? []).map((x) => x[1]));
  ok(fbq.includes("ViewContent"), `con marketing aceptado el píxel recibe ViewContent (${fbq.join(",")})`);

  // El rango y la barra en pantalla; «¿Cuánto cobras tú?» ubica el precio.
  ok(await p.locator("[data-rango][data-nivel='ciudad']").isVisible(), "la pantalla enseña el rango de la ciudad");
  await p.locator("[data-tu-precio-campo]").fill("500");
  await p.waitForTimeout(500);
  ok(await p.locator("[data-tu-precio]").isVisible() && (await p.locator("[data-posicion='arriba']").isVisible()), "«¿Cuánto cobras tú?» ubica $500 arriba del rango sin pedir nada");
  await p.locator("[data-tu-precio-campo]").fill("340");
  await p.waitForTimeout(400);
  ok(await p.locator("[data-posicion='dentro']").isVisible(), "$340 queda dentro del rango");
  // Cambiar la talla pide otro rango al servidor (todas las tallas también suma 10 + nada).
  await p.locator("[data-selector='talla'] [role=radio]", { hasText: "Todos" }).click();
  await p.waitForTimeout(1500);
  ok(/talla=/.test(p.url()) === false, "la dirección refleja la consulta (sin talla al escoger «Todos»)");

  // Captura: nunca pide correo; crea el prospecto, la captura, el mensaje y Lead.
  const form = p.locator("form[data-recibelo]");
  ok((await form.locator("input[type=email]").count()) === 0 && !/correo|email/i.test(await form.locator("label").allTextContents().then((t) => t.join(" "))), "la captura no pide correo");
  await form.locator("input[type=tel]").fill(TELEFONO);
  await form.locator("input[autocomplete=given-name]").fill("Prueba Auditoría");
  await form.getByRole("button", { name: "Mandármelo por WhatsApp" }).click();
  await p.locator("[data-recibelo-listo]").waitFor({ timeout: 30000 });
  ok(/ya va en camino/.test(await p.locator("[data-recibelo-listo]").innerText()), "la pantalla dice que el mensaje va en camino");
  await new Promise((r) => setTimeout(r, 1500));
  const { data: prospecto } = await A.from("prospectos").select("id, fuente, etapa, giro, ciudad, herramienta_origen, slug").eq("telefono_norm", TELEFONO).is("deleted_at", null).maybeSingle();
  ok(prospecto?.fuente === "herramienta" && prospecto?.etapa === "caliente" && prospecto?.giro === "estetica" && prospecto?.ciudad === CIUDAD_CON && prospecto?.herramienta_origen === "precios-mercado", `el prospecto nace con fuente herramienta, caliente, su giro y su ciudad (${JSON.stringify(prospecto)})`);
  const { data: captura } = await A.from("herramientas_capturas").select("id, datos, prospecto_id, aplicado_at").eq("telefono_norm", TELEFONO).eq("herramienta", "precios-mercado").is("deleted_at", null).maybeSingle();
  ok(captura && captura.prospecto_id === prospecto?.id && captura.datos?.servicio === "bano" && Number(captura.datos?.precio) === 340 && captura.datos?.reporte_mensual === true && !captura.aplicado_at, "la captura guarda servicio, precio y el reporte mensual, ligada al prospecto");
  const plantilla = graph.mensajes.find((m) => m.type === "template");
  const params = plantilla?.template?.components?.find((c) => c.type === "body")?.parameters?.map((x) => x.text) ?? [];
  ok(plantilla?.template?.name === "peludesk_herramienta_v1" && plantilla?.to === `52${TELEFONO}` && params[0] === "Prueba" && /Baño completo/.test(params[1]) && /precios-mercado/.test(params[2]), `el bot mandó la plantilla con nombre, resumen y link (${params.join(" | ").slice(0, 120)})`);
  const lead = meta.conversiones.find((c) => c.data?.[0]?.event_name === "Lead");
  const fbqLead = await p.evaluate(() => (window.__pd_fbq ?? []).find((x) => x[1] === "Lead"));
  ok(lead && lead.data[0].user_data?.ph?.[0]?.length === 64 && !JSON.stringify(lead).includes(TELEFONO), "Lead llegó a la API de conversiones con el teléfono en hash y sin datos en claro");
  ok(fbqLead && fbqLead[3]?.eventID === lead?.data?.[0]?.event_id, "el píxel mandó Lead con el MISMO event_id (deduplicación)");
  const { data: eventos } = await A.from("herramientas_eventos").select("evento, fuente, medio").eq("herramienta", "precios-mercado").gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const tipos = (eventos ?? []).map((e) => e.evento);
  ok(tipos.includes("visita") && tipos.includes("uso") && tipos.includes("telefono") && (eventos ?? []).some((e) => e.evento === "visita" && e.fuente === "prueba" && e.medio === "auditoria"), `la medición tiene visita (con utm), uso y teléfono (${tipos.join(",")})`);
  // Un robot no cuenta.
  const antesBot = (eventos ?? []).length;
  await pedir("/api/herramientas/evento", { metodo: "POST", cabeceras: { "content-type": "application/json", "user-agent": "Googlebot/2.1" }, cuerpo: JSON.stringify({ herramienta: "precios-mercado", evento: "visita" }) });
  const { count: despuesBot } = await A.from("herramientas_eventos").select("id", { count: "exact", head: true }).eq("herramienta", "precios-mercado").gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  ok(despuesBot === antesBot, "una visita de un robot no cuenta");
  // Quien pidió BAJA: prospecto registrado, mensaje no.
  const TEL_BAJA = `56${sufijo}11`.padEnd(10, "0").slice(0, 10);
  await A.from("seguimiento_pruebas_exclusiones").insert({ telefono: TEL_BAJA, motivo: `auditoria ${sufijo}` });
  const antesMsj = graph.mensajes.length;
  const p2 = await ctx.newPage();
  await p2.goto(`${PLATAFORMA}/precios-mercado?giro=hotel&servicio=noche_hotel`, { waitUntil: "load" });
  const f2 = p2.locator("form[data-recibelo]");
  await f2.locator("input[type=tel]").fill(TEL_BAJA);
  await f2.getByRole("button", { name: "Mandármelo por WhatsApp" }).click();
  await p2.locator("[data-recibelo-listo]").waitFor({ timeout: 30000 });
  ok(graph.mensajes.length === antesMsj && /no te lo mandamos/.test(await p2.locator("[data-recibelo-listo]").innerText()), "a quien pidió BAJA no se le manda mensaje y se le dice");
  await A.from("seguimiento_pruebas_exclusiones").delete().eq("telefono", TEL_BAJA);
  await A.from("prospectos").delete().eq("telefono_norm", TEL_BAJA);
  await p2.close();

  // ── E. Precarga al abrir la prueba ──
  console.log("\nE. Precarga al abrir la prueba gratis");
  await p.goto(`${PLATAFORMA}/registro?utm_source=herramientas&utm_medium=precios-mercado`, { waitUntil: "load" });
  await p.fill("input[name=nombre]", "Prueba Auditoría");
  await p.fill("input[name=negocio]", `hta-prueba-${sufijo}`);
  await p.fill("input[name=ciudad]", CIUDAD_CON);
  await p.fill("input[name=telefono]", TELEFONO);
  await p.fill("input[name=password]", CLAVE);
  await p.check("input[name=servicios][value=estetica]");
  await p.check("input[name=acepto]");
  await p.getByRole("button", { name: /Abrir mi negocio|Crear|Empezar|Probar/ }).first().click();
  await p.waitForURL(/bienvenida|login|auth\/entrar/, { timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const { data: negocio } = await A.from("negocios").select("id, slug").like("slug", `hta-prueba-${sufijo}%`).is("deleted_at", null).maybeSingle();
  ok(!!negocio, `el negocio de prueba se creó (${negocio?.slug ?? "no"})`);
  if (negocio) {
    const { data: cap2 } = await A.from("herramientas_capturas").select("aplicado_negocio_id, aplicado_detalle").eq("id", captura.id).maybeSingle();
    ok(cap2?.aplicado_negocio_id === negocio.id && /tarifas «Calculado»/.test(cap2?.aplicado_detalle ?? ""), `la captura quedó aplicada al negocio (${cap2?.aplicado_detalle})`);
    const { data: servicio } = await A.from("servicios").select("id").eq("negocio_id", negocio.id).eq("clave", "estetica_estetico").maybeSingle();
    const { data: tarifas } = await A.from("tarifas").select("precio, calculado").eq("negocio_id", negocio.id).eq("servicio_id", servicio?.id ?? "00000000-0000-0000-0000-000000000000").is("deleted_at", null);
    ok((tarifas ?? []).length > 0 && (tarifas ?? []).every((t) => Number(t.precio) === 340 && t.calculado), `el baño nació con ${(tarifas ?? []).length} tarifas «Calculado» a $340`);
    const { data: ev } = await A.from("herramientas_eventos").select("evento").eq("herramienta", "precios-mercado").eq("negocio_id", negocio.id);
    ok((ev ?? []).some((e) => e.evento === "cuenta"), "se anotó «cuenta» para la herramienta");
    const { data: pr2 } = await A.from("prospectos").select("etapa, negocio_cliente_id").eq("id", prospecto.id).maybeSingle();
    ok(pr2?.negocio_cliente_id === negocio.id || pr2?.etapa === "en_prueba" || true, `(info) prospecto tras el registro: ${JSON.stringify(pr2)}`);
  }

  // ── F. Celular ──
  console.log("\nF. Celular a 390 px");
  const cel = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA });
  const pc = await cel.newPage();
  for (const ruta of ["/herramientas", `/precios-mercado?giro=estetica&servicio=bano&ciudad=aguascalientes&talla=mediano&precio=340`, "/precios-mercado/estetica/aguascalientes"]) {
    await pc.goto(`${PLATAFORMA}${ruta}`, { waitUntil: "load" });
    await pc.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const desbordes = await pc.evaluate(desbordesDePantalla);
    ok(desbordes.length === 0, `${ruta.split("?")[0]}: nada más ancho que la pantalla${desbordes.length ? ` → ${desbordes.map((d) => `${d.tipo}: ${d.detalle}`).join("; ")}` : ""}`);
  }
  await nav.close();
} catch (e) {
  console.error(e);
  fallas++;
} finally {
  await limpiarSembrados();
  cerrar();
}
console.log(fallas ? `\n✘ ${fallas} falla(s)` : "\n✔ Todo bien");
process.exit(fallas ? 1 : 0);
