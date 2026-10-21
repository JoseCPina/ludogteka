// Imágenes de los anuncios de clic a WhatsApp de PeluDesk (21 de octubre de 2026).
//
//   node scripts/anuncios/creativos.mjs [--base https://patitasyco.peludesk.mx] [--solo-componer]
//
// 1. Capturas REALES de la demo (Patitas & Co., negocio de ejemplo con datos inventados) en tamaño celular:
//    agenda de cada giro (agenda clínica, agenda de estética, calendario de hotel y guardería, tablero del día),
//    cobro de una cuenta y el portal del dueño. Entra por /demo/entrar/<rol>?interno=1 (no cuenta como visita).
// 2. Las compone en 1080×1080 (feed) y 1080×1920 (historias y reels) con el encabezado del giro, la letra (Outfit)
//    y los colores de peludesk.mx, y deja los JPG en public/peludesk/anuncios/<giro>-<pieza>-<formato>.jpg, que la
//    tarea de Meta sube a la cuenta publicitaria (src/lib/meta-ads/campanas.ts). Nunca datos de Ludogteka ni de un
//    cliente real: la demo es ficticia.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { abrirNavegador } from "../lib/navegador.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opcion = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const BASE = opcion("--base", "https://patitasyco.peludesk.mx").replace(/\/$/, "");
const CAPTURAS = path.join(raiz, "scripts/anuncios/capturas");
const SALIDA = path.join(raiz, "public/peludesk/anuncios");
fs.mkdirSync(CAPTURAS, { recursive: true });
fs.mkdirSync(SALIDA, { recursive: true });

const GIROS = {
  veterinarias: { etiqueta: "Para veterinarias", fondo: "#4b3f72", tinta: "#fff8ee", acento: "#a7d8c8" },
  esteticas: { etiqueta: "Para estéticas caninas", fondo: "#f28c82", tinta: "#2b2a33", acento: "#4b3f72" },
  hotel_guarderia: { etiqueta: "Para hoteles y guarderías caninas", fondo: "#a7d8c8", tinta: "#2b2a33", acento: "#4b3f72" },
  retargeting: { etiqueta: "Tu negocio en PeluDesk", fondo: "#f5b85c", tinta: "#2b2a33", acento: "#4b3f72" },
};

// Qué captura va en cada pieza, por giro. La agenda busca, desde hoy hacia atrás, el primer día con citas (la demo
// envejece). El cobro abre, en Caja, la primera cuenta del giro.
// Un día sin ninguna hora de cita en pantalla («09:00 a.m.») es un día vacío.
const sinHoras = (texto) => !/\d{1,2}:\d{2}\s*[ap]\.?\s?m/i.test(texto);
const TOMAS = {
  "agenda-veterinarias": { rol: "veterinaria", ruta: (f) => `/veterinaria/agenda?vista=dia&fecha=${f}`, vacio: sinHoras },
  "agenda-esteticas": { rol: "estetica", ruta: (f) => `/estetica?fecha=${f}`, vacio: sinHoras },
  "agenda-hotel_guarderia": { rol: "recepcion", ruta: () => "/reservas/calendario" },
  "agenda-retargeting": { rol: "recepcion", ruta: () => "/recepcion" },
  "cobro-veterinarias": { rol: "recepcion", ruta: () => "/caja", cuenta: /Consulta|Hospitaliz|Vacuna/i },
  "cobro-esteticas": { rol: "recepcion", ruta: () => "/caja", cuenta: /Baño|Corte|Estética/i },
  "cobro-hotel_guarderia": { rol: "recepcion", ruta: () => "/caja", cuenta: /Hotel|Guardería/i },
  "cobro-retargeting": { rol: "recepcion", ruta: () => "/caja", cuenta: /Guardería|Baño|Hotel/i },
  portal: { rol: "cliente", ruta: () => "/portal" },
};
const dia = (d) => new Date(Date.now() - 6 * 3600_000 + d * 86_400_000).toISOString().slice(0, 10);

