// Graba UN video tutorial: la app de verdad (el negocio demo ficticio, en
// DESARROLLO), a 1920×1080, con cursor, ondas en cada clic, resaltado, zoom,
// etiqueta del paso y las tarjetas de título, resumen y «Siguiente».
//
// Por qué no `recordVideo` de Playwright (VP8 a ~1 Mbps: el texto sale
// borroso): se usa el screencast de Chromium (CDP) cuadro por cuadro en JPEG
// casi sin pérdida, y ffmpeg lo arma a 30 cps con la duración real de cada
// cuadro. Todo lo que se dibuja encima (cursor, resalte, tarjetas) vive en la
// página (lib/hud.mjs), así que lo que se ve es lo que queda.
//
// El guion es DECLARATIVO: cada paso es una tupla [verbo, …args]. Los textos
// de botones y campos se buscan por su nombre accesible, tal como aparecen en
// pantalla (el mismo que usan los artículos de ayuda).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { abrirNavegador } from "../../lib/navegador.mjs";
import { scriptCursor } from "../../videos/lib/grabar.mjs";
import { scriptHud, tarjetaTitulo, tarjetaResumen, tarjetaSiguiente } from "./hud.mjs";

export const ANCHO = 1920;
export const ALTO = 1080;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Cuánto tarda, más o menos, cada verbo (para repartir la pausa de una escena).
export function estimar(paso) {
  const [v, a, b, c] = paso;
  switch (v) {
    case "ir": return 2200;
    case "clic": return 1700 + (c?.espera ?? 0);
    case "escribir": return 1500 + String(b ?? "").length * 75;
    case "elegir": return 1900;
    case "rellenar": return 1700;
    case "marcar": return 1500;
    case "resaltar": return typeof b === "number" ? b : 2600;
    case "zoom": return (typeof c === "number" ? c : 2800) + 900;
    case "mover": return 1100;
    case "desplazar": return 1200;
    case "esperar": return typeof a === "number" ? a : 1000;
    case "tecla": return 600;
    case "subir": return 1500;
    case "js": return typeof a === "function" ? (b ?? 1500) : 1500;
    default: return 1000;
  }
}

// Un texto de la pantalla → un elemento. Se prueba en este orden: botón, enlace,
// pestaña, opción de menú, casilla, campo por su etiqueta o placeholder, y texto.
async function localizar(page, objetivo, { visibleEn = 20000, indice = 0 } = {}) {
  if (typeof objetivo !== "string") return objetivo;
  if (objetivo.startsWith("css:")) {
    const l = page.locator(objetivo.slice(4)).nth(indice);
    await l.waitFor({ state: "visible", timeout: visibleEn });
    return l;
  }
  const limite = Date.now() + visibleEn;
  const nombre = objetivo;
  while (Date.now() < limite) {
    for (const rol of ["button", "link", "tab", "menuitem", "checkbox", "radio", "switch", "option"]) {
      const l = page.getByRole(rol, { name: nombre, exact: false });
      const n = await l.count();
      for (let i = 0; i < n; i++) if (await l.nth(i).isVisible().catch(() => false)) return l.nth(i);
    }
    for (const l of [page.getByLabel(nombre, { exact: false }), page.getByPlaceholder(nombre, { exact: false }), page.getByText(nombre, { exact: false })]) {
      const n = await l.count();
      for (let i = 0; i < n; i++) if (await l.nth(i).isVisible().catch(() => false)) return l.nth(i);
    }
    await espera(300);
  }
  throw new Error(`No encontré «${objetivo}» en ${page.url()}`);
}

