// Marcos de dispositivos dibujados en HTML/CSS: monitor con base, tablet y
// teléfono. Genéricos, sin logos. Cada uno devuelve su HTML y su geometría:
// dónde queda la pantalla dentro de la escena y cómo se convierte un punto
// de la grabación (px CSS de la app) a un punto de la escena. Con eso las
// marcas de la grabación (lib/grabar.mjs) caen exactas sobre la pantalla.
//
// Tablet y teléfono llevan barra de estado arriba (la hora y la pila, como
// un equipo de verdad): la app empieza debajo, nunca bajo la cámara.
//
// Estilos: lib/estilo.css (.disp, .monitor, .tablet, .telefono).

const r = (n) => Math.round(n * 100) / 100;

function barraDeEstado(tipo, sw, alto, fondo) {
  const t = alto * (tipo === "telefono" ? 0.36 : 0.62);
  const pad = tipo === "telefono" ? sw * 0.085 : sw * 0.022;
  const pila = `<svg width="${r(t * 1.9)}" height="${r(t)}" viewBox="0 0 26 13"><rect x="0.8" y="0.8" width="21.4" height="11.4" rx="3.4" fill="none" stroke="#2b2a33" stroke-opacity=".45" stroke-width="1.2"/><rect x="2.6" y="2.6" width="15.6" height="7.8" rx="1.8" fill="#2b2a33"/><rect x="23.4" y="4.3" width="1.7" height="4.4" rx=".8" fill="#2b2a33" fill-opacity=".45"/></svg>`;
  const senal = `<svg width="${r(t * 1.35)}" height="${r(t)}" viewBox="0 0 18 13"><rect x="0" y="8.5" width="3.2" height="4.5" rx="1" fill="#2b2a33"/><rect x="4.9" y="6" width="3.2" height="7" rx="1" fill="#2b2a33"/><rect x="9.8" y="3.2" width="3.2" height="9.8" rx="1" fill="#2b2a33"/><rect x="14.7" y="0" width="3.2" height="13" rx="1" fill="#2b2a33"/></svg>`;
  const wifi = `<svg width="${r(t * 1.3)}" height="${r(t)}" viewBox="0 0 17 13"><path d="M8.5 12.6 L5.6 9.3 A4.3 4.3 0 0 1 11.4 9.3 Z M3.3 7 A7.6 7.6 0 0 1 13.7 7 L12.3 8.6 A5.5 5.5 0 0 0 4.7 8.6 Z M0.9 4.3 A11 11 0 0 1 16.1 4.3 L14.8 5.9 A8.9 8.9 0 0 0 2.2 5.9 Z" fill="#2b2a33"/></svg>`;
  return `<div class="disp-barra" style="position:absolute;left:0;top:0;right:0;height:${r(alto)}px;background:${fondo};display:flex;align-items:center;justify-content:space-between;padding:${tipo === "telefono" ? `${r(alto * 0.12)}px` : "0"} ${r(pad)}px 0;font-weight:600;font-size:${r(t * 1.05)}px;color:#2b2a33;letter-spacing:-0.01em">
    <span>9:41</span><span style="display:flex;gap:${r(t * 0.35)}px;align-items:center">${senal}${wifi}${pila}</span></div>`;
}

/**
 * @param {object} o
 *   id        id único en la composición
 *   tipo      "monitor" | "tablet" | "telefono"
 *   x, y      esquina superior izquierda de la PANTALLA en la escena
 *   ancho     ancho de la pantalla en la escena (px)
 *   proporcion  alto/ancho del área de la app (de la grabación)
 *   anchoApp  ancho de la grabación en px CSS (para convertir marcas)
 *   contenido HTML de la app (un <video> o <img>)
 *   reverso   HTML opcional de la otra cara (para girar y cambiar de pantalla)
 *   fondoBarra  color de la barra de estado (el del encabezado de la app)
 */
