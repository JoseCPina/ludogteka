// Imágenes de la cuadrícula y portada del video "¿Eres dueña o dueño…?", un
// tríptico en el estilo del kit (crema, morado, coral, menta, Outfit).
//   node scripts/videos/ia/disenos.mjs [--portada-foto <png>]
//
// public/peludesk/redes/imagenes/2-de-cada-3.jpg     1080x1350 (4:5)
// public/peludesk/redes/imagenes/52-de-cada-100.jpg  1080x1350 (4:5)
// public/peludesk/redes/videos/eres-duena-o-dueno-9x16.jpg  1080x1920 (portada del reel)
// Todo el texto va dentro del 80 % central (el perfil recorta a 3:4).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abrirNavegador } from "../../lib/navegador.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../..");
const IMG = path.join(RAIZ, "public/peludesk/redes/imagenes");
const VID = path.join(RAIZ, "public/peludesk/redes/videos");
fs.mkdirSync(IMG, { recursive: true });
const b64 = (f, mime) => `data:${mime};base64,${fs.readFileSync(f).toString("base64")}`;
const fuente = b64(path.join(RAIZ, "src/fuentes/outfit-latin.woff2"), "font/woff2");
const ilus = (n) => b64(path.join(RAIZ, `public/peludesk/ilustraciones/${n}@2x.webp`), "image/webp");
const fotoArg = process.argv.indexOf("--portada-foto");
const foto = fotoArg > 0 ? b64(process.argv[fotoArg + 1], "image/png") : null;

const BASE = `
@font-face{font-family:Outfit;src:url(${fuente}) format("woff2");font-weight:400 800}
*{box-sizing:border-box;margin:0}
:root{--morado:#4b3f72;--menta:#a7d8c8;--menta-o:#1f6b57;--coral:#f28c82;--coral-o:#b23c31;--crema:#fff8ee;--grafito:#2b2a33;--n500:#7b7580}
body{font-family:Outfit;background:var(--crema);color:var(--grafito);position:relative;overflow:hidden}
.marca{position:absolute;left:0;right:0;text-align:center;font-size:36px;font-weight:700;letter-spacing:.02em;color:var(--morado)}
.fuente{position:absolute;left:0;right:0;text-align:center;font-size:27px;font-weight:500;color:var(--n500)}
.punto{border-radius:50%;background:#e4dccf}
.punto.si{background:var(--coral)}
`;

// 4:5 — 1080x1350. Zona segura (80 % central): x 108–972, y 135–1215.
const pieza = ({ gran, grande, linea1, linea2, visual, ilustracion, ilusPos, cerca = false }) => `<!doctype html><meta charset="utf-8"><style>${BASE}
body{width:1080px;height:1350px}
.marca{top:150px}
.cifra{position:absolute;left:0;right:0;top:215px;text-align:center;font-weight:800;letter-spacing:-.05em;line-height:.9;color:var(--coral-o);font-size:${gran}px}
.cifra small{display:block;font-size:92px;letter-spacing:-.025em;font-weight:700;color:var(--grafito);margin-top:6px}
.cifra .cerca{display:block;font-size:44px;letter-spacing:0;font-weight:600;color:var(--n500);margin-bottom:6px}
.texto{position:absolute;left:150px;right:150px;top:${grande}px;text-align:center;font-size:54px;font-weight:600;line-height:1.14;letter-spacing:-.015em}
.texto em{font-style:normal;color:var(--menta-o)}
.visual{position:absolute;left:0;right:0}
.fuente{bottom:150px}
.ilus{position:absolute;${ilusPos}}
</style>
<div class="marca">PeluDesk</div>
<div class="cifra">${cerca ? `<span class="cerca">cerca de</span>` : ""}${linea1}<small>${linea2}</small></div>
${visual}
<img class="ilus" src="${ilustracion}">
<div class="fuente">Fuente: INEGI, Demografía de los Negocios 1989-2019</div>`;

const dosDeTres = pieza({
  gran: 330, grande: 760, cerca: true,
  linea1: "2", linea2: "de cada 3",
  visual: `<div class="visual" style="top:790px;display:flex;justify-content:center;gap:28px">
      <i class="punto si" style="width:130px;height:130px"></i><i class="punto si" style="width:130px;height:130px"></i><i class="punto" style="width:130px;height:130px"></i></div>
    <div class="texto" style="top:955px">negocios en México cierran <em>antes de los 5 años</em></div>`,
  ilustracion: ilus("chihuahua-asomandose"), ilusPos: "right:108px;top:612px;width:190px",
});
const cincuentaYDos = (() => {
  const puntos = Array.from({ length: 100 }, (_, i) => `<i class="punto ${i < 52 ? "si" : ""}" style="width:34px;height:34px"></i>`).join("");
  return pieza({
    gran: 330, grande: 760,
    linea1: "52", linea2: "de cada 100",
    visual: `<div class="visual" style="top:735px;display:flex;justify-content:center"><div style="display:grid;grid-template-columns:repeat(20,34px);gap:8px">${puntos}</div></div>
    <div class="texto" style="top:1005px">negocios en México cierran <em>antes de cumplir 2 años</em></div>`,
    ilustracion: ilus("chihuahua-asomandose"), ilusPos: "right:108px;top:612px;width:190px",
  });
})();

// Portada del reel 9:16 — 1080x1920. El perfil recorta 3:4 (y 240–1680): todo ahí.
const portada = `<!doctype html><meta charset="utf-8"><style>${BASE}
body{width:1080px;height:1920px}
.marca{top:290px}
h1{position:absolute;left:90px;right:90px;top:360px;text-align:center;font-size:104px;line-height:1.03;font-weight:800;letter-spacing:-.04em}
h1 em{font-style:normal;color:var(--coral-o)}
.tarjeta{position:absolute;left:200px;top:880px;width:680px;height:760px;border-radius:56px;overflow:hidden;box-shadow:0 30px 70px rgba(75,63,114,.3);background:var(--morado)}
.tarjeta img{width:100%;height:100%;object-fit:cover;object-position:50% 62%;display:block}
.sello{position:absolute;left:0;right:0;top:1560px;text-align:center}
.sello span{display:inline-block;background:var(--morado);color:var(--crema);font-size:37px;font-weight:700;padding:16px 34px;border-radius:999px;box-shadow:0 14px 30px rgba(75,63,114,.35)}
</style>
<div class="marca">PeluDesk</div>
<h1>¿Eres dueña o dueño de un negocio <em>canino?</em></h1>
<div class="tarjeta">${foto ? `<img src="${foto}">` : ""}</div>
<div class="sello"><span>52 de cada 100 negocios cierran en 2 años</span></div>`;

const nav = await abrirNavegador();
async function foto_(html, w, h, destino) {
  const pg = await nav.newPage({ viewport: { width: w, height: h } });
  await pg.setContent(html);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: destino, type: "jpeg", quality: 92 });
  await pg.close();
}
await foto_(dosDeTres, 1080, 1350, path.join(IMG, "2-de-cada-3.jpg"));
await foto_(cincuentaYDos, 1080, 1350, path.join(IMG, "52-de-cada-100.jpg"));
await foto_(portada, 1080, 1920, path.join(VID, "eres-duena-o-dueno-9x16.jpg"));
await nav.close();
console.log("listo");
