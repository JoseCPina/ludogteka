// Escenas de la serie de videos cortos (15–25 s, un solo mensaje).
//
//   gancho(c, …)    los primeros 2 s nombran el problema: la pregunta en
//                   grande y una libreta con apuntes a mano (dibujada, nada
//                   de la app) que se va al fondo cuando entra PeluDesk.
//   pantalla(c, …)  un dispositivo con una toma de la app: llega, aparece el
//                   título, la cámara va a una MARCA de la toma y, si se
//                   pide, un recorte sale de la pantalla y se dibuja un trazo.
//   cierre(c, …)    fondo morado, teléfonos que llegan y giran, «15 días
//                   gratis», «Sin tarjeta» y peludesk.mx.
//
// Mismo lenguaje de movimiento que "Un día en tu guardería" (lib/movimiento.js):
// lo que llega, llega con resorte; lo que se va, acelera al salir; una cosa a
// la vez. Los tiempos que dependen de la app salen de las marcas de la toma.

const n = (x) => Math.round(x * 100) / 100;
const segun = (c, v) => (v && typeof v === "object" && ("16x9" in v || "9x16" in v) ? v[c.vertical ? "9x16" : "16x9"] : v);

export const CSS_LIBRETA = `
  .libreta { position: absolute; border-radius: 10px; background-color: #fffdf8;
    background-image: repeating-linear-gradient(180deg, transparent 0 57px, #d6e1ea 57px 59px);
    box-shadow: 0 2px 4px rgba(43,42,51,.12), 0 30px 60px -18px rgba(43,42,51,.35); }
  .libreta::before { content: ""; position: absolute; top: 0; bottom: 0; left: 78px; width: 2px; background: rgba(242,140,130,.55); }
  .libreta .espiral { position: absolute; top: -14px; left: 40px; right: 40px; display: flex; justify-content: space-between; }
  .libreta .espiral i { display: block; width: 14px; height: 30px; border-radius: 8px; background: linear-gradient(90deg,#8f8a96,#e9e6ec 50%,#8f8a96); }
  .apunte { position: absolute; left: 98px; font-family: "Caveat", cursive; font-weight: 600; color: #34406b; white-space: nowrap; font-size: 46px; }
  .apunte.fecha { color: #2b2a33; font-size: 52px; }
  .apunte.rojo { color: #b23c31; }
`;

/**
 * Gancho: la pregunta que nombra el problema + la libreta con apuntes.
 *   pregunta   "¿La caja|no *cuadra*?" (| parte renglones, *x* en acento)
 *   apuntes    [{ texto, clase?, tachado?, circulo? }]  (hasta 6)
 *   ilustracion  nombre de public/peludesk/ilustraciones (opcional)
 */