export async function grabarVideo({ base, cookies, inicio, guion, tarjetas, plan, salida, nombre, depurar = false, alAccion }) {
  fs.mkdirSync(salida, { recursive: true });
  const cuadros = path.join(salida, `${nombre}-cuadros`);
  fs.rmSync(cuadros, { recursive: true, force: true });
  fs.mkdirSync(cuadros);

  const navegador = await abrirNavegador();
  const ctx = await navegador.newContext({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1, locale: "es-MX", timezoneId: "America/Mexico_City" });
  if (cookies?.length) await ctx.addCookies(cookies);
  const logo = `${base}/marca/peludesk/isotipo.svg`;
  await ctx.addInitScript(scriptCursor("flecha"));
  await ctx.addInitScript(scriptHud(logo));
  // Un texto fijo con el nombre de otro negocio (defecto de la app) no se muestra en el video:
  // se oculta SOLO en la grabación (la app no se toca) y el defecto se anota en el reporte.
  await ctx.addInitScript(() => {
    const ocultar = () => {
      if (!document.body) return;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (/ludogteka/i.test(n.textContent) && n.parentElement && !n.parentElement.dataset.pdOculto) {
          n.parentElement.dataset.pdOculto = n.textContent.trim().slice(0, 80);
          n.parentElement.style.visibility = "hidden";
        }
      }
    };
    new MutationObserver(ocultar).observe(document, { childList: true, subtree: true, characterData: true });
    document.addEventListener("DOMContentLoaded", ocultar);
    setInterval(ocultar, 400);
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  ctx.on("page", (p) => { if (p !== page) p.close().catch(() => {}); });

  // Entra a la pantalla de inicio y espera a que cargue de verdad.
  const r = await page.goto(base + inicio, { waitUntil: "networkidle", timeout: 120000 });
  if (!r || r.status() >= 400 || (cookies?.length && /\/login|\/sin-acceso/.test(page.url()))) throw new Error(`No se pudo entrar a ${inicio} (${page.url()}).`);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}input[type=file]{visibility:hidden!important}*{caret-color:transparent!important}html{scrollbar-width:none}::-webkit-scrollbar{display:none}" });

  // La tarjeta de título ya puesta ANTES de empezar a grabar.
  await page.evaluate((h) => window.__tut.tarjeta(h), tarjetas.titulo);
  await espera(800);

  const lista = [];
  let n = 0;
  const cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    const archivo = path.join(cuadros, `${String(n++).padStart(6, "0")}.jpg`);
    fs.writeFileSync(archivo, Buffer.from(data, "base64"));
    lista.push({ archivo, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  const pos = { x: ANCHO * 0.62, y: ALTO * 0.7 };
  await page.evaluate(({ x, y }) => window.__pdCursor?.poner(x, y), pos);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, everyNthFrame: 2 });
  const t0 = Date.now() / 1000;
  const ahora = () => Date.now() / 1000 - t0;
  const tiempos = { escenas: [] };
  let etiquetaActual = null;
  const muestras = [];
  const muestrear = async (escenaN) => {
    const url = page.url();
    const texto = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    // Lo que de verdad se ve en pantalla en este momento (el QC es estricto con esto).
    const visible = await page.evaluate(() => {
      const sal = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = n.textContent.trim();
        if (!t) continue;
        if (n.parentElement && getComputedStyle(n.parentElement).visibility === "hidden") continue;
        const r = document.createRange(); r.selectNodeContents(n);
        const b = r.getBoundingClientRect();
        if (b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth) sal.push(t);
      }
      return sal.join("\n");
    }).catch(() => "");
    const ocultos = await page.evaluate(() => [...document.querySelectorAll("[data-pd-oculto]")].map((e) => e.dataset.pdOculto)).catch(() => []);
    muestras.push({ escena: escenaN, t: Number(ahora().toFixed(2)), url, texto: (texto + "\n" + ocultos.join("\n")).slice(0, 6000), visible: visible.slice(0, 6000), ocultos });
  };

  const reponer = async () => {
    await page.evaluate(({ x, y }) => window.__pdCursor?.poner(x, y), pos).catch(() => {});
    if (etiquetaActual) await page.evaluate(({ n, t }) => { const e = window.__tut; e.etiqueta(n, t); const el = document.getElementById("pd-etiqueta"); if (el) { el.style.transition = "none"; el.classList.add("ver"); void el.offsetWidth; el.style.transition = ""; } }, etiquetaActual).catch(() => {});
  };
  const centro = async (loc) => {
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const c = await loc.boundingBox();
    if (!c) throw new Error("El elemento no tiene caja en pantalla");
    return { x: c.x + c.width / 2, y: c.y + c.height / 2, caja: { x: c.x, y: c.y, w: c.width, h: c.height } };
  };
  async function mover(objetivo, { ms = 800, dx = 0, dy = 0 } = {}) {
    await page.evaluate(() => window.__tut.alejar(0)).catch(() => {});
    const loc = await localizar(page, objetivo);
    const c = await centro(loc);
    const x = c.x + dx, y = c.y + dy;
    await Promise.all([
      page.evaluate(({ x, y, ms }) => window.__pdCursor.mover(x, y, ms), { x, y, ms }),
      page.mouse.move(x, y, { steps: Math.max(4, Math.round(ms / 40)) }),
    ]);
    pos.x = x; pos.y = y;
    return { loc, c };
  }
  async function clic(objetivo, { nav = false, espera: extra = 0 } = {}) {
    const { loc } = await mover(objetivo);
    const antes = page.url();
    await espera(160);
    await page.evaluate(() => { window.__pdCursor.presionar(true); window.__pdCursor.onda(); });
    await loc.click({ delay: 90, timeout: 15000, position: undefined, force: false }).catch(async () => { await page.mouse.down(); await espera(90); await page.mouse.up(); });
    await page.evaluate(() => window.__pdCursor?.presionar(false)).catch(() => {});
    if (nav) {
      await page.waitForURL((u) => u.href !== antes, { timeout: 30000 }).catch(() => {});
      await page.waitForLoadState("networkidle").catch(() => {});
      await reponer();
    } else {
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
      if (page.url() !== antes) await reponer();
    }
    if (extra) await espera(extra);
  }

  const accion = {
    async ir(ruta) {
      await page.evaluate(() => window.__tut.alejar(0)).catch(() => {});
      await page.goto(base + ruta, { waitUntil: "networkidle" });
      await reponer();
    },
    async clic(objetivo, opciones) { await clic(objetivo, opciones); },
    async escribir(etiqueta, valor) {
      const { loc } = await mover(etiqueta, { ms: 700 });
      await page.evaluate(() => { window.__pdCursor.onda(); });
      await loc.click({ timeout: 10000 }).catch(() => {});
      await page.keyboard.press("Control+A");
      await page.keyboard.type(String(valor), { delay: 65 });
    },
    // Campos que no se teclean (fecha y hora): se rellenan de golpe, con el cursor encima.
    async rellenar(etiqueta, valor) {
      const { loc } = await mover(etiqueta, { ms: 700 });
      await page.evaluate(() => { window.__pdCursor.onda(); });
      await loc.fill(String(valor));
      await espera(500);
    },
    async elegir(etiqueta, opcion) {
      const { loc } = await mover(etiqueta, { ms: 750 });
      await page.evaluate(() => { window.__pdCursor.onda(); });
      if (typeof opcion === "number") await loc.selectOption({ index: opcion });
      else await loc.selectOption({ label: opcion }).catch(async () => { const ops = await loc.locator("option").allInnerTexts(); const i = ops.findIndex((t) => t.toLowerCase().includes(String(opcion).toLowerCase())); if (i < 0) throw new Error(`No hay la opción «${opcion}» en «${etiqueta}» (${ops.join(" | ")})`); await loc.selectOption({ index: i }); });
      await espera(400);
    },
    async marcar(etiqueta) { await clic(etiqueta); },
    async mover(objetivo) { await mover(objetivo, { ms: 900 }); },
    async resaltar(objetivo, ms = 2600) {
      await page.evaluate(() => window.__tut.alejar(0)).catch(() => {});
      const loc = await localizar(page, objetivo);
      const c = await centro(loc);
      await page.evaluate((caja) => window.__tut.resaltar(caja), c.caja);
      await espera(ms);
      await page.evaluate(() => window.__tut.quitarResalte());
      await espera(300);
    },
    async zoom(objetivo, factor = 1.7, ms = 2800) {
      const loc = await localizar(page, objetivo);
      const c = await centro(loc);
      await espera(150);
      await page.evaluate(({ caja, f }) => window.__tut.zoom(caja, f), { caja: c.caja, f: factor });
      await espera(ms);
      await page.evaluate(() => window.__tut.alejar());
      await espera(700);
    },
    async desplazar(destino) {
      await page.evaluate(() => window.__tut.alejar(0)).catch(() => {});
      if (typeof destino === "number") {
        await page.evaluate((y) => new Promise((ok) => { const y0 = scrollY, t0 = performance.now(); const f = (a) => { const t = Math.min(1, (a - t0) / 900); scrollTo(0, y0 + (y - y0) * (1 - Math.pow(1 - t, 3))); t < 1 ? requestAnimationFrame(f) : ok(); }; requestAnimationFrame(f); }), destino);
      } else {
        const loc = await localizar(page, destino);
        const y = await loc.evaluate((e) => e.getBoundingClientRect().top + scrollY - 140);
        await page.evaluate((y) => new Promise((ok) => { const y0 = scrollY, t0 = performance.now(); const f = (a) => { const t = Math.min(1, (a - t0) / 1000); scrollTo(0, y0 + (y - y0) * (1 - Math.pow(1 - t, 3))); t < 1 ? requestAnimationFrame(f) : ok(); }; requestAnimationFrame(f); }), Math.max(0, y));
      }
      await espera(300);
    },
    async esperar(ms) { await espera(ms); },
    async tecla(t) { await page.keyboard.press(t); await espera(300); },
    async subir(objetivo, archivo) {
      const loc = typeof objetivo === "string" && objetivo.startsWith("css:") ? page.locator(objetivo.slice(4)).first() : page.locator('input[type="file"]').first();
      await loc.setInputFiles(archivo);
      await espera(900);
    },
    async js(fn) { await fn({ page, ctx, base, ahora, mover, clic, centro, localizar: (o) => localizar(page, o) }); await reponer(); },
  };

  const correrPaso = async (paso) => {
    const [verbo, ...args] = paso;
    if (!accion[verbo]) throw new Error(`Verbo desconocido en el guion: ${verbo}`);
    if (alAccion) alAccion(verbo, args);
    await accion[verbo](...args);
  };

  async function escena(def, seg, numero, total) {
    const ini = ahora();
    etiquetaActual = def.titulo ? { n: `${numero}/${total}`, t: def.titulo } : null;
    if (etiquetaActual) await page.evaluate(({ n, t }) => window.__tut.etiqueta(n, t), etiquetaActual);
    const pasos = def.pasos ?? [];
    const est = pasos.reduce((s, p) => s + estimar(p), 0);
    const pausa = Math.min(3500, Math.max(0, seg * 1000 - est) / (pasos.length + 1));
    let actual = null;
    try {
      for (const paso of pasos) {
        actual = paso;
        await espera(pausa);
        await correrPaso(paso);
        await muestrear(numero);
      }
    } catch (e) {
      await page.screenshot({ path: path.join(salida, `${nombre}-error.png`) }).catch(() => {});
      e.message = `Escena ${numero} («${def.titulo ?? ""}»), paso ${JSON.stringify(actual, (k, v) => (typeof v === "function" ? "[función]" : v))}: ${e.message}`;
      throw e;
    }
    const falta = ini + seg - ahora();
    if (falta > 0) await espera(falta * 1000);
    await page.evaluate(() => { window.__tut.alejar(0); window.__tut.quitarResalte(); }).catch(() => {});
    return { ini, fin: ahora() };
  }

  let errorFinal = null;
  try {
    // ── Título (la voz dice el gancho) ──
    tiempos.titulo = { ini: ahora() };
    await espera(plan.titulo * 1000);
    await page.evaluate(() => window.__tut.quitarTarjeta());
    tiempos.titulo.fin = ahora();
    await espera(600);
    // ── Pasos ──
    for (const [i, def] of guion.escenas.entries()) {
      tiempos.escenas.push(await escena(def, plan.escenas[i], i + 1, guion.escenas.length));
    }
    etiquetaActual = null;
    await page.evaluate(() => window.__tut.quitarEtiqueta()).catch(() => {});
    // ── Resumen ──
    tiempos.resumen = { ini: ahora() };
    await page.evaluate((h) => window.__tut.tarjeta(h), tarjetas.resumen);
    await espera(900);
    await page.evaluate(() => window.__tut.puntos());
    const resto = tiempos.resumen.ini + plan.resumen - ahora();
    if (resto > 0) await espera(resto * 1000);
    tiempos.resumen.fin = ahora();
    // ── Siguiente ──
    tiempos.cierre = { ini: ahora() };
    await page.evaluate((h) => { const t = document.getElementById("pd-tarjeta"); t.classList.remove("ver"); setTimeout(() => window.__tut.tarjeta(h), 450); }, tarjetas.cierre);
    await espera(plan.cierre * 1000);
    tiempos.cierre.fin = ahora();
  } catch (e) {
    errorFinal = e;
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => {});
    await espera(250);
  }
  const fin = ahora();
  await ctx.close();
  await navegador.close();
  if (errorFinal) {
    fs.rmSync(cuadros, { recursive: true, force: true });
    throw errorFinal;
  }

  // ── Cuadros → MP4 (sin audio) a 30 cps con la duración real de cada cuadro ──
  if (!lista.length) throw new Error("La grabación no produjo cuadros");
  lista.sort((a, b) => a.t - b.t);
  const concat = [];
  for (let i = 0; i < lista.length; i++) {
    const desde = i === 0 ? t0 : lista[i].t;
    const hasta = i + 1 < lista.length ? lista[i + 1].t : t0 + fin;
    concat.push(`file '${lista[i].archivo.replaceAll(path.sep, "/")}'`, `duration ${Math.max(0.001, hasta - desde).toFixed(4)}`);
  }
  concat.push(`file '${lista.at(-1).archivo.replaceAll(path.sep, "/")}'`);
  const listaTxt = path.join(cuadros, "lista.txt");
  fs.writeFileSync(listaTxt, concat.join("\n"));
  const mp4 = path.join(salida, `${nombre}-crudo.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listaTxt, "-vf", `fps=30,scale=${ANCHO}:${ALTO},format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-g", "60", "-movflags", "+faststart", mp4], { maxBuffer: 1 << 26 });
  const cuadrosN = lista.length;
  fs.rmSync(cuadros, { recursive: true, force: true });
  return { mp4, duracion: fin, tiempos, cuadros: cuadrosN, muestras };
}

export { tarjetaTitulo, tarjetaResumen, tarjetaSiguiente };
