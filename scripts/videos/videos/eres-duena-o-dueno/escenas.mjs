// Escenas propias de "¿Eres dueña o dueño de un negocio canino?": las tomas de
// IA aprobadas (scripts/videos/ia), la cifra del INEGI (código), versiones
// cortas de la agenda, la vacuna y la caja, y el cierre. La libreta y los
// chats son los de "Un día en tu guardería" (gancho.mjs, modo soloCaos).
const n = (x) => Math.round(x * 100) / 100;
const visible = (m, t) => ({ ...m, h: Math.min(m.h, t.alto - m.y) });
const entrada = (id) => `tl.fromTo("#${id}-fondo", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: PD.suave }, 0);`;

// Un clip vertical de IA: en 9:16 llena la pantalla; en 16:9 va centrado a toda
// la altura sobre una copia desenfocada (estático, sin animar el filtro).
function tomaIA(c, archivo, { id, inicio, duracion, desde = 0, escala = 1 }) {
  const V = c.vertical;
  const alto = c.H;
  const ancho = Math.round((alto * 9) / 16);
  const principal = c.clip(archivo, { inicio, duracion, desde, estilo: V ? `position:absolute;left:0;top:0;width:${c.W}px;height:${c.H}px;object-fit:cover;transform:scale(${escala})` : `position:absolute;left:${n((c.W - ancho) / 2)}px;top:0;width:${ancho}px;height:${alto}px;object-fit:cover` });
  const fondo = V ? "" : c.clip(archivo, { inicio, duracion, desde, estilo: `position:absolute;left:0;top:-15%;width:${c.W}px;height:130%;object-fit:cover;filter:blur(44px) brightness(0.8)` });
  return `<div id="${id}" class="ia-toma" style="position:absolute;inset:0;opacity:0">${fondo}${principal}</div>`;
}

// ── 1. Cuatro tomas de IA (la cuarta sigue en la escena 2) ──
export function tomasIA(c, { aprobadas, tomas }) {
  let t = 0;
  const html = tomas.map(([clave, dur], i) => {
    const inicio = t;
    t += dur;
    return tomaIA(c, aprobadas[clave], { id: `e1-t${i}`, inicio: n(inicio), duracion: n(dur + 0.2), desde: clave === "T4" ? 0 : 0.3 });
  }).join("");
  let ini = 0;
  const js = tomas.map(([, dur], i) => {
    const s = `tl.fromTo("#e1-t${i}", { opacity: 0 }, { opacity: 1, duration: ${i === 0 ? 0.01 : 0.18}, ease: "none" }, ${n(ini)});`;
    ini += dur;
    return s;
  }).join("\n    ");
  return { html: `<div class="pd-fondo" style="background:#2b2a33"></div>${html}`, js: `
    ${js}
  `, css: "" };
}

