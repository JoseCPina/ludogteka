// Portadas 1080x1920 de los reels (kit de marca: crema, morado, menta, Outfit).
// Todo lo importante queda en el recorte 3:4 central (y 240–1680) que usa el perfil de Instagram.
// Uso: node scripts/videos/portadas/portadas.mjs [--prueba]  → public/peludesk/redes/videos/<video>-9x16.jpg
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abrirNavegador } from "../../lib/navegador.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, "../../..");
const SALIDA = path.join(REPO, "public/peludesk/redes/videos");
const GRAB = path.join(AQUI, "../grabaciones");
const b64 = (f) => fs.readFileSync(f).toString("base64");
const fuente = b64(path.join(AQUI, "outfit-latin.woff2"));

const chip = `<div class="chip"><span class="crit">CRÍTICA</span><b>Bordetella · Vencida</b></div>`;
const PORTADAS = [
  { video: "corte-de-caja", l1: "Tu corte de caja,", l2: "sin sorpresas.", acento: "#1f6b57", foto: path.join(GRAB, "corte-de-caja/celular-caja.png") },
  { video: "ese-perro-no-esta-vacunado", l1: "Ese perro no", l2: "está vacunado.", acento: "#b23c31", tarjeta: chip },
  { video: "un-dia-en-tu-guarderia", l1: "Un día en", l2: "tu guardería.", acento: "#4b3f72", foto: path.join(GRAB, "un-dia-en-tu-guarderia/celular-guarderia.png") },
];

const html = (p) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Outfit;src:url(data:font/woff2;base64,${fuente}) format("woff2");font-weight:400 800}
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1920px;background:#fff8ee;font-family:Outfit;overflow:hidden;position:relative}
.marca{position:absolute;top:290px;left:0;right:0;text-align:center;font-size:40px;font-weight:700;color:#4b3f72;letter-spacing:.02em}
h1{position:absolute;top:360px;left:0;right:0;text-align:center;font-size:122px;line-height:1.02;font-weight:800;color:#2b2a33;letter-spacing:-.035em}
h1 em{font-style:normal;color:${p.acento}}
.tel{position:absolute;left:230px;top:790px;width:620px;height:880px;background:#1c1a22;border-radius:84px 84px 0 0;padding:20px 20px 0;box-shadow:0 30px 70px rgba(75,63,114,.28)}
.tel .pant{width:100%;height:100%;border-radius:66px 66px 0 0;overflow:hidden;background:#fff8ee}
.tel img{width:100%;display:block}
.sobre{position:absolute;left:90px;right:90px;top:960px;background:#fff;border-radius:44px;border:3px solid #ebe3d8;box-shadow:0 30px 70px rgba(75,63,114,.2);padding:56px 40px;display:flex;justify-content:center}
.chip{display:flex;align-items:center;gap:22px;background:#fde8e5;border:4px solid #f28c82;border-radius:999px;padding:26px 38px;font-size:50px;color:#b23c31}
.crit{background:#3a3059;color:#fff;font-size:32px;font-weight:700;border-radius:999px;padding:8px 22px;letter-spacing:.03em}
.nota{margin-top:30px;text-align:center;font-size:44px;font-weight:600;color:#7b7580}
</style>
<div class="marca">PeluDesk</div>
<h1>${p.l1}<br><em>${p.l2}</em></h1>
${p.foto ? `<div class="tel"><div class="pant"><img src="data:image/png;base64,${b64(p.foto)}"></div></div>` : `<div class="sobre"><div><div class="chip" style="margin:0 auto">${chip.replace(/<\/?div[^>]*>/g, "").replace(/^/, "")}</div><div class="nota">Para entrar al hotel, a Simba le falta esto</div></div></div>`}
`;

const nav = await abrirNavegador();
const pg = await nav.newPage({ viewport: { width: 1080, height: 1920 } });
for (const p of PORTADAS) {
  await pg.setContent(html(p));
  await pg.evaluate(() => document.fonts.ready);
  const dest = path.join(SALIDA, `${p.video}-9x16.jpg`);
  await pg.screenshot({ path: dest, type: "jpeg", quality: 90 });
  // Comprobación: el recorte 3:4 central que muestra el perfil.
  await pg.screenshot({ path: path.join(AQUI, `${p.video}-recorte.jpg`), type: "jpeg", quality: 70, clip: { x: 0, y: 240, width: 1080, height: 1440 } });
}
await nav.close();
console.log("listo");
