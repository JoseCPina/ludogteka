// Graba la app de verdad (el negocio de demostración) con Playwright.
//
// Por qué no `recordVideo` de Playwright: codifica en VP8 a ~1 Mbps y el
// texto de la interfaz sale borroso en cuanto la cámara hace zoom. Aquí se
// usa el screencast de Chromium (CDP) a 2x, cuadro por cuadro en JPEG casi
// sin pérdida, y ffmpeg lo arma a 30 cuadros por segundo con la duración
// real de cada cuadro.
//
// El cursor (o el dedo, en tablet y teléfono) se dibuja DENTRO de la página
// y se mueve con aceleración y frenado; el mouse real de Playwright va por
// el mismo camino, así que hover y clic son los de la app. Cada clic deja
// una onda visible.
//
// Además de la grabación, cada toma guarda MARCAS: dónde estaba un elemento
// (caja en px de la pantalla) y en qué segundo, con un recorte PNG del
// elemento. Con eso el compositor hace zoom a la posición exacta del
// elemento y "saca" el elemento de la pantalla a la escena. Si la app
// cambia, se vuelve a grabar y las marcas se mueven solas.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { abrirNavegador } from "../../lib/navegador.mjs";

const CSS_GRABACION = `
  nextjs-portal{display:none!important}
  [data-aviso-plan=demo]{display:none!important}
  input[type=file]{visibility:hidden!important} /* el chrome-headless-shell lo pinta en inglés ("Choose File") */
  *{caret-color:transparent!important}
  html{scrollbar-width:none} ::-webkit-scrollbar{display:none}
  #pd-cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform}
  #pd-cursor svg{display:block;transform-origin:4px 3px;transition:transform 110ms cubic-bezier(.3,1.4,.6,1)}
  #pd-cursor.dedo svg{transform-origin:center}
  #pd-cursor.abajo svg{transform:scale(.82)}
  .pd-onda{position:fixed;z-index:2147483646;pointer-events:none;border-radius:999px;border:3px solid #4b3f72;
    width:18px;height:18px;margin:-9px 0 0 -9px;animation:pd-onda 520ms cubic-bezier(.2,.8,.3,1) forwards}
  @keyframes pd-onda{from{transform:scale(.4);opacity:.9}to{transform:scale(3.4);opacity:0}}
`;