// ── 2. La cuarta toma y la cifra: 52 de cada 100 cierran antes de 2 años ──
export function cifra(c, { aprobadas, continuaEn }) {
  const V = c.vertical;
  const puntos = Array.from({ length: 100 }, (_, i) => i);
  const lado = V ? 50 : 56;
  const sep = V ? 8 : 10;
  const malla = 10 * lado + 9 * sep;
  const mx = V ? (c.W - malla) / 2 : c.W - malla - 130;
  const my = V ? 680 : (c.H - malla) / 2 - 20;
  const html = `
    <div class="pd-fondo" id="e2-fondo" style="background:#2b2a33"></div>
    ${tomaIA(c, aprobadas.T4, { id: "e2-toma", inicio: 0, duracion: 4.8, desde: continuaEn, escala: 1 }).replace('opacity:0"', 'opacity:1"')}
    <div id="e2-vela" style="position:absolute;inset:0;background:#2b2a33;opacity:0"></div>
    <div id="e2-puntos" style="position:absolute;left:${n(mx)}px;top:${n(my)}px;width:${malla}px;height:${malla}px;display:grid;grid-template-columns:repeat(10,${lado}px);gap:${sep}px">
      ${puntos.map((i) => `<i class="e2-p" id="e2-p${i}" style="width:${lado}px;height:${lado}px"></i>`).join("")}
    </div>
    <div id="e2-num" class="e2-num" style="${V ? "left:0;right:0;top:150px;text-align:center" : "left:130px;top:250px"}"><b id="e2-n">0</b><span>de cada 100</span></div>
    <div id="e2-txt" class="e2-txt" style="${V ? "left:90px;right:90px;top:470px;text-align:center" : "left:130px;top:610px;width:760px"}">negocios en México <em>cierran antes de cumplir 2 años</em></div>
    <div id="e2-fuente" class="e2-fuente" style="${V ? "left:60px;right:60px;top:1272px;text-align:center" : "left:130px;bottom:160px"}">Fuente: INEGI, Demografía de los Negocios 1989-2019</div>`;
  const css = `
    .e2-p { display: block; border-radius: 50%; background: rgba(255,248,238,.16); }
    .e2-p.si { background: var(--coral); }
    .e2-num { position: absolute; color: var(--crema); opacity: 0; font-variant-numeric: tabular-nums; }
    .e2-num b { display: inline-block; font-size: ${V ? 300 : 280}px; font-weight: 800; letter-spacing: -0.045em; line-height: 0.95; color: var(--coral); }
    .e2-num span { display: inline-block; margin-left: 24px; font-size: ${V ? 70 : 64}px; font-weight: 600; color: var(--crema); }
    .e2-txt { position: absolute; color: var(--crema); font-size: ${V ? 62 : 60}px; font-weight: 600; line-height: 1.12; letter-spacing: -0.01em; opacity: 0; }
    .e2-txt em { font-style: normal; color: var(--menta); }
    .e2-fuente { position: absolute; color: rgba(255,248,238,.72); font-size: ${V ? 34 : 30}px; font-weight: 500; opacity: 0; }
    #e2-puntos { opacity: 0; }`;
  const js = `
    // La toma sigue de la escena anterior; después se oscurece y entra la cifra.
    tl.to("#e2-vela", { opacity: 0.8, duration: 0.9, ease: PD.suave }, 2.4);
    tl.fromTo("#e2-num", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: R(0.1) }, 2.7);
    PD.contar(tl, "#e2-n", 0, 52, 2.8, { duracion: 1.6 });
    tl.fromTo("#e2-puntos", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 2.9);
    ${puntos.map((i) => `tl.fromTo("#e2-p${i}", { scale: 0.4 }, { scale: 1, duration: 0.35, ease: R(0.2) }, ${n(3.0 + i * 0.012)});`).join("\n    ")}
    ${Array.from({ length: 52 }, (_, i) => `tl.set("#e2-p${i}", { className: "e2-p si" }, ${n(3.1 + (i / 52) * 1.5)});`).join("\n    ")}
    tl.fromTo("#e2-txt", { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.7, ease: R(0.06) }, 4.6);
    tl.fromTo("#e2-fuente", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: PD.suave }, 5.6);
    tl.to(["#e2-num", "#e2-txt", "#e2-puntos", "#e2-fuente"], { opacity: 0, duration: 0.4, ease: PD.salir }, ${n(c.dur - 0.45)});
  `;
  return { html, js, css };
}