const TEXTOS = {
  agenda: {
    titulo: "Tu agenda, en orden",
    veterinarias: "Citas por médico, con expediente y vacunas a un toque.",
    esteticas: "Cada estilista con su agenda, sin citas encimadas.",
    hotel_guarderia: "Cupo de hotel y guardería por día, sin libreta.",
    retargeting: "Todo tu día en una pantalla: citas, llegadas y salidas.",
  },
  cobro: { titulo: "Cobra en un clic", texto: "Efectivo, terminal o link de pago, y el corte de caja cuadra solo." },
  portal: { titulo: "Tus clientes lo ven todo", texto: "Cada dueño ve sus citas y su mascota desde su celular." },
};

async function capturar() {
  const navegador = await abrirNavegador();
  try {
    const porRol = new Map();
    for (const [nombre, t] of Object.entries(TOMAS)) porRol.set(t.rol, [...(porRol.get(t.rol) ?? []), [nombre, t]]);
    for (const [rol, lista] of porRol) {
      const ctx = await navegador.newContext({ viewport: { width: 390, height: 1100 }, deviceScaleFactor: 2, reducedMotion: "reduce", locale: "es-MX", timezoneId: "America/Mexico_City" });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/demo/entrar/${rol}?interno=1`, { waitUntil: "load", timeout: 120_000 });
      for (const [nombre, t] of lista) {
        // Hoy, luego hacia adelante y hacia atrás hasta 30 días.
        for (const d of [0, ...Array.from({ length: 30 }, (_, i) => [i + 1, -(i + 1)]).flat()]) {
          await page.goto(BASE + t.ruta(dia(d)), { waitUntil: "networkidle", timeout: 120_000 });
          if (!t.vacio || !t.vacio(await page.evaluate(() => document.body.innerText))) break;
        }
        if (t.cuenta) {
          const cuentas = await page.evaluate(() =>
            [...document.querySelectorAll('a[href^="/caja/cobrar/"]')].map((a) => {
              // El texto de la tarjeta de la cuenta (no el del grupo de la persona).
              let e = a;
              for (let i = 0; i < 3 && e.parentElement && !/\$/.test(e.innerText); i++) e = e.parentElement;
              return { href: a.getAttribute("href"), texto: e.innerText };
            }),
          );
          const href = cuentas.find((c) => t.cuenta.test(c.texto))?.href ?? cuentas[0]?.href;
          if (href) await page.goto(BASE + href, { waitUntil: "networkidle", timeout: 120_000 });
        }
        // En la agenda, la columna de quien no tiene citas ese día no dice nada en un anuncio.
        await page.evaluate(() => {
          const vacias = [...document.querySelectorAll("p, span, div")].filter((e) => e.children.length === 0 && /^\s*Sin citas\.?\s*$/.test(e.textContent ?? ""));
          for (const e of vacias) e.parentElement?.remove();
        });
        // La tarjeta de videos de inicio y su «Ocultar» son de la app, no del negocio.
        await page.getByRole("button", { name: "Ocultar" }).first().click({ timeout: 2000 }).catch(() => {});
        await page.evaluate(() => {
          for (const h of document.querySelectorAll("h2, h3, p")) if (/Empieza con estos videos/.test(h.textContent ?? "")) h.closest("section, div.rounded-lg, div[class*=rounded]")?.remove();
        });
        // Avisos internos de la demo que no dicen nada a quien ve el anuncio.
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('[role="alert"], [role="status"]')) if (/cotizando|demo|ejemplo de PeluDesk/i.test(el.textContent ?? "")) el.remove();
        });
        await page.evaluate(() => document.fonts.ready);
        // Sin animaciones, sin el aviso de la demo ni el de instalar la app: la pantalla como la ve el negocio.
        await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important} nextjs-portal,[data-aviso-plan],[data-aviso-instalar]{display:none!important}" });
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(CAPTURAS, `${nombre}.png`) });
        console.log(`captura ${nombre} ← ${new URL(page.url()).pathname}`);
      }
      await ctx.close();
    }
  } finally {
    await navegador.close();
  }
}

const datos = (archivo, tipo) => `data:${tipo};base64,${fs.readFileSync(archivo).toString("base64")}`;

function html({ giro, pieza, formato }) {
  const g = GIROS[giro];
  const t = TEXTOS[pieza];
  const sub = pieza === "agenda" ? t[giro] : t.texto;
  const captura = datos(path.join(CAPTURAS, `${pieza === "portal" ? "portal" : `${pieza}-${giro}`}.png`), "image/png");
  const fuente = datos(path.join(raiz, "src/fuentes/outfit-latin.woff2"), "font/woff2");
  const logo = datos(path.join(raiz, "public/marca/peludesk/isotipo.svg"), "image/svg+xml");
  const vertical = formato === "vertical";
  // Historias y reels: arriba y abajo los tapa la interfaz (≈ 250 px): el texto va dentro.
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Outfit;src:url(${fuente}) format("woff2");font-weight:400 800}
*{box-sizing:border-box;margin:0}
html,body{width:1080px;height:${vertical ? 1920 : 1080}px;overflow:hidden}
body{font-family:Outfit,sans-serif;background:${g.fondo};color:${g.tinta};position:relative}
.chip{display:inline-block;background:${g.tinta};color:${g.fondo};font-weight:700;border-radius:999px;padding:14px 30px;font-size:${vertical ? 40 : 34}px}
h1{font-weight:800;line-height:1.02;letter-spacing:-1px;font-size:${vertical ? 104 : 88}px;margin-top:${vertical ? 34 : 26}px}
p.sub{font-weight:500;line-height:1.25;font-size:${vertical ? 46 : 38}px;margin-top:${vertical ? 26 : 20}px;opacity:.92}
.cta{display:inline-flex;align-items:center;gap:18px;background:${g.acento};color:${giro === "veterinarias" ? "#2b2a33" : "#fff8ee"};font-weight:800;border-radius:24px;padding:22px 32px;font-size:${vertical ? 44 : 36}px}
.marca{display:flex;align-items:center;gap:16px;font-weight:800;font-size:${vertical ? 50 : 40}px}
.marca img{width:${vertical ? 76 : 62}px;height:${vertical ? 76 : 62}px}
.cel{position:absolute;background:#2b2a33;border-radius:64px;padding:18px;box-shadow:0 30px 80px rgba(0,0,0,.28)}
.cel img{display:block;width:100%;height:100%;object-fit:cover;object-position:top;border-radius:48px}
</style></head><body>
${vertical
  ? `<div style="position:absolute;left:80px;right:80px;top:250px">
       <span class="chip">${g.etiqueta}</span><h1>${t.titulo}</h1><p class="sub">${sub}</p>
     </div>
     <div class="cel" style="left:250px;width:580px;top:760px;height:780px;overflow:hidden"><img src="${captura}"></div>
     <div style="position:absolute;left:80px;right:80px;bottom:250px;display:flex;justify-content:space-between;align-items:center;gap:20px">
       <div class="marca"><img src="${logo}">PeluDesk</div><span class="cta">Prueba gratis, sin tarjeta</span>
     </div>`
  : `<div style="position:absolute;left:70px;top:70px;width:520px">
       <span class="chip">${g.etiqueta}</span><h1>${t.titulo}</h1><p class="sub">${sub}</p>
     </div>
     <div style="position:absolute;left:70px;bottom:70px;width:520px;display:flex;flex-direction:column;gap:26px;align-items:flex-start">
       <span class="cta">Prueba gratis, sin tarjeta</span><div class="marca"><img src="${logo}">PeluDesk</div>
     </div>
     <div class="cel" style="left:640px;width:380px;top:60px;height:960px;overflow:hidden"><img src="${captura}"></div>`}
</body></html>`;
}

async function componer() {
  const navegador = await abrirNavegador();
  try {
    const page = await (await navegador.newContext({ deviceScaleFactor: 1 })).newPage();
    for (const giro of Object.keys(GIROS)) {
      for (const pieza of ["agenda", "cobro", "portal"]) {
        for (const formato of ["cuadrada", "vertical"]) {
          await page.setViewportSize({ width: 1080, height: formato === "vertical" ? 1920 : 1080 });
          await page.setContent(html({ giro, pieza, formato }), { waitUntil: "load" });
          await page.evaluate(() => document.fonts.ready);
          const png = await page.screenshot();
          const archivo = path.join(SALIDA, `${giro}-${pieza}-${formato}.jpg`);
          await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(archivo);
          console.log(`imagen ${path.relative(raiz, archivo)} (${Math.round(fs.statSync(archivo).size / 1024)} KB)`);
        }
      }
    }
  } finally {
    await navegador.close();
  }
}

if (!args.includes("--solo-componer")) await capturar();
await componer();