export function gancho(c, { pregunta, apuntes, ilustracion }) {
  const V = c.vertical;
  const lib = V ? { x: 150, y: 820, w: 780, h: 560, giro: -5 } : { x: 1080, y: 250, w: 660, h: 560, giro: 5 };
  const top = (i) => 58 + 70 + i * 59 - 44 + (i === 0 ? 0 : 20);
  const lineas = apuntes.map((a, i) => `<div id="${c.id}-ap${i}" class="apunte ${a.clase || ""}" style="top:${top(i)}px;clip-path:inset(0 100% 0 0)">${c.esc(a.texto)}</div>`).join("");
  // Tachones y círculos a mano sobre los apuntes que los piden.
  const trazos = apuntes.map((a, i) => {
    const y = top(i) + 30;
    if (a.tachado) return `<path d="M92 ${y} C${n(92 + a.texto.length * 9)} ${y - 6} ${n(92 + a.texto.length * 15)} ${y + 5} ${n(98 + a.texto.length * 21)} ${y - 3}" />`;
    if (a.circulo) {
      const x0 = 92 + (a.desde ?? 0) * 21, x1 = 98 + a.texto.length * 21;
      return `<path d="M${x0 + 20} ${y - 32} C${x1} ${y - 46} ${x1 + 30} ${y - 6} ${x1 + 6} ${y + 18} C${x1 - 30} ${y + 40} ${x0} ${y + 38} ${x0 - 8} ${y + 8} C${x0 - 14} ${y - 16} ${x0 + 40} ${y - 36} ${x0 + 90} ${y - 38}" />`;
    }
    return "";
  }).join("");
  const libreta = `<div id="${c.id}-libreta-p" style="position:absolute;left:${lib.x}px;top:${lib.y}px;width:${lib.w}px;height:${lib.h}px">
      <div id="${c.id}-libreta" class="libreta" style="left:0;top:0;width:${lib.w}px;height:${lib.h}px">
        <div class="espiral">${"<i></i>".repeat(V ? 11 : 9)}</div>
        ${lineas}
        <svg id="${c.id}-trazos" style="position:absolute;left:0;top:0;overflow:visible" width="${lib.w}" height="${lib.h}" viewBox="0 0 ${lib.w} ${lib.h}" fill="none" stroke="#b23c31" stroke-width="4" stroke-linecap="round">${trazos}</svg>
      </div>
    </div>`;
  const ilus = ilustracion
    ? `<img id="${c.id}-ilus" src="${c.ilustracion(ilustracion)}" alt="" style="position:absolute;${V ? "left:640px;top:1330px;width:380px" : "left:60px;top:700px;width:330px"};opacity:0" />`
    : "";
  const titulo = c.titulo(V
    ? { id: "t", texto: pregunta, x: 80, y: 250, ancho: 920, tam: 118 }
    : { id: "t", texto: pregunta, x: 110, y: 250, ancho: 900, tam: 116 });
  const html = `
    <div class="pd-fondo"></div>
    <div class="pd-camara" id="${c.id}-cam">${libreta}</div>
    ${ilus}
    ${titulo}`;
  const fin = c.dur;
  const js = `
    gsap.set("#${c.id}-libreta", { rotation: ${lib.giro} });
    // La pregunta sale de inmediato: el problema se nombra en el primer segundo.
    PD.titulo(tl, "#${c.id}-t", 0.05, { y: 60, duracion: 0.7, escalon: 0.05 });
    tl.fromTo("#${c.id}-libreta", { x: ${V ? 0 : 260}, y: ${V ? 520 : 380}, rotation: ${lib.giro * 3} }, { x: 0, y: 0, rotation: ${lib.giro}, duration: 0.9, ease: R(0.1) }, 0.2);
    ${apuntes.map((_, i) => `tl.to("#${c.id}-ap${i}", { clipPath: "inset(0 0% 0 0)", duration: 0.3, ease: "power1.inOut" }, ${n(0.65 + i * 0.26)});`).join("\n    ")}
    PD.trazar(tl, "#${c.id}-trazos", ${n(0.75 + apuntes.length * 0.26)}, { duracion: 0.4 });
    ${ilustracion ? `tl.fromTo("#${c.id}-ilus", { opacity: 0, y: 60, rotation: -6 }, { opacity: 1, y: 0, rotation: 0, duration: 0.8, ease: R(0.14) }, 0.9);` : ""}
    // Todo se va al fondo para que entre la app.
    PD.tituloFuera(tl, "#${c.id}-t", ${n(fin - 0.55)});
    tl.fromTo("#${c.id}-libreta-p", { filter: "blur(0px) saturate(1)" }, { immediateRender: false, scale: 0.7, y: ${V ? -60 : 40}, filter: "blur(8px) saturate(0.4)", opacity: 0, duration: 0.6, ease: PD.salir }, ${n(fin - 0.6)});
    ${ilustracion ? `tl.to("#${c.id}-ilus", { opacity: 0, y: 40, duration: 0.4, ease: PD.salir }, ${n(fin - 0.55)});` : ""}
  `;
  return { html, js, css: CSS_LIBRETA };
}

/**
 * Pantalla: un dispositivo con una toma de la app.
 *   disp      { tipo: "monitor"|"tablet"|"telefono", toma, "16x9": {x,y,ancho}, "9x16": {x,y,ancho}, fondoBarra? }
 *   desde     segundo de la toma donde empieza la escena (para saltar la carga)
 *   titulo    { texto, "16x9": {x,y,ancho,tam}, "9x16": {…} } — sale a los 0.8 s
 *   tituloHasta  segundo (de la escena) en que se va el título (por omisión, al final)
 *   zoom      [{ marca, z: {16x9, 9x16} | n, t?: segundo de escena (por omisión, el de la marca − 0.9), dur?, centro?: {x,y} }]
 *             (marca: "nombre" de la toma; "vuelve" en lugar de marca regresa a 1)
 *   sacar     { marca, t?, destino: { "16x9": {x,y,s,g}, "9x16": {…} }, radio?, hasta? } — el recorte sale de la pantalla
 *   recuadro  { marca, t, color? } — trazo alrededor de un elemento (se mueve con la cámara)
 *   flecha    { t, color?, curva?: {16x9, 9x16} } — del recorte sacado al recuadro
 *   etiquetas [{ texto, t, "16x9": {x,y}, "9x16": {x,y} }] — pastillas oscuras
 */