// ── 4. Agenda de estética (corta) ──
export function agendaCorta(c) {
  const V = c.vertical;
  const t = c.toma("estetica");
  const M = t.marcas;
  const mon = c.dispositivo({ id: "mon", tipo: "monitor", toma: "estetica", ...(V ? { x: 60, y: 620, ancho: 960 } : { x: 760, y: 170, ancho: 1040 }), video: { inicio: 0, desde: 0 } });
  const col1 = mon.cajaDe(visible(M["columna-1"], t));
  const col2 = mon.cajaDe(visible(M["columna-2"], t));
  const zona = { x: (col1.x + col2.x + col2.w) / 2, y: col1.y + (V ? 250 : 190) * mon.escala };
  const cam1 = c.camaraA(zona, V ? 2.15 : 1.6, c.W / 2, V ? c.H * 0.5 : c.H / 2);
  const html = `
    <div class="pd-fondo" id="e4-fondo"></div>
    <div class="pd-camara" id="e4-cam">${mon.html}
      ${c.recuadro({ id: "r1", caja: col1, radio: 16, grosor: 3, holgura: 5 })}
      ${c.recuadro({ id: "r2", caja: col2, radio: 16, grosor: 3, holgura: 5 })}
    </div>
    ${c.titulo(V ? { id: "t", texto: "Tu agenda,|sin *choques*.", x: 80, y: 250, ancho: 920, tam: 96 } : { id: "t", texto: "Tu agenda,|sin *choques*.", x: 110, y: 400, ancho: 600, tam: 84 })}`;
  const js = `
    ${entrada("e4")}
    PD.llegar(tl, "#e4-mon", 0.05, { desdeY: 700, duracion: 1.0 });
    PD.titulo(tl, "#e4-t", 0.5);
    PD.tituloFuera(tl, "#e4-t", 1.2);
    PD.camara(tl, "#e4-cam", ${JSON.stringify(cam1)}, 1.4, { duracion: 1.0 });
    tl.set(["#e4-r1", "#e4-r2"], { opacity: 1 }, 0);
    PD.trazar(tl, "#e4-r1", 2.3, { duracion: 0.5 });
    PD.trazar(tl, "#e4-r2", 2.7, { duracion: 0.5 });
    PD.irse(tl, "#e4-mon-p", ${n(c.dur - 0.45)}, { y: -60, duracion: 0.45 });
  `;
  return { html, js, css: `#e4-r1, #e4-r2 { opacity: 0; }` };
}

// ── 5. Vacuna vencida (corta): arranca en el expediente de Simba ──
export function vacunaCorta(c) {
  const V = c.vertical;
  const t = c.toma("vacuna");
  const M = t.marcas;
  const desde = n(Math.max(0, M.vencida.t - 0.5));
  const contenido = `${c.imagen("vacuna", "simba")}${c.video("vacuna", { inicio: 0, desde, duracion: Math.min(c.dur, t.duracion - desde - 0.05) })}`;
  const tel = c.dispositivo({ id: "tel", tipo: "telefono", toma: "vacuna", ...(V ? { x: 305, y: 500, ancho: 470 } : { x: 1290, y: 92, ancho: 380 }), contenido, fondoBarra: "#fff8ee" });
  const pastilla = c.flotante({ id: "vencida", toma: "vacuna", marca: "vencida", disp: tel, radio: 999 });
  const destino = V ? { x: 540, y: 400, s: 2.05, g: -3 } : { x: 720, y: 560, s: 2.2, g: -3 };
  const anchoP = pastilla.caja.w * destino.s;
  const linea = tel.cajaDe(M["no-se-puede"]);
  const flecha = V
    ? c.flecha({ id: "f", de: { x: destino.x - 80, y: destino.y + 70 }, a: { x: linea.x + 30, y: linea.y - 14 }, curva: -0.25, color: "var(--coral-oscuro)" })
    : c.flecha({ id: "f", de: { x: destino.x + anchoP / 2 - 60, y: destino.y + 52 }, a: { x: linea.x - 16, y: linea.y + linea.h / 2 }, curva: 0.3, color: "var(--coral-oscuro)" });
  const html = `
    <div class="pd-fondo" id="e5-fondo"></div>
    <div class="pd-camara" id="e5-cam">${tel.html}${c.recuadro({ id: "r", caja: linea, radio: 10, grosor: 3.5, holgura: 6, color: "var(--coral-oscuro)" })}</div>
    ${flecha}${pastilla.html}
    ${c.titulo(V ? { id: "t", texto: "Te avisa *antes*|de recibirlo.", x: 80, y: 220, ancho: 920, tam: 92 } : { id: "t", texto: "Te avisa *antes*|de recibirlo.", x: 110, y: 170, ancho: 900, tam: 84 })}`;
  const js = `
    ${entrada("e5")}
    PD.llegar(tl, "#e5-tel", 0.05, { desdeY: 800, giroY: 12, duracion: 0.9 });
    PD.titulo(tl, "#e5-t", 0.6);
    ${V ? `PD.tituloFuera(tl, "#e5-t", 1.45);` : ""}
    PD.salirDePantalla(tl, "#e5-vencida", 1.5, ${JSON.stringify(pastilla.hacia(destino.x, destino.y, destino.s, destino.g))}, { rebote: 0.18 });
    tl.set("#e5-r", { opacity: 1 }, 0);
    PD.trazar(tl, "#e5-f", 2.6, { duracion: 0.45 });
    PD.trazar(tl, "#e5-r", 2.95, { duracion: 0.5 });
    tl.to(["#e5-vencida", "#e5-f", "#e5-r"], { opacity: 0, duration: 0.3, ease: PD.salir }, ${n(c.dur - 0.5)});
    ${V ? "" : `PD.tituloFuera(tl, "#e5-t", ${n(c.dur - 0.5)});`}
  `;
  return { html, js, css: `#e5-r { opacity: 0; } #e5-vencida .pd-sombra-flotante, #e5-vencida img { border-radius: 999px; }` };
}

