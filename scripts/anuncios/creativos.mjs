// Imágenes de los anuncios de clic a WhatsApp de PeluDesk (21 de octubre de 2026).
//
//   node scripts/anuncios/creativos.mjs [--base https://patitasyco.peludesk.mx] [--solo-componer] [--piezas recordatorio]
//
// --piezas: las que se componen (agenda,cobro,portal,recordatorio; todas por omisión). «recordatorio» (oct 2026) es
// una maqueta del chat de WhatsApp con el recordatorio automático y sus botones, no una captura.
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
  // Recordatorios automáticos por WhatsApp (oct 2026): no es captura, es una maqueta del chat (chatRecordatorio).
  recordatorio: {
    titulo: "Tus clientes confirman su cita solos por WhatsApp",
    veterinarias: "Recordatorio automático de citas y vacunas, el día anterior.",
    esteticas: "El recordatorio sale solo el día anterior. Menos plantones.",
    hotel_guarderia: "Recordatorio automático de llegada, el día anterior.",
    retargeting: "Sale solo el día anterior, con el nombre de tu negocio.",
  },
};

// Lo que dice el recordatorio en la maqueta, por giro (Patitas & Co. es el negocio de ejemplo de la demo).
const RECORDATORIO = {
  veterinarias: { mensaje: "Hola Ana, te recordamos la cita de *Rocky* en *Patitas & Co.* mañana jueves 29 de octubre a las 17:00 (Consulta con la Dra. Sofía Reyes). Confírmanos con un botón.", agenda: "Rocky · 17:00" },
  esteticas: { mensaje: "Hola Ana, te recordamos la cita de *Rocky* en *Patitas & Co.* mañana jueves 29 de octubre a las 11:00 (Baño y corte). Confírmanos con un botón.", agenda: "Rocky · 11:00" },
  hotel_guarderia: { mensaje: "Hola Ana, te recordamos la llegada de *Rocky* a *Patitas & Co.* mañana jueves 29 de octubre a las 9:00 (Hotel). Confírmanos con un botón.", agenda: "Rocky · 9:00", lista: "Llegadas · mañana" },
  retargeting: { mensaje: "Hola Ana, te recordamos la cita de *Rocky* en *Patitas & Co.* mañana jueves 29 de octubre a las 11:00 (Baño y corte). Confírmanos con un botón.", agenda: "Rocky · 11:00" },
};

// Las piezas que se componen (--piezas recordatorio compone solo esa, sin capturas).
const PIEZAS_TODAS = ["agenda", "cobro", "portal", "recordatorio"];
const PIEZAS = (opcion("--piezas", PIEZAS_TODAS.join(",")) ?? "").split(",").map((p) => p.trim()).filter((p) => PIEZAS_TODAS.includes(p));

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

/**
 * Maqueta del chat de WhatsApp: llega el recordatorio (del número de PeluDesk, con el nombre del negocio en el texto)
 * con los botones «Confirmo» y «Necesito cambiarla», y el cliente toca «Confirmo». Se dibuja a 344 px de ancho (la
 * pantalla del celular cuadrado) y en la vertical se escala.
 */
function chatRecordatorio(giro, logo, alto, ancho = 344) {
  const r = RECORDATORIO[giro];
  const negritas = r.mensaje.replace(/\*([^*]+)\*/g, "<b>$1</b>");
  const palomitas = `<svg width="18" height="11" viewBox="0 0 18 11"><path d="M1 6l3 3 6-7M7 9l1 1 7-8" fill="none" stroke="#53bdeb" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<div class="wa" style="height:${alto}px;width:${ancho}px">
    <div class="wa-barra"><span class="wa-atras">‹</span><img src="${logo}"><div><b>PeluDesk</b><small>Cuenta de empresa</small></div></div>
    <div class="wa-chat">
      <span class="wa-dia">Hoy</span>
      <div class="wa-recibido"><p>${negritas}</p><p class="wa-pie">Para no recibir recordatorios, responde BAJA.</p><time>10:00 a.m.</time></div>
      <div class="wa-boton">↩ Confirmo</div>
      <div class="wa-boton">↩ Necesito cambiarla</div>
      <div class="wa-enviado"><p>Confirmo</p><time>10:02 a.m. ${palomitas}</time></div>
    </div>
  </div>`;
}