// El cursor vive en la página: se re-crea en cada navegación.
function scriptCursor(tipo) {
  const flecha = `<svg width="30" height="36" viewBox="0 0 30 36"><path d="M4 3 L4 29 L10.5 23 L15 33 L19.5 31 L15 21.5 L24 21.5 Z" fill="#fff" stroke="#2b2a33" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
  const dedo = `<svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="rgba(75,63,114,.28)" stroke="rgba(255,255,255,.9)" stroke-width="3"/></svg>`;
  return `(() => {
    const TIPO = ${JSON.stringify(tipo)};
    const html = ${JSON.stringify(tipo === "dedo" ? dedo : flecha)};
    const DX = TIPO === "dedo" ? -23 : -4, DY = TIPO === "dedo" ? -23 : -3;
    let x = -80, y = -80;
    function el() {
      let c = document.getElementById("pd-cursor");
      if (!c && document.body) {
        c = document.createElement("div"); c.id = "pd-cursor"; c.className = TIPO; c.innerHTML = html;
        document.body.appendChild(c);
      }
      return c;
    }
    function pintar() { const c = el(); if (c) c.style.transform = "translate(" + (x + DX) + "px," + (y + DY) + "px)"; }
    // Aceleración y frenado con un poco de curva, como una mano.
    function mover(nx, ny, ms) {
      return new Promise((listo) => {
        const x0 = x, y0 = y, t0 = performance.now();
        const curva = Math.min(60, Math.hypot(nx - x0, ny - y0) * 0.12);
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        function paso(ahora) {
          const t = Math.min(1, (ahora - t0) / ms), e = ease(t);
          x = x0 + (nx - x0) * e; y = y0 + (ny - y0) * e - Math.sin(Math.PI * e) * curva;
          pintar();
          if (t < 1) requestAnimationFrame(paso); else listo();
        }
        requestAnimationFrame(paso);
      });
    }
    function poner(nx, ny) { x = nx; y = ny; pintar(); }
    function presionar(abajo) { const c = el(); if (c) c.classList.toggle("abajo", abajo); }
    function onda() {
      const o = document.createElement("div"); o.className = "pd-onda";
      o.style.left = x + "px"; o.style.top = y + "px";
      document.body.appendChild(o); setTimeout(() => o.remove(), 700);
    }
    window.__pdCursor = { mover, poner, presionar, onda, pos: () => ({ x, y }) };
    const iniciar = () => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(CSS_GRABACION)}; document.head.appendChild(s); pintar(); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
  })();`;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Graba una toma.
 *   base      http://patitasyco.localhost:3001
 *   rol       recepcion | estetica | admin | cliente (entra por /demo/entrar/<rol>)
 *   ruta      pantalla donde empieza
 *   ancho/alto  viewport en px CSS
 *   puntero   "flecha" (monitor) | "dedo" (tablet y teléfono)
 *   pasos     async (g) => { … }  lo que se hace frente a la cámara
 */
export async function grabar({ base, rol, ruta, ancho, alto, escala = 2, puntero = "flecha", salida, nombre, antes, pasos }) {
  fs.mkdirSync(salida, { recursive: true });
  const cuadros = path.join(salida, `${nombre}-cuadros`);
  fs.rmSync(cuadros, { recursive: true, force: true });
  fs.mkdirSync(cuadros);

  const navegador = await abrirNavegador();
  const movil = puntero === "dedo";
  const ctx = await navegador.newContext({
    viewport: { width: ancho, height: alto },
    deviceScaleFactor: escala,
    isMobile: movil && ancho < 700,
    hasTouch: movil,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
  });
  await ctx.addInitScript(scriptCursor(puntero));
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  const r = await page.goto(`${base}/demo/entrar/${rol}`, { waitUntil: "load", timeout: 120000 });
  if (!r || r.status() >= 400 || page.url().includes("/login") || page.url().includes("error=")) {
    throw new Error(`No se pudo entrar al demo como ${rol} (${page.url()}). ¿Está sembrado y en solo lectura?`);
  }
  await page.goto(base + ruta, { waitUntil: "networkidle", timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  if (antes) await antes(page);
  await espera(400);

  // ── Screencast ──
  const cdp = await ctx.newCDPSession(page);
  const lista = [];
  let n = 0;
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const archivo = path.join(cuadros, `${String(n++).padStart(6, "0")}.jpg`);
    fs.writeFileSync(archivo, Buffer.from(data, "base64"));
    lista.push({ archivo, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  const pos = { x: ancho * 0.62, y: alto * 0.7 };
  await page.evaluate(({ x, y }) => window.__pdCursor?.poner(x, y), pos);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 94, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  const ahora = () => Date.now() / 1000 - t0;
  const marcas = {};

  async function centro(objetivo) {
    const loc = typeof objetivo === "string" ? page.locator(objetivo).first() : objetivo;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const c = await loc.boundingBox();
    if (!c) throw new Error(`No encontré el elemento para el cursor: ${objetivo}`);
    return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
  }
  async function reponerCursor() {
    await page.evaluate(({ x, y }) => window.__pdCursor?.poner(x, y), pos).catch(() => {});
  }

  const g = {
    page,
    ahora,
    pausa: (ms) => espera(ms),
    async mover(objetivo, { ms = 750, dx = 0, dy = 0 } = {}) {
      const c = typeof objetivo === "object" && "x" in objetivo ? objetivo : await centro(objetivo);
      const x = c.x + dx, y = c.y + dy;
      await Promise.all([
        page.evaluate(({ x, y, ms }) => window.__pdCursor.mover(x, y, ms), { x, y, ms }),
        page.mouse.move(x, y, { steps: Math.max(4, Math.round(ms / 40)) }),
      ]);
      pos.x = x; pos.y = y;
    },
    async clic(objetivo, { ms = 750, navega = false, marca } = {}) {
      await g.mover(objetivo, { ms });
      const antes = page.url();
      await espera(140);
      if (marca) marcas[marca] = { t: ahora(), x: pos.x, y: pos.y, clic: true };
      await page.evaluate(() => { window.__pdCursor.presionar(true); window.__pdCursor.onda(); });
      await page.mouse.down();
      await espera(90);
      await page.mouse.up();
      await page.evaluate(() => window.__pdCursor?.presionar(false)).catch(() => {});
      if (navega) {
        // Los <Link> de Next navegan del lado del cliente: se espera a que cambie la URL.
        await page.waitForURL((u) => u.href !== antes, { timeout: 30000 }).catch(() => {});
        await page.waitForLoadState("networkidle").catch(() => {});
        await reponerCursor();
      }
    },
    async desplazar(y, { ms = 900 } = {}) {
      await page.evaluate(({ y, ms }) => new Promise((listo) => {
        const y0 = window.scrollY, t0 = performance.now();
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        function paso(a) { const t = Math.min(1, (a - t0) / ms); window.scrollTo(0, y0 + (y - y0) * ease(t)); if (t < 1) requestAnimationFrame(paso); else listo(); }
        requestAnimationFrame(paso);
      }), { y, ms });
    },
    // Desplaza hasta que el elemento quede a `margen` px del borde de arriba.
    async desplazarA(objetivo, { margen = 24, ms = 1000 } = {}) {
      const loc = typeof objetivo === "string" ? page.locator(objetivo).first() : objetivo;
      const y = await loc.evaluate((el, m) => el.getBoundingClientRect().top + window.scrollY - m, margen);
      await g.desplazar(Math.max(0, y), { ms });
    },
    async escribir(objetivo, texto, { retraso = 110 } = {}) {
      await g.clic(objetivo, { ms: 650 });
      await page.keyboard.type(texto, { delay: retraso });
    },
    async ir(ruta) {
      await page.goto(base + ruta, { waitUntil: "networkidle" });
      await reponerCursor();
    },
    // Anota dónde está un elemento en este segundo, con su recorte.
    async marca(nombreMarca, objetivo, { recorte = true, relleno = 0 } = {}) {
      const loc = typeof objetivo === "string" ? page.locator(objetivo).first() : objetivo;
      const c = await loc.boundingBox();
      if (!c) throw new Error(`Marca ${nombreMarca}: no encontré ${objetivo}`);
      const caja = { x: c.x - relleno, y: c.y - relleno, w: c.width + relleno * 2, h: c.height + relleno * 2 };
      const m = { t: ahora(), ...caja, texto: (await loc.innerText().catch(() => "")).trim() };
      // El recorte solo puede ser de lo que se ve.
      const vis = { x: Math.max(0, caja.x), y: Math.max(0, caja.y) };
      vis.w = Math.min(ancho, caja.x + caja.w) - vis.x;
      vis.h = Math.min(alto, caja.y + caja.h) - vis.y;
      if (vis.w < 4 || vis.h < 4) throw new Error(`Marca ${nombreMarca}: el elemento no está en pantalla (${JSON.stringify(caja)}) en ${page.url()}`);
      if (recorte) {
        const archivo = `${nombre}-${nombreMarca}.png`;
        await page.screenshot({ path: path.join(salida, archivo), clip: { x: vis.x, y: vis.y, width: vis.w, height: vis.h } });
        m.recorte = archivo;
      }
      marcas[nombreMarca] = m;
      return m;
    },
    // La pantalla completa en este momento (para dispositivos que solo muestran una imagen).
    async foto(nombreFoto) {
      const archivo = `${nombre}-${nombreFoto}.png`;
      await page.screenshot({ path: path.join(salida, archivo) });
      marcas[nombreFoto] = { t: ahora(), x: 0, y: 0, w: ancho, h: alto, recorte: archivo };
    },
  };

  try {
    await pasos(g);
    await espera(500);
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => {});
    await espera(200);
  }
  const fin = ahora();
  await ctx.close();
  await navegador.close();

  // ── Cuadros → MP4 a 30 cps con la duración real de cada cuadro ──
  if (!lista.length) throw new Error(`La toma ${nombre} no produjo cuadros`);
  lista.sort((a, b) => a.t - b.t);
  const concat = [];
  // El primer cuadro cubre desde el inicio de la toma.
  for (let i = 0; i < lista.length; i++) {
    const desde = i === 0 ? t0 : lista[i].t;
    const hasta = i + 1 < lista.length ? lista[i + 1].t : t0 + fin;
    concat.push(`file '${lista[i].archivo.replaceAll(path.sep, "/")}'`,`duration ${Math.max(0.001, hasta - desde).toFixed(4)}`);
  }
  concat.push(`file '${lista.at(-1).archivo.replaceAll(path.sep, "/")}'`);
  const listaTxt = path.join(cuadros, "lista.txt");
  fs.writeFileSync(listaTxt, concat.join("\n"));
  const mp4 = path.join(salida, `${nombre}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listaTxt,
    "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-g", "30", "-keyint_min", "30", "-movflags", "+faststart", mp4, // un keyframe por segundo: HyperFrames busca cuadros sueltos
  ]);
  fs.rmSync(cuadros, { recursive: true, force: true });

  const meta = { nombre, rol, ruta, ancho, alto, escala, puntero, duracion: Number(fin.toFixed(3)), cuadros: lista.length, marcas };
  fs.writeFileSync(path.join(salida, `${nombre}.json`), JSON.stringify(meta, null, 2));
  console.log(`  ✔ ${nombre}: ${fin.toFixed(1)} s, ${lista.length} cuadros (${(lista.length / fin).toFixed(0)} cps), ${Object.keys(marcas).length} marcas`);
  return meta;
}