// ── 6. Caja (corta): el saldo sale de la pantalla ──
export function cajaCorta(c) {
  const V = c.vertical;
  const t = c.toma("caja");
  const M = t.marcas;
  const desde = n(Math.max(0, M.saldo.t - 1.0));
  const mon = c.dispositivo({ id: "mon", tipo: "monitor", toma: "caja", ...(V ? { x: 40, y: 470, ancho: 1000 } : { x: 90, y: 150, ancho: 1080 }), video: { inicio: 0, desde } });
  const cajaSaldo = mon.cajaDe(M.saldo);
  const monto = (/\$\s*[\d,.]+/.exec(M.saldo.texto) || ["$0"])[0].replace(/\s/g, "");
  const tarjeta = V ? { w: 620, h: 210, x: 540, y: 1600 } : { w: 520, h: 190, x: 1560, y: 470 };
  const s0 = cajaSaldo.h / tarjeta.h;
  const salida = { x: n(cajaSaldo.x + cajaSaldo.w / 2 - tarjeta.x), y: n(cajaSaldo.y + cajaSaldo.h / 2 - tarjeta.y), scale: n(s0) };
  const html = `
    <div class="pd-fondo" id="e6-fondo"></div>
    <div class="pd-camara" id="e6-cam">${mon.html}</div>
    <div id="e6-saldo" class="e6-saldo" style="left:${n(tarjeta.x - tarjeta.w / 2)}px;top:${n(tarjeta.y - tarjeta.h / 2)}px;width:${tarjeta.w}px;height:${tarjeta.h}px"><span>Saldo de la cuenta</span><b>${c.esc(monto)}</b></div>
    ${c.titulo(V ? { id: "t", texto: "Y la caja,|*cuadrada*.", x: 80, y: 220, ancho: 920, tam: 92 } : { id: "t", texto: "Y la caja, *cuadrada*.", x: 90, y: 36, ancho: 1300, tam: 68 })}`;
  const tSaldo = M.saldo.t - desde + 0.1;
  const js = `
    ${entrada("e6")}
    PD.llegar(tl, "#e6-mon", 0.05, { desdeY: 760, duracion: 1.0 });
    PD.titulo(tl, "#e6-t", 0.55);
    tl.fromTo("#e6-saldo", { opacity: 0, x: ${salida.x}, y: ${salida.y}, scale: ${salida.scale} }, { opacity: 1, duration: 0.15, ease: "none" }, ${n(tSaldo)});
    tl.to("#e6-saldo", { x: 0, y: 0, scale: 1, rotation: -2, duration: 1.0, ease: R(0.14) }, ${n(tSaldo + 0.12)});
    tl.to("#e6-saldo", { opacity: 0, y: -30, duration: 0.35, ease: PD.salir }, ${n(c.dur - 0.5)});
    PD.tituloFuera(tl, "#e6-t", ${n(c.dur - 0.5)});
  `;
  const css = `.e6-saldo { position: absolute; opacity: 0; background: #fff; border-radius: 26px; display: flex; flex-direction: column; justify-content: center; padding: 0 40px;
      box-shadow: 0 2px 4px rgba(43,42,51,.12), 0 30px 60px -12px rgba(43,42,51,.4), 0 70px 110px -40px rgba(43,42,51,.3); }
    .e6-saldo span { font-size: ${V ? 34 : 30}px; font-weight: 500; color: var(--n-500); }
    .e6-saldo b { display: block; font-size: ${V ? 100 : 88}px; font-weight: 700; letter-spacing: -0.03em; color: var(--coral-oscuro); line-height: 1; margin-top: 6px; }`;
  return { html, js, css };
}