const ESTILO_CHAT = `
.wa{display:flex;flex-direction:column;background:#efeae2;font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#111b21}
.wa-barra{display:flex;align-items:center;gap:10px;background:#008069;color:#fff;padding:34px 12px 12px}
.wa-barra img{width:38px;height:38px;border-radius:50%}
.wa-barra b{display:block;font-size:17px}
.wa-barra small{display:block;font-size:12.5px;opacity:.85}
.wa-atras{font-size:30px;line-height:1;margin-right:-2px}
.wa-chat{flex:1;display:flex;flex-direction:column;gap:6px;padding:12px 12px 16px}
.wa-dia{align-self:center;background:#fff;color:#54656f;font-size:12.5px;border-radius:8px;padding:4px 10px;margin-bottom:6px;box-shadow:0 1px .5px rgba(0,0,0,.13)}
.wa-recibido,.wa-enviado{max-width:86%;border-radius:10px;padding:8px 10px 6px;font-size:15.5px;line-height:1.35;box-shadow:0 1px .5px rgba(0,0,0,.13)}
.wa-recibido{align-self:flex-start;background:#fff;border-top-left-radius:2px}
.wa-recibido p+p{margin-top:6px}
.wa-pie{font-size:12.5px;color:#667781}
.wa-enviado{align-self:flex-end;background:#d9fdd3;border-top-right-radius:2px;margin-top:10px}
.wa-recibido time,.wa-enviado time{display:flex;justify-content:flex-end;align-items:center;gap:4px;font-size:11.5px;color:#667781;margin-top:3px}
.wa-boton{align-self:flex-start;width:86%;background:#fff;color:#027eb5;text-align:center;font-size:15.5px;font-weight:600;border-radius:10px;padding:10px;box-shadow:0 1px .5px rgba(0,0,0,.13)}
.agenda{position:absolute;background:#fff8ee;color:#2b2a33;border-radius:26px;box-shadow:0 24px 60px rgba(0,0,0,.25);display:flex;align-items:center;gap:18px}
.agenda .ok{flex:none;border-radius:50%;background:#a7d8c8;color:#2b2a33;display:flex;align-items:center;justify-content:center;font-weight:800}
.agenda small{display:block;font-weight:600;opacity:.65}
.agenda b{display:block;font-weight:800}
`;