export function pantalla(c, o) {
  const V = c.vertical;
  const t = c.toma(o.disp.toma);
  const M = t.marcas;
  const desde = o.desde ?? 0;
  const tm = (marca) => M[marca].t - desde; // segundo de la marca en la escena
  const disp = c.dispositivo({ id: "d", tipo: o.disp.tipo, toma: o.disp.toma, ...segun(c, o.disp), fondoBarra: o.disp.fondoBarra ?? "#fff8ee", video: { inicio: 0, desde } });
  const id = c.id;

  // Cámara: cada zoom apunta al centro de su marca.
  const pasos = (o.zoom ?? []).map((z) => {
    if (z.marca === "vuelve") return { cam: { x: 0, y: 0, scale: 1 }, t: z.t, dur: z.dur ?? 1.1 };
    const m = M[z.marca];
    if (!m) throw new Error(`La toma ${o.disp.toma} no tiene la marca "${z.marca}"`);
    const p = disp.centroDe({ ...m, h: Math.min(m.h, t.alto - m.y) });
    const cen = segun(c, z.centro) ?? { x: c.W / 2, y: c.H * (V ? 0.55 : 0.5) };
    // Nada de cámara antes de que llegue el dispositivo y se lea el título.
    return { cam: c.camaraA(p, segun(c, z.z), cen.x, cen.y), t: Math.max(2.0, z.t ?? tm(z.marca) - 0.9), dur: z.dur ?? 1.2 };
  });
  const camEn = (seg) => { let cam = { x: 0, y: 0, scale: 1 }; for (const p of pasos) if (p.t + p.dur * 0.8 <= seg) cam = p.cam; return cam; };

  let sacado = null, flotante = "", recuadro = "", flecha = "", jsExtra = "";
  if (o.sacar) {
    const ts = o.sacar.t ?? tm(o.sacar.marca) + 0.2;
    const f = c.flotante({ id: "saca", toma: o.disp.toma, marca: o.sacar.marca, disp, cam: camEn(ts), radio: o.sacar.radio ?? 12 });
    const d = { ...segun(c, o.sacar.destino) };
    // El destino puede pedir un ancho en px en vez de una escala (renglones anchos).
    if (d.ancho) d.s = d.ancho / f.caja.w;
    flotante = f.html;
    sacado = { f, d, ts };
    jsExtra += `PD.salirDePantalla(tl, "#${id}-saca", ${n(ts)}, ${JSON.stringify(f.hacia(d.x, d.y, d.s, d.g ?? 0))}, { rebote: 0.16 });\n`;
    if (!V && o.alFondo !== false) jsExtra += `PD.alFondo(tl, "#${id}-d-p", ${n(ts + 0.1)}, { blur: 4, escala: 0.97 });\n`;
    if (V && o.alFondo !== false) jsExtra += `PD.alFondo(tl, "#${id}-d-p", ${n(ts + 0.1)}, { blur: 5, escala: 0.95 });\n`;
    if (o.sacar.hasta) {
      jsExtra += `tl.to("#${id}-saca", { opacity: 0, y: -30, duration: 0.35, ease: PD.salir }, ${n(o.sacar.hasta)});\n`;
      // El dispositivo vuelve al frente cuando el recorte se va.
      if (o.alFondo !== false) jsExtra += `PD.alFrente(tl, "#${id}-d-p", ${n(o.sacar.hasta + 0.1)}, { blur: ${V ? 5 : 4} });\n`;
    }
  }
  // Tarjeta: el mismo texto de la app, en vectorial, que nace del tamaño
  // exacto de un elemento de la pantalla y crece nítida (como el saldo del
  // primer video). filas: [[etiqueta, valor, valor…], …]; la última puede ir
  // marcada como total.
  if (o.tarjeta) {
    const T = o.tarjeta;
    const ts = T.t ?? tm(T.marca) + 0.2;
    const cam = camEn(ts);
    const m = disp.cajaDe(M[T.marca]);
    const origen = { x: cam.x + m.x * cam.scale, y: cam.y + m.y * cam.scale, w: m.w * cam.scale, h: m.h * cam.scale };
    const d = segun(c, T.destino);
    const tam = V ? 36 : 32;
    const alto = (T.titulo ? tam * 1.9 : 0) + (T.columnas ? tam * 1.2 : 0) + T.filas.length * tam * 1.75 + tam * 1.4;
    const s0 = Math.min(origen.w / d.w, origen.h / alto);
    const cols = T.filas[0].length;
    const rejilla = `grid-template-columns: 1fr ${"auto ".repeat(cols - 1)}`;
    const celda = (x, i) => `<span class="tj-c${i ? " tj-n" : ""}">${c.esc(x)}</span>`;
    flotante += `<div id="${id}-tarjeta" class="tj" style="left:${n(d.x - d.w / 2)}px;top:${n(d.y - alto / 2)}px;width:${d.w}px;font-size:${tam}px">
      ${T.titulo ? `<div class="tj-titulo">${c.esc(T.titulo)}</div>` : ""}
      <div class="tj-rejilla" style="${rejilla}">
        ${T.columnas ? T.columnas.map((x, i) => `<span class="tj-col${i ? " tj-n" : ""}">${c.esc(x)}</span>`).join("") : ""}
        ${T.filas.map((f, i) => `<div class="tj-fila${T.total && i === T.filas.length - 1 ? " tj-total" : ""}" id="${id}-tf${i}" style="display:contents">${f.map(celda).join("")}</div>`).join("")}
      </div>
    </div>`;
    const dx = n(origen.x + origen.w / 2 - d.x), dy = n(origen.y + origen.h / 2 - d.y);
    jsExtra += `tl.fromTo("#${id}-tarjeta", { opacity: 0, x: ${dx}, y: ${dy}, scale: ${n(s0)} }, { opacity: 1, duration: 0.15, ease: "none" }, ${n(ts)});
      tl.to("#${id}-tarjeta", { x: 0, y: 0, scale: 1, rotation: ${d.g ?? -1.5}, duration: 1.1, ease: R(0.12) }, ${n(ts + 0.12)});
      PD.alFondo(tl, "#${id}-d-p", ${n(ts + 0.1)}, { blur: ${V ? 5 : 4}, escala: 0.96 });
`;
    sacado = sacado ?? { ts };
  }
  if (o.recuadro) {
    const m = M[o.recuadro.marca];
    const caja = disp.cajaDe(m);
    recuadro = c.recuadro({ id: "r", caja, radio: 10, grosor: 3.5, holgura: 6, color: o.recuadro.color ?? "var(--acento)" });
    jsExtra += `tl.set("#${id}-r", { opacity: 1 }, 0);\nPD.trazar(tl, "#${id}-r", ${n(o.recuadro.t ?? tm(o.recuadro.marca))}, { duracion: 0.55 });\n`;
    if (o.flecha && sacado) {
      const cam = camEn(o.flecha.t);
      const dest = { x: cam.x + (caja.x - 6) * cam.scale, y: cam.y + (caja.y + caja.h / 2) * cam.scale };
      const alto = sacado.f.caja.h * sacado.d.s;
      const de = { x: sacado.d.x, y: sacado.d.y + alto / 2 + 14 };
      flecha = c.flecha({ id: "f", de, a: V ? { x: cam.x + (caja.x + caja.w * 0.3) * cam.scale, y: cam.y + (caja.y - 10) * cam.scale } : dest, curva: segun(c, o.flecha.curva) ?? 0.25, color: o.flecha.color ?? "var(--acento)" });
      jsExtra += `PD.trazar(tl, "#${id}-f", ${n(o.flecha.t)}, { duracion: 0.5 });\n`;
    }
  }
  const etiquetas = (o.etiquetas ?? []).map((e, i) => {
    const p = segun(c, e);
    return `<div id="${id}-et${i}" class="pd-etiqueta" style="left:${p.x}px;top:${p.y}px;font-size:${V ? 40 : 34}px;opacity:0">${c.esc(e.texto)}</div>`;
  }).join("");
  (o.etiquetas ?? []).forEach((e, i) => {
    jsExtra += `tl.fromTo("#${id}-et${i}", { opacity: 0, y: 24, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: R(0.14) }, ${n(e.t)});\n`;
  });

  const tit = o.titulo ? c.titulo({ id: "t", texto: o.titulo.texto, ...segun(c, o.titulo) }) : "";
  const html = `
    <div class="pd-fondo" id="${id}-fondo"></div>
    <div class="pd-camara" id="${id}-cam">
      ${disp.html}
      ${recuadro}
    </div>
    ${flecha}
    ${flotante}
    ${etiquetas}
    ${tit}`;
  // El título se va justo antes del primer zoom o recorte: si no, la
  // pantalla crece por debajo de él.
  const primero = Math.min(...pasos.map((p) => p.t), sacado ? sacado.ts : Infinity);
  const salidaTitulo = segun(c, o.tituloHasta) ?? (Number.isFinite(primero) ? Math.max(1.9, primero - 0.15) : c.dur - 0.55);
  // Lo que se anotó encima de la pantalla se va antes del corte.
  const salen = [o.sacar && !o.sacar.hasta && `#${id}-saca`, o.tarjeta && `#${id}-tarjeta`, flecha && `#${id}-f`, recuadro && `#${id}-r`, ...(o.etiquetas ?? []).map((_, i) => `#${id}-et${i}`)].filter(Boolean);
  const llegada = { monitor: { desdeY: 760 }, tablet: { desdeY: 700, giroY: -10 }, telefono: { desdeY: 800, giroY: 12 } }[o.disp.tipo];
  const js = `
    tl.fromTo("#${id}-fondo", { opacity: 0 }, { opacity: 1, duration: 0.45, ease: PD.suave }, 0);
    PD.llegar(tl, "#${id}-d", 0.05, ${JSON.stringify({ ...llegada, duracion: 1.1 })});
    ${tit ? `PD.titulo(tl, "#${id}-t", 0.8);` : ""}
    ${pasos.map((p) => `PD.camara(tl, "#${id}-cam", ${JSON.stringify(p.cam)}, ${n(p.t)}, { duracion: ${p.dur} });`).join("\n    ")}
    ${jsExtra}
    ${tit ? `PD.tituloFuera(tl, "#${id}-t", ${n(salidaTitulo)});` : ""}
    ${salen.length ? `tl.to(${JSON.stringify(salen)}, { opacity: 0, duration: 0.35, ease: PD.salir }, ${n(c.dur - 0.5)});` : ""}
  `;
  const css = `${o.tarjeta ? `
    .tj { position: absolute; opacity: 0; background: #fff; border-radius: 26px; padding: 0.9em 1.1em 1em; transform-origin: 50% 50%;
      box-shadow: 0 2px 4px rgba(43,42,51,.12), 0 30px 60px -12px rgba(43,42,51,.4), 0 70px 110px -40px rgba(43,42,51,.3); }
    .tj-titulo { font-weight: 600; color: var(--n-500); font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.5em; }
    .tj-rejilla { display: grid; column-gap: 1.2em; row-gap: 0.45em; align-items: baseline; }
    .tj-col { font-size: 0.62em; font-weight: 600; color: var(--n-500); text-transform: uppercase; letter-spacing: 0.05em; }
    .tj-c { font-weight: 500; color: var(--grafito); white-space: nowrap; }
    .tj-n { text-align: right; font-variant-numeric: tabular-nums; }
    .tj-total .tj-c { font-weight: 700; font-size: 1.25em; color: var(--acento); padding-top: 0.35em; border-top: 2px solid var(--n-200); }` : ""}
    ${recuadro ? `#${id}-r { opacity: 0; }` : ""} ${o.sacar?.radio === 999 ? `#${id}-saca .pd-sombra-flotante, #${id}-saca img { border-radius: 999px; }` : ""} ${o.css ?? ""}`;
  return { html, js, css };
}