// ── 7. Cierre corto: 15 días gratis, sin tarjeta, peludesk.mx ──
export function cierreCorto(c) {
  const V = c.vertical;
  const iso = c.recurso("public/marca/peludesk/isotipo.svg");
  const chihuahua = c.ilustracion("chihuahua-asomandose");
  const html = `
    <div class="pd-fondo" id="e7-fondo" style="background:var(--morado)"></div>
    ${c.titulo(V ? { id: "t", texto: "15 días|*gratis*.", x: 0, y: 560, ancho: c.W, tam: 210, alinear: "center", clase: "e7-claro" } : { id: "t", texto: "15 días *gratis*.", x: 0, y: 250, ancho: c.W, tam: 180, alinear: "center", clase: "e7-claro" })}
    <div id="e7-sub" class="e7-sub" style="top:${V ? 1040 : 480}px">Sin tarjeta. Si no te sirve, no pagas nada.</div>
    <div id="e7-marca" class="e7-marca" style="top:${V ? 1150 : 590}px"><img src="${iso}" alt="" /><span><b>pelu</b><i>desk</i><em>.mx</em></span></div>
    <img id="e7-chi" src="${chihuahua}" alt="" style="position:absolute;${V ? "left:-49px;top:1480px;width:300px" : "left:-49px;top:700px;width:300px"};opacity:0" />`;
  const css = `
    .e7-claro { color: var(--crema) !important; }
    .e7-sub { position: absolute; left: 0; right: 0; text-align: center; color: rgba(255,248,238,.78); font-size: ${V ? 42 : 38}px; font-weight: 500; opacity: 0; }
    .e7-marca { position: absolute; left: 50%; display: flex; align-items: center; gap: 16px; opacity: 0; margin-left: ${V ? -230 : -210}px; width: ${V ? 460 : 420}px; justify-content: center;
      background: var(--crema); border-radius: 999px; padding: 14px 30px 14px 16px; }
    .e7-marca img { width: ${V ? 66 : 60}px; height: ${V ? 66 : 60}px; border-radius: 16px; }
    .e7-marca span { font-size: ${V ? 52 : 48}px; font-weight: 700; letter-spacing: -0.02em; }
    .e7-marca b { color: var(--morado); font-weight: 700; } .e7-marca i { font-style: normal; color: #1f6b57; } .e7-marca em { font-style: normal; color: var(--n-500); font-weight: 600; }`;
  const js = `
    tl.fromTo("#e7-fondo", { clipPath: "circle(0% at 50% 60%)" }, { clipPath: "circle(120% at 50% 60%)", duration: 0.7, ease: "power2.inOut" }, 0);
    PD.titulo(tl, "#e7-t", 0.35, { y: 90 });
    tl.fromTo("#e7-sub", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: R(0.06) }, 1.0);
    tl.fromTo("#e7-marca", { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: R(0.14) }, 1.5);
    tl.fromTo("#e7-chi", { opacity: 1, x: -260, rotation: -8 }, { x: 0, rotation: 0, duration: 1.0, ease: R(0.12) }, 2.0);
  `;
  return { html, js, css };
}