function html({ giro, pieza, formato }) {
  const g = GIROS[giro];
  const t = TEXTOS[pieza];
  const sub = pieza === "agenda" || pieza === "recordatorio" ? t[giro] : t.texto;
  const fuente = datos(path.join(raiz, "src/fuentes/outfit-latin.woff2"), "font/woff2");
  const logo = datos(path.join(raiz, "public/marca/peludesk/isotipo.svg"), "image/svg+xml");
  const vertical = formato === "vertical";
  if (pieza === "recordatorio") return htmlRecordatorio({ giro, g, t, sub, fuente, logo, vertical });
  const captura = datos(path.join(CAPTURAS, `${pieza === "portal" ? "portal" : `${pieza}-${giro}`}.png`), "image/png");
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

/** La pieza «recordatorio»: encabezado del giro y la maqueta del chat en el celular, con la cita ya confirmada. */
function htmlRecordatorio({ giro, g, t, sub, fuente, logo, vertical }) {
  // Pantalla del celular: 344 × 924 px en la cuadrada; en la vertical (544 × 664) la maqueta se escala 1.3.
  const escala = vertical ? 1.3 : 1;
  const [anchoPantalla, altoPantalla] = vertical ? [544, 664] : [344, 924];
  const chat = chatRecordatorio(giro, logo, Math.floor(altoPantalla / escala), Math.floor(anchoPantalla / escala));
  const agenda = (estilo, tam) => `<div class="agenda" style="${estilo};padding:${tam.pad}px ${tam.pad + 6}px">
      <span class="ok" style="width:${tam.ok}px;height:${tam.ok}px;font-size:${tam.ok * 0.55}px">✓</span>
      <div><small style="font-size:${tam.chico}px">${RECORDATORIO[giro].lista ?? "Tu agenda · mañana"}</small><b style="font-size:${tam.grande}px">${RECORDATORIO[giro].agenda}</b><small style="font-size:${tam.chico}px;opacity:.9;color:#4b3f72">Confirmada por WhatsApp</small></div>
    </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Outfit;src:url(${fuente}) format("woff2");font-weight:400 800}
*{box-sizing:border-box;margin:0}
html,body{width:1080px;height:${vertical ? 1920 : 1080}px;overflow:hidden}
body{font-family:Outfit,sans-serif;background:${g.fondo};color:${g.tinta};position:relative}
.chip{display:inline-block;background:${g.tinta};color:${g.fondo};font-weight:700;border-radius:999px;padding:14px 30px;font-size:${vertical ? 40 : 34}px}
h1{font-weight:800;line-height:1.02;letter-spacing:-1px;font-size:${vertical ? 86 : 64}px;margin-top:${vertical ? 34 : 26}px}
p.sub{font-weight:500;line-height:1.25;font-size:${vertical ? 44 : 34}px;margin-top:${vertical ? 26 : 20}px;opacity:.92}
.cta{display:inline-flex;align-items:center;gap:18px;background:${g.acento};color:${giro === "veterinarias" ? "#2b2a33" : "#fff8ee"};font-weight:800;border-radius:24px;padding:22px 32px;font-size:${vertical ? 44 : 36}px}
.marca{display:flex;align-items:center;gap:16px;font-weight:800;font-size:${vertical ? 50 : 40}px}
.marca img{width:${vertical ? 76 : 62}px;height:${vertical ? 76 : 62}px}
.cel{position:absolute;background:#2b2a33;border-radius:64px;padding:18px;box-shadow:0 30px 80px rgba(0,0,0,.28)}
.pantalla{width:100%;height:100%;border-radius:48px;overflow:hidden}
.pantalla .wa{transform:scale(${escala});transform-origin:top left}
${ESTILO_CHAT}
</style></head><body>
${vertical
  ? `<div style="position:absolute;left:80px;right:80px;top:240px">
       <span class="chip">${g.etiqueta}</span><h1>${t.titulo}</h1><p class="sub">${sub}</p>
     </div>
     <div class="cel" style="left:250px;width:580px;top:790px;height:700px"><div class="pantalla">${chat}</div></div>
     ${agenda("left:150px;right:150px;top:1385px", { pad: 20, ok: 70, chico: 28, grande: 40 })}
     <div style="position:absolute;left:80px;right:80px;bottom:250px;display:flex;justify-content:space-between;align-items:center;gap:20px">
       <div class="marca"><img src="${logo}">PeluDesk</div><span class="cta">Prueba gratis, sin tarjeta</span>
     </div>`
  : `<div style="position:absolute;left:70px;top:70px;width:530px">
       <span class="chip">${g.etiqueta}</span><h1>${t.titulo}</h1><p class="sub">${sub}</p>
     </div>
     <div style="position:absolute;left:70px;bottom:70px;width:520px;display:flex;flex-direction:column;gap:26px;align-items:flex-start">
       <span class="cta">Prueba gratis, sin tarjeta</span><div class="marca"><img src="${logo}">PeluDesk</div>
     </div>
     <div class="cel" style="left:640px;width:380px;top:60px;height:960px"><div class="pantalla">${chat}</div></div>
     ${agenda("left:560px;width:440px;top:640px", { pad: 20, ok: 58, chico: 22, grande: 32 })}`}
</body></html>`;
}

async function componer() {
  const navegador = await abrirNavegador();
  try {
    const page = await (await navegador.newContext({ deviceScaleFactor: 1 })).newPage();
    for (const giro of Object.keys(GIROS)) {
      for (const pieza of PIEZAS) {
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

// «recordatorio» es una maqueta, no necesita capturas de la demo.
if (!args.includes("--solo-componer") && PIEZAS.some((p) => p !== "recordatorio")) await capturar();
await componer();