export function dispositivo({ id, tipo, x, y, ancho, proporcion, anchoApp, contenido, reverso = "", fondoBarra = "#ffffff" }) {
  const sw = ancho;
  const sh = ancho * proporcion; // alto de la app
  const barra = tipo === "telefono" ? sw * 0.135 : tipo === "tablet" ? sw * 0.028 : 0;
  const pt = sh + barra; // alto de la pantalla completa
  let b, radioCuerpo, radioPantalla, extra = "", menton = 0, afuera;

  if (tipo === "monitor") {
    b = sw * 0.016;
    menton = sw * 0.038;
    radioCuerpo = sw * 0.012;
    radioPantalla = sw * 0.003;
    const cw = sw + b * 2;
    const cuelloW = sw * 0.12, cuelloH = sw * 0.12;
    const baseW = sw * 0.34, baseH = sw * 0.022;
    extra = `
      <div class="monitor-cuello disp-metal" style="left:${r(-b + cw / 2 - cuelloW / 2)}px;top:${r(pt + menton - 2)}px;width:${r(cuelloW)}px;height:${r(cuelloH)}px"></div>
      <div class="monitor-base disp-metal" style="left:${r(-b + cw / 2 - baseW / 2)}px;top:${r(pt + menton + cuelloH - 4)}px;width:${r(baseW)}px;height:${r(baseH)}px"></div>
      <div class="disp-sombra" style="left:${r(-b + cw / 2 - baseW * 0.62)}px;top:${r(pt + menton + cuelloH + baseH - 14)}px;width:${r(baseW * 1.24)}px;height:${r(baseH * 1.6)}px"></div>`;
    afuera = { izq: b, der: b, arr: b, aba: menton + cuelloH + baseH };
  } else if (tipo === "tablet") {
    b = sw * 0.034;
    radioCuerpo = sw * 0.05;
    radioPantalla = sw * 0.018;
    const cam = sw * 0.009;
    extra = `<div class="disp-camara-frontal" style="left:${r(sw / 2 - cam / 2)}px;top:${r(-b / 2 - cam / 2)}px;width:${r(cam)}px;height:${r(cam)}px"></div>
      <div class="disp-sombra" style="left:${r(sw * 0.08)}px;top:${r(pt + b * 0.6)}px;width:${r(sw * 0.84)}px;height:${r(sw * 0.05)}px"></div>`;
    afuera = { izq: b, der: b, arr: b, aba: b };
  } else if (tipo === "telefono") {
    b = sw * 0.04;
    radioCuerpo = sw * 0.155;
    radioPantalla = sw * 0.12;
    const islaW = sw * 0.3, islaH = sw * 0.085;
    const bw = sw * 0.012;
    extra = `<div class="telefono-isla" style="left:${r(sw / 2 - islaW / 2)}px;top:${r(sw * 0.028)}px;width:${r(islaW)}px;height:${r(islaH)}px"></div>
      <div class="telefono-boton disp-metal" style="left:${r(-b - bw - 2)}px;top:${r(pt * 0.18)}px;width:${r(bw)}px;height:${r(pt * 0.045)}px"></div>
      <div class="telefono-boton disp-metal" style="left:${r(-b - bw - 2)}px;top:${r(pt * 0.26)}px;width:${r(bw)}px;height:${r(pt * 0.085)}px"></div>
      <div class="telefono-boton disp-metal" style="left:${r(-b - bw - 2)}px;top:${r(pt * 0.36)}px;width:${r(bw)}px;height:${r(pt * 0.085)}px"></div>
      <div class="telefono-boton disp-metal" style="left:${r(sw + b + 2)}px;top:${r(pt * 0.28)}px;width:${r(bw)}px;height:${r(pt * 0.12)}px"></div>
      <div class="disp-sombra" style="left:${r(sw * 0.05)}px;top:${r(pt + b * 0.5)}px;width:${r(sw * 0.9)}px;height:${r(sw * 0.1)}px"></div>`;
    afuera = { izq: b, der: b, arr: b, aba: b };
  } else {
    throw new Error(`Dispositivo desconocido: ${tipo}`);
  }

  const cw = sw + b * 2;
  const ch = tipo === "monitor" ? pt + b + menton : pt + b * 2;
  const indicador = tipo === "telefono" ? `<div style="position:absolute;left:${r(sw * 0.34)}px;bottom:${r(sw * 0.022)}px;width:${r(sw * 0.32)}px;height:${r(sw * 0.013)}px;border-radius:9px;background:#2b2a33;opacity:.85;z-index:8"></div>` : "";

  function cara(html, clase) {
    return `<div class="disp-cara ${clase}" style="left:${r(-b)}px;top:${r(-b)}px;width:${r(cw)}px;height:${r(ch)}px">
      <div class="disp-cuerpo" style="left:0;top:0;width:${r(cw)}px;height:${r(ch)}px;border-radius:${r(radioCuerpo)}px">
        ${tipo === "monitor" ? `<div class="monitor-menton" style="height:${r(menton)}px;border-radius:0 0 ${r(radioCuerpo)}px ${r(radioCuerpo)}px"></div>` : ""}
      </div>
      <div class="disp-pantalla" style="left:${r(b)}px;top:${r(b)}px;width:${r(sw)}px;height:${r(pt)}px;border-radius:${r(radioPantalla)}px;background:${fondoBarra}">
        ${barra ? barraDeEstado(tipo, sw, barra, fondoBarra) : ""}
        <div class="disp-app" style="position:absolute;left:0;top:${r(barra)}px;width:${r(sw)}px;height:${r(sh)}px;overflow:hidden">${html}</div>
        ${indicador}
        <div class="disp-reflejo"></div>
        <div class="disp-vidrio-borde"></div>
      </div>
    </div>`;
  }

  // Dos nodos: "<id>-p" (profundidad: desenfoque, escala, brillo) envuelve
  // a "<id>" (movimiento y giro 3D). Un filter en el mismo nodo que gira
  // aplanaría el 3D y las dos caras se verían a la vez.
  // Los dos miden lo que la pantalla; el cuerpo sale hacia afuera.
  const html = `<div id="${id}-p" class="disp-profundidad" style="position:absolute;left:${r(x)}px;top:${r(y)}px;width:${r(sw)}px;height:${r(pt)}px">
      <div id="${id}" class="disp ${tipo}" style="left:0;top:0;width:${r(sw)}px;height:${r(pt)}px">
      ${extra}
      ${cara(contenido, "disp-frente")}
      ${reverso ? cara(reverso, "disp-reverso") : ""}
      </div>
    </div>`;
  const escala = sw / anchoApp;
  const ay = y + barra; // donde empieza la app
  return {
    id, tipo, html,
    pantalla: { x, y, w: sw, h: pt },
    app: { x, y: ay, w: sw, h: sh },
    // Caja total del dispositivo (con marco y base), para acomodarlo.
    caja: { x: x - afuera.izq, y: y - afuera.arr, w: sw + afuera.izq + afuera.der, h: pt + afuera.arr + afuera.aba },
    escala,
    // Punto de la app (px CSS) → punto de la escena.
    punto: (px, py) => ({ x: x + px * escala, y: ay + py * escala }),
    // Caja de una marca → caja en la escena.
    cajaDe: (m) => ({ x: x + m.x * escala, y: ay + m.y * escala, w: m.w * escala, h: m.h * escala }),
    centroDe: (m) => ({ x: x + (m.x + m.w / 2) * escala, y: ay + (m.y + m.h / 2) * escala }),
    centro: { x: x + sw / 2, y: y + pt / 2 },
  };
}
