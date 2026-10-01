// Arma un proyecto de HyperFrames a partir de un guion.
//
//   proyecto/
//     index.html            la línea de tiempo: una sub-composición por escena
//                           (se traslapan para la transición) + subtítulos
//     escenas/<id>.html     cada escena con su propia línea de tiempo GSAP
//     recursos/             letras, GSAP, estilo, movimiento, ilustraciones
//     tomas/                las grabaciones de la app y sus recortes
//
// Es edición no lineal de verdad: el orden, la duración y el traslape de las
// escenas viven en el guion; el index solo las acomoda en el tiempo. Se
// puede abrir en el Studio de HyperFrames (`npx hyperframes preview`) y
// mover o recortar escenas en su línea de tiempo.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dispositivo } from "./dispositivos.mjs";
import { partirSubtitulos } from "./subtitulos.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../../..");
const VIDEOS = path.resolve(AQUI, "..");

export const FORMATOS = {
  "16x9": { id: "16x9", W: 1920, H: 1080, vertical: false },
  "9x16": { id: "9x16", W: 1080, H: 1920, vertical: true },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r = (n) => Math.round(n * 100) / 100;

function copiar(origen, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (!fs.existsSync(destino)) fs.copyFileSync(origen, destino);
}

/** Tiempos absolutos de cada escena: inicio = fin de la anterior − traslape. */
export function tiempos(guion) {
  let t = 0;
  return guion.escenas.map((e, i) => {
    const traslape = i === 0 ? 0 : e.traslape ?? guion.traslape ?? 0.5;
    const inicio = Math.max(0, t - traslape);
    t = inicio + e.duracion;
    return { ...e, inicio: r(inicio), fin: r(t) };
  });
}

export function construir({ guion, formato, dir, grabaciones, alineacion }) {
  const F = FORMATOS[formato];
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "escenas"), { recursive: true });
  const rec = (n) => path.join(dir, "recursos", n);
  copiar(path.join(RAIZ, "src/fuentes/outfit-latin.woff2"), rec("outfit-latin.woff2"));
  copiar(path.join(VIDEOS, "node_modules/@fontsource/caveat/files/caveat-latin-600-normal.woff2"), rec("caveat-latin-600-normal.woff2"));
  copiar(path.join(VIDEOS, "node_modules/gsap/dist/gsap.min.js"), rec("gsap.min.js"));
  fs.copyFileSync(path.join(AQUI, "estilo.css"), rec("estilo.css"));
  fs.copyFileSync(path.join(AQUI, "movimiento.js"), rec("movimiento.js"));

  const escenas = tiempos(guion);
  const total = escenas.at(-1).fin;
  const metas = new Map();

  for (const [i, e] of escenas.entries()) {
    const ctx = contexto({ F, e, dir, grabaciones, metas });
    const { html, js, css = "" } = e.componer(ctx);
    const archivo = `<!doctype html>
<html lang="es">
  <head><meta charset="UTF-8" /><title>${esc(e.titulo)}</title></head>
  <body>
    <template>
      <style>
        #${e.id}-raiz { position: absolute; inset: 0; overflow: hidden; --acento: ${e.acento || "var(--morado)"}; }
        ${css}
      </style>
      <div id="${e.id}-raiz" data-composition-id="${e.id}" data-width="${F.W}" data-height="${F.H}" data-duration="${e.duracion}">
${html}
      </div>
      <script>
        (function () {
          const tl = gsap.timeline({ paused: true });
          const R = PD.resorte;
${js}
          window.__timelines["${e.id}"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`;
    fs.writeFileSync(path.join(dir, "escenas", `${e.id}.html`), archivo);
    escenas[i].ctx = ctx;
  }

  // ── Subtítulos: frases cortas, repartidas en la ventana de voz de cada escena ──
  const subtitulos = partirSubtitulos(escenas, { max: F.vertical ? 30 : 42, alineacion });
  const tamSub = F.vertical ? 50 : 40;
  const abajoSub = F.vertical ? 470 : 64;
  const subsHtml = subtitulos
    .map((s, i) => `      <div id="sub-${i}" class="pd-subtitulo clip" data-start="${r(s.inicio)}" data-duration="${r(s.fin - s.inicio)}" data-track-index="20" style="font-size:${tamSub}px"><span id="sub-${i}-t" style="display:inline-block">${esc(s.texto)}</span></div>`)
    .join("\n");

  const hosts = escenas
    .map((e, i) => `      <div id="host-${e.id}" data-composition-id="${e.id}" data-composition-src="escenas/${e.id}.html" data-start="${e.inicio}" data-duration="${e.duracion}" data-track-index="${i % 2}" data-width="${F.W}" data-height="${F.H}" style="z-index:${i + 1}"></div>`)
    .join("\n");

  const index = `<!doctype html>
<html lang="es" data-composition-variables='[{"id":"subtitulos","type":"boolean","label":"Subtítulos quemados","default":true}]'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${F.W}, height=${F.H}" />
    <title>${esc(guion.titulo)} · ${F.id}</title>
    <link rel="stylesheet" href="recursos/estilo.css" />
    <script src="recursos/gsap.min.js"></script>
    <script src="recursos/movimiento.js"></script>
    <style>
      #principal { position: relative; width: 100%; height: 100%; overflow: hidden; background: #fff8ee; }
      #principal > div[data-composition-src] { position: absolute; inset: 0; }
      #pd-subtitulos { bottom: ${abajoSub}px; height: 0; }
    </style>
  </head>
  <body>
    <div id="principal" data-composition-id="principal" data-width="${F.W}" data-height="${F.H}" data-duration="${total}">
${hosts}
      <div id="pd-subtitulos">
${subsHtml}
      </div>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      const v = window.__hyperframes.getVariables();
      if (v.subtitulos === false || v.subtitulos === "false") document.getElementById("pd-subtitulos").style.display = "none";
${subtitulos.map((s, i) => `      tl.fromTo("#sub-${i}-t", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" }, ${r(s.inicio)});`).join("\n")}
      window.__timelines["principal"] = tl;
    </script>
  </body>
</html>
`;
  fs.writeFileSync(path.join(dir, "index.html"), index);

  // Los subtítulos solos, sobre fondo transparente: se renderizan aparte (no
  // tienen video, así que es barato) y ffmpeg los pone encima del video sin
  // subtítulos. Así cada formato se renderiza una sola vez completo.
  const soloSubs = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${F.W}, height=${F.H}" />
    <title>${esc(guion.titulo)} · ${F.id} · subtítulos</title>
    <link rel="stylesheet" href="../recursos/estilo.css" />
    <script src="../recursos/gsap.min.js"></script>
    <style>
      html, body { background: transparent !important; }
      #principal { position: relative; width: 100%; height: 100%; overflow: hidden; background: transparent; }
      #pd-subtitulos { bottom: ${abajoSub}px; height: 0; }
    </style>
  </head>
  <body>
    <div id="principal" data-composition-id="principal" data-width="${F.W}" data-height="${F.H}" data-duration="${total}">
      <div id="pd-subtitulos">
${subsHtml}
      </div>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
${subtitulos.map((s, i) => `      tl.fromTo("#sub-${i}-t", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" }, ${r(s.inicio)});`).join("\n")}
      window.__timelines["principal"] = tl;
    </script>
  </body>
</html>
`;
  // En su carpeta: dos composiciones raíz en la misma carpeta no pasan el lint.
  fs.mkdirSync(path.join(dir, "capas"), { recursive: true });
  fs.writeFileSync(path.join(dir, "capas", "subtitulos.html"), soloSubs);
  fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({ paths: { assets: "recursos" }, media: { autoProxy: true } }, null, 2));
  return { total, escenas, subtitulos };
}

// ── Lo que una escena tiene a la mano para componerse ──
function contexto({ F, e, dir, grabaciones, metas }) {
  const { W, H, vertical } = F;
  const toma = (nombre) => {
    if (!metas.has(nombre)) {
      const archivo = path.join(grabaciones, `${nombre}.json`);
      if (!fs.existsSync(archivo)) throw new Error(`Falta la grabación "${nombre}". Corre producir.mjs con --grabar.`);
      const m = JSON.parse(fs.readFileSync(archivo, "utf8"));
      copiar(path.join(grabaciones, `${nombre}.mp4`), path.join(dir, "tomas", `${nombre}.mp4`));
      // El último cuadro de la toma, para dejarlo debajo del video: si la
      // escena dura más que la toma, la pantalla se queda en ese cuadro en vez
      // de quedarse en blanco.
      const fin = path.join(dir, "tomas", `${nombre}-fin.jpg`);
      if (!fs.existsSync(fin)) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-sseof", "-0.2", "-i", path.join(grabaciones, `${nombre}.mp4`), "-frames:v", "1", "-q:v", "2", fin]);
      metas.set(nombre, m);
    }
    return metas.get(nombre);
  };
  const recorte = (nombre, marca) => {
    const m = toma(nombre).marcas[marca];
    if (!m) throw new Error(`La toma ${nombre} no tiene la marca "${marca}"`);
    if (m.recorte) copiar(path.join(grabaciones, m.recorte), path.join(dir, "tomas", m.recorte));
    return m;
  };
  let nVideo = 0;
  const ctx = {
    W, H, vertical, id: e.id, dur: e.duracion, escena: e,
    toma,
    marca: recorte,
    // Un <video> de la toma, dentro de la escena (tiempos locales de la escena).
    video(nombre, { inicio = 0, desde = 0, duracion } = {}) {
      const m = toma(nombre);
      const d = duracion ?? Math.min(e.duracion - inicio, m.duracion - desde);
      const fondo = `<img src="tomas/${nombre}-fin.jpg" alt="" />`;
      return `${fondo}<video id="${e.id}-v${nVideo++}" class="clip" src="tomas/${nombre}.mp4" data-start="${r(inicio)}" data-duration="${r(d)}" data-media-start="${r(desde)}" data-track-index="${3 + nVideo}" muted playsinline></video>`;
    },
    // Un clip de video que no es una toma de la app (p. ej. una toma de IA aprobada): se copia a tomas/.
    clip(archivo, { inicio = 0, desde = 0, duracion, clase = "clip", estilo = "" } = {}) {
      const nombre = path.basename(archivo);
      copiar(archivo, path.join(dir, "tomas", nombre));
      const d = duracion ?? e.duracion - inicio;
      return `<video id="${e.id}-c${nVideo++}" class="${clase}" src="tomas/${nombre}" data-start="${r(inicio)}" data-duration="${r(d)}" data-media-start="${r(desde)}" data-track-index="${3 + nVideo}" muted playsinline style="${estilo}"></video>`;
    },
    imagen(nombre, marca) {
      const m = recorte(nombre, marca);
      return `<img src="tomas/${m.recorte}" alt="" />`;
    },
    ilustracion(nombre) {
      copiar(path.join(RAIZ, `public/peludesk/ilustraciones/${nombre}@2x.webp`), path.join(dir, "recursos", `${nombre}.webp`));
      return `recursos/${nombre}.webp`;
    },
    // Cualquier archivo del repo (p. ej. el isotipo) a recursos/.
    recurso(rel) {
      const nombre = path.basename(rel);
      copiar(path.join(RAIZ, rel), path.join(dir, "recursos", nombre));
      return `recursos/${nombre}`;
    },
    dispositivo(o) {
      // Con toma: la pantalla es la grabación. Sin toma: HTML dibujado (proporcion y anchoApp a mano).
      const m = o.toma ? toma(o.toma) : { alto: o.proporcion * (o.anchoApp ?? 1000), ancho: o.anchoApp ?? 1000 };
      return dispositivo({
        ...o,
        id: `${e.id}-${o.id}`,
        proporcion: m.alto / m.ancho,
        anchoApp: m.ancho,
        contenido: o.contenido ?? ctx.video(o.toma, o.video),
        reverso: o.reverso,
      });
    },
    // Título editorial: "|" parte renglones a propósito; *palabra* va en el acento.
    titulo({ id, texto, x, y, ancho, tam, alinear = "left", peso = 700, clase = "" }) {
      const lineas = texto.split("|").map((l) =>
        l.trim().split(/\s+/).map((p) => {
          const acento = /^\*.*\*[.,!?]?$/.test(p);
          const limpio = p.replace(/\*/g, "");
          return `<span class="pd-palabra${acento ? " pd-acento" : ""}">${esc(limpio)}</span>`;
        }).join(" "),
      );
      return `<div id="${e.id}-${id}" class="pd-titulo ${clase}" style="left:${r(x)}px;top:${r(y)}px;width:${r(ancho)}px;font-size:${tam}px;font-weight:${peso};text-align:${alinear}">${lineas.map((l) => `<span class="pd-linea">${l}</span>`).join("")}</div>`;
    },
    // Cámara que pone el punto p en (cx, cy) de la pantalla con zoom z.
    camaraA(p, z, cx = W / 2, cy = H / 2) {
      return { x: r(cx - p.x * z), y: r(cy - p.y * z), scale: z };
    },
    // Un recorte de la app encima de su lugar exacto en la pantalla del
    // dispositivo (para "sacarlo" del marco). `cam` es la cámara en ese momento.
    flotante({ id, toma: nombre, marca, disp, cam = { x: 0, y: 0, scale: 1 }, radio = 12 }) {
      const m = recorte(nombre, marca);
      const c = disp.cajaDe(m);
      const caja = { x: cam.x + c.x * cam.scale, y: cam.y + c.y * cam.scale, w: c.w * cam.scale, h: c.h * cam.scale };
      const html = `<div id="${e.id}-${id}" class="pd-flotante" style="left:${r(caja.x)}px;top:${r(caja.y)}px;width:${r(caja.w)}px;height:${r(caja.h)}px;opacity:0"><div class="pd-sombra-flotante" style="width:100%;height:100%;border-radius:${radio}px"><img src="tomas/${m.recorte}" alt="" style="border-radius:${radio}px" /></div></div>`;
      return { html, caja, centro: { x: caja.x + caja.w / 2, y: caja.y + caja.h / 2 },
        // Desplazamiento para que su centro quede en (x, y) con escala s.
        hacia: (x, y, s = 1, rotation = 0) => ({ x: r(x - (caja.x + caja.w / 2)), y: r(y - (caja.y + caja.h / 2)), scale: s, rotation }) };
    },
    // Recuadro que se dibuja alrededor de una caja de la escena (resaltado).
    recuadro({ id, caja, radio = 14, grosor = 4, holgura = 8, color = "var(--acento)" }) {
      const x = -holgura, y = -holgura, w = caja.w + holgura * 2, h = caja.h + holgura * 2, rr = Math.min(radio, w / 2, h / 2);
      const d = `M${r(x + rr)} ${r(y)} H${r(x + w - rr)} Q${r(x + w)} ${r(y)} ${r(x + w)} ${r(y + rr)} V${r(y + h - rr)} Q${r(x + w)} ${r(y + h)} ${r(x + w - rr)} ${r(y + h)} H${r(x + rr)} Q${r(x)} ${r(y + h)} ${r(x)} ${r(y + h - rr)} V${r(y + rr)} Q${r(x)} ${r(y)} ${r(x + rr + 2)} ${r(y - 1)}`;
      return `<svg id="${e.id}-${id}" class="pd-flecha" style="left:${r(caja.x)}px;top:${r(caja.y)}px;width:${r(caja.w)}px;height:${r(caja.h)}px" viewBox="0 0 ${r(caja.w)} ${r(caja.h)}" fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round"><path d="${d}" /></svg>`;
    },
    // Flecha dibujada a mano de a → b (curva suave), en coordenadas de pantalla.
    flecha({ id, de, a, curva = 0.25, grosor = 7, color = "var(--acento)" }) {
      const dx = a.x - de.x, dy = a.y - de.y;
      const cxp = de.x + dx / 2 - dy * curva, cyp = de.y + dy / 2 + dx * curva;
      const ang = Math.atan2(a.y - cyp, a.x - cxp);
      const L = 30;
      const p1 = { x: a.x - L * Math.cos(ang - 0.45), y: a.y - L * Math.sin(ang - 0.45) };
      const p2 = { x: a.x - L * Math.cos(ang + 0.45), y: a.y - L * Math.sin(ang + 0.45) };
      return `<svg id="${e.id}-${id}" class="pd-flecha" style="left:0;top:0;width:${W}px;height:${H}px" viewBox="0 0 ${W} ${H}" fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M${r(de.x)} ${r(de.y)} Q${r(cxp)} ${r(cyp)} ${r(a.x)} ${r(a.y)}" />
        <path d="M${r(p1.x)} ${r(p1.y)} L${r(a.x)} ${r(a.y)} L${r(p2.x)} ${r(p2.y)}" />
      </svg>`;
    },
    r,
    esc,
  };
  return ctx;
}