/**
 * Cierre: «15 días gratis», sin tarjeta, peludesk.mx.
 *   telefonos  [[toma, foto], [toma, foto], [toma, foto]] — frente de cada teléfono
 *   reversos   igual, lo que muestran después de girar
 */
export function cierre(c, { telefonos, reversos }) {
  const V = c.vertical;
  const ancho = V ? 300 : 280;
  const sep = V ? 330 : 340;
  const y = V ? 560 : 150;
  const tels = telefonos.map((f, i) => c.dispositivo({
    id: `tel${i}`, tipo: "telefono", toma: f[0], x: c.W / 2 - ancho / 2 + (i - 1) * sep, y: V ? y + (i === 1 ? -40 : 30) : y + (i === 1 ? -20 : 20), ancho,
    contenido: c.imagen(f[0], f[1]), reverso: reversos ? c.imagen(reversos[i][0], reversos[i][1]) : "", fondoBarra: "#fff8ee",
  }));
  const iso = c.recurso("public/marca/peludesk/isotipo.svg");
  const perro = c.ilustracion("chihuahua-asomandose");
  const id = c.id;
  const html = `
    <div class="pd-fondo" id="${id}-fondo" style="background:var(--morado)"></div>
    <div class="pd-camara">${tels.map((x) => x.html).join("")}</div>
    ${c.titulo(V
      ? { id: "t", texto: "15 días|*gratis*.", x: 0, y: 640, ancho: c.W, tam: 190, alinear: "center", clase: "cierre-claro" }
      : { id: "t", texto: "15 días *gratis*.", x: 0, y: 290, ancho: c.W, tam: 170, alinear: "center", clase: "cierre-claro" })}
    <div id="${id}-sub" class="cierre-sub" style="top:${V ? 1050 : 500}px">Sin tarjeta. Si no te sirve, no pagas nada.</div>
    <div id="${id}-marca" class="cierre-marca" style="top:${V ? 1140 : 600}px">
      <img src="${iso}" alt="" /><span><b>pelu</b><i>desk</i><em>.mx</em></span>
    </div>
    <img id="${id}-perro" src="${perro}" alt="" style="position:absolute;${V ? "left:-49px;top:1420px;width:300px" : "left:-49px;top:660px;width:300px"};opacity:0" />`;
  const css = `
    #${id}-raiz { --acento: var(--menta); }
    .cierre-claro { color: var(--crema) !important; }
    .cierre-sub { position: absolute; left: 0; right: 0; text-align: center; color: rgba(255,248,238,.8); font-size: ${V ? 40 : 36}px; font-weight: 500; opacity: 0; }
    .cierre-marca { position: absolute; left: 50%; display: flex; align-items: center; gap: 16px; opacity: 0; margin-left: ${V ? -220 : -200}px; width: ${V ? 440 : 400}px; justify-content: center;
      background: var(--crema); border-radius: 999px; padding: 14px 30px 14px 16px; }
    .cierre-marca img { width: ${V ? 64 : 58}px; height: ${V ? 64 : 58}px; border-radius: 16px; }
    .cierre-marca span { font-size: ${V ? 50 : 46}px; font-weight: 700; letter-spacing: -0.02em; }
    .cierre-marca b { color: var(--morado); font-weight: 700; } .cierre-marca i { font-style: normal; color: #1f6b57; } .cierre-marca em { font-style: normal; color: var(--n-500); font-weight: 600; }`;
  const js = `
    tl.fromTo("#${id}-fondo", { clipPath: "circle(0% at 50% 60%)" }, { clipPath: "circle(120% at 50% 60%)", duration: 0.8, ease: "power2.inOut" }, 0);
    ${tels.map((_, i) => `PD.llegar(tl, "#${id}-tel${i}", ${n(0.2 + i * 0.1)}, { desdeY: 900, inclina: 18, duracion: 1.0 });`).join("\n    ")}
    ${reversos ? tels.map((_, i) => `tl.fromTo("#${id}-tel${i}", { rotationY: 0 }, { rotationY: 180, duration: 1.1, ease: R(0.08), transformPerspective: 1800 }, ${n(0.95 + i * 0.1)});`).join("\n    ") : ""}
    ${tels.map((_, i) => `tl.fromTo("#${id}-tel${i}-p", { filter: "blur(0px)" }, { immediateRender: false, y: ${V ? 60 : 40}, scale: 0.8, opacity: 0.25, filter: "blur(5px)", duration: 0.7, ease: PD.suave }, ${n(1.75 + i * 0.05)});`).join("\n    ")}
    PD.titulo(tl, "#${id}-t", 2.05, { y: 90 });
    tl.fromTo("#${id}-sub", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: R(0.06) }, 2.6);
    tl.fromTo("#${id}-marca", { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: R(0.14) }, 2.95);
    tl.fromTo("#${id}-perro", { opacity: 1, x: -260, rotation: -8 }, { x: 0, rotation: 0, duration: 1.0, ease: R(0.12) }, 3.4);
  `;
  return { html, js, css };
}
