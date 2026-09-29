// Escenas 2 a 6 de "Un día en tu guardería". Cada una recibe el contexto
// del compositor (c) y devuelve { html, js, css }. Los tiempos de cámara y
// de los recortes que salen de la pantalla vienen de las MARCAS de cada
// toma (tomas.mjs): si la app cambia y se vuelve a grabar, la edición sigue
// a los elementos.
//
// Ritmo por tiempos en todas: primero llega el dispositivo, cuando se
// detiene aparece el texto, y hasta después el detalle. Una cosa a la vez.

const n = (x) => Math.round(x * 100) / 100;
// La parte de una marca que se ve en la pantalla de la toma.
const visible = (m, t) => ({ ...m, h: Math.min(m.h, t.alto - m.y) });
// "11/20" → [11, 20]
const fraccion = (texto) => {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(texto || "");
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};
// Cada escena (menos la primera) entra con su fondo sobre la anterior.
const entrada = (id) => `tl.fromTo("#${id}-fondo", { opacity: 0 }, { opacity: 1, duration: 0.45, ease: PD.suave }, 0);`;

// ── 2. Monitor: la agenda de estética, una columna por estilista ──
export function estetica(c, { monitor }) {
  const V = c.vertical;
  const t = c.toma("estetica");
  const M = t.marcas;
  const mon = c.dispositivo({ id: "mon", tipo: "monitor", toma: "estetica", ...monitor, video: { inicio: 0, desde: 0 } });
  const col1 = mon.cajaDe(visible(M["columna-1"], t));
  const col2 = mon.cajaDe(visible(M["columna-2"], t));
  const cita = mon.centroDe(M.cita);
  // Zoom 1: las columnas, desde arriba.
  const zona = { x: (col1.x + col2.x + col2.w) / 2, y: col1.y + (V ? 250 : 190) * mon.escala };
  const cam1 = c.camaraA(zona, V ? 2.15 : 1.6, c.W / 2, V ? c.H * 0.5 : c.H / 2);
  const cam2 = c.camaraA(cita, V ? 2.9 : 2.3, c.W / 2, c.H * 0.5);
  const tClic = M["clic-cita"].t;

  const html = `
    <div class="pd-fondo" id="e2-fondo"></div>
    <div class="pd-camara" id="e2-cam">
      ${mon.html}
      ${c.recuadro({ id: "r1", caja: col1, radio: 16, grosor: 3, holgura: 5 })}
      ${c.recuadro({ id: "r2", caja: col2, radio: 16, grosor: 3, holgura: 5 })}
    </div>
    ${c.titulo(V
      ? { id: "t", texto: "Una columna|por *estilista*.", x: 80, y: 250, ancho: 920, tam: 96 }
      : { id: "t", texto: "Una columna|por *estilista*.", x: 110, y: 400, ancho: 600, tam: 84 })}`;

  const js = `
    ${entrada("e2")}
    PD.titulo(tl, "#e2-t", 0.45);
    PD.tituloFuera(tl, "#e2-t", 1.6);
    PD.camara(tl, "#e2-cam", ${JSON.stringify(cam1)}, 1.75, { duracion: 1.2 });
    tl.set(["#e2-r1", "#e2-r2"], { opacity: 1 }, 0);
    PD.trazar(tl, "#e2-r1", 2.35, { duracion: 0.6 });
    PD.trazar(tl, "#e2-r2", 2.95, { duracion: 0.6 });
    tl.to(["#e2-r1", "#e2-r2"], { opacity: 0, duration: 0.3 }, ${n(tClic - 2.2)});
    PD.camara(tl, "#e2-cam", ${JSON.stringify(cam2)}, ${n(tClic - 2.0)}, { duracion: 1.3 });
    PD.camara(tl, "#e2-cam", { x: 0, y: 0, scale: 1 }, ${n(tClic + 0.35)}, { duracion: 1.2 });
    PD.irse(tl, "#e2-mon-p", ${n(c.dur - 0.5)}, { y: -80, duracion: 0.5 });
  `;
  return { html, js, css: `#e2-r1, #e2-r2 { opacity: 0; }` };
}

// ── 3. Tablet: el cupo de hotel y guardería se cuenta solo ──
export function cupo(c) {
  const V = c.vertical;
  const t = c.toma("hotel");
  const M = t.marcas;
  const tab = c.dispositivo({ id: "tab", tipo: "tablet", toma: "hotel", ...(V ? { x: 50, y: 610, ancho: 980 } : { x: 760, y: 190, ancho: 1020 }), video: { inicio: 0, desde: 0 } });
  const fila = c.flotante({ id: "fila", toma: "hotel", marca: "hoy", disp: tab, radio: 10 });
  const destino = V ? { x: 540, y: 990, s: 1.08 } : { x: 1180, y: 470, s: 1.12 };
  const anchoFila = fila.caja.w * destino.s;
  const [dia, cupoDia] = fraccion(M["hoy-diurno"].texto);
  const [noche, cupoNoche] = fraccion(M["hoy-nocturno"].texto);
  const bx = destino.x - anchoFila / 2;
  const by = destino.y + (fila.caja.h * destino.s) / 2 + 22;
  const tPop = M.hoy.t + 0.15;
  const barra = (i, etiqueta, ocupado, total) => `
      <div class="e3-fila">
        <div class="e3-et">${etiqueta}</div>
        <div class="e3-num"><span id="e3-n${i}">0</span><span class="e3-de">/${total}</span></div>
        <div class="e3-pista"><div class="e3-lleno${i === 2 ? " noche" : ""}" id="e3-b${i}" style="width:${n((ocupado / Math.max(1, total)) * 100)}%"></div></div>
      </div>`;
  const html = `
    <div class="pd-fondo" id="e3-fondo"></div>
    <div class="pd-camara" id="e3-cam">${tab.html}</div>
    ${fila.html}
    <div id="e3-barras" style="left:${n(bx)}px;top:${n(by)}px;width:${n(anchoFila)}px">
      ${barra(1, "<b>De día</b> · toda la casa", dia, cupoDia)}
      ${barra(2, "<b>De noche</b> · hotel", noche, cupoNoche)}
    </div>
    ${c.titulo(V
      ? { id: "t", texto: "El cupo se|cuenta *solo*.", x: 80, y: 250, ancho: 920, tam: 96 }
      : { id: "t", texto: "El cupo|se cuenta *solo*.", x: 110, y: 400, ancho: 600, tam: 84 })}`;
  const css = `
    #e3-barras { position: absolute; background: #fff; border-radius: 22px; padding: 26px 30px 30px; opacity: 0;
      box-shadow: 0 2px 4px rgba(43,42,51,.1), 0 30px 60px -18px rgba(43,42,51,.35); }
    .e3-fila { display: grid; grid-template-columns: 1fr auto; row-gap: 12px; align-items: baseline; }
    .e3-fila + .e3-fila { margin-top: 22px; }
    .e3-et { font-size: ${V ? 32 : 28}px; color: var(--n-500); } .e3-et b { color: var(--grafito); font-weight: 600; }
    .e3-num { font-size: ${V ? 44 : 40}px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
    .e3-de { color: var(--n-500); font-weight: 500; }
    .e3-pista { grid-column: 1 / -1; height: 18px; border-radius: 99px; background: var(--n-200); overflow: hidden; }
    .e3-lleno { height: 100%; border-radius: 99px; background: var(--menta-oscuro); transform-origin: 0 50%; }
    .e3-lleno.noche { background: var(--menta); }`;
  const js = `
    ${entrada("e3")}
    PD.llegar(tl, "#e3-tab", 0.05, { desdeY: 700, giroY: -10, duracion: 1.15 });
    PD.titulo(tl, "#e3-t", 0.95);
    PD.salirDePantalla(tl, "#e3-fila", ${n(tPop)}, ${JSON.stringify(fila.hacia(destino.x, destino.y, destino.s))});
    PD.alFondo(tl, "#e3-tab-p", ${n(tPop + 0.1)}, { blur: 5, escala: 0.96 });
    tl.fromTo("#e3-barras", { opacity: 0, y: -30, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: R(0.1) }, ${n(tPop + 0.9)});
    tl.fromTo("#e3-b1", { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: R(0.08) }, ${n(tPop + 1.2)});
    PD.contar(tl, "#e3-n1", 0, ${dia}, ${n(tPop + 1.2)}, { duracion: 1.0 });
    tl.fromTo("#e3-b2", { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: R(0.08) }, ${n(tPop + 1.55)});
    PD.contar(tl, "#e3-n2", 0, ${noche}, ${n(tPop + 1.55)}, { duracion: 0.8 });
    PD.tituloFuera(tl, "#e3-t", ${n(c.dur - 0.6)});
    tl.to(["#e3-fila", "#e3-barras"], { opacity: 0, y: -40, duration: 0.4, ease: PD.salir }, ${n(c.dur - 0.55)});
  `;
  return { html, js, css };
}

// ── 4. Teléfono: la vacuna vencida avisa antes de recibir al perro ──
export function vacuna(c) {
  const V = c.vertical;
  const t = c.toma("vacuna");
  const M = t.marcas;
  // Corte al ritmo: de la búsqueda al tap en el dueño, y de ahí directo al
  // expediente de Simba (sin la carga de en medio).
  const corte = n(M["clic-cliente"].t + 0.08 - 0.3);
  const desdeB = n(M.vencida.t - 0.45);
  const contenido = `${c.imagen("vacuna", "simba")}
    ${c.video("vacuna", { inicio: 0, desde: 0.3, duracion: corte })}
    ${c.video("vacuna", { inicio: corte, desde: desdeB, duracion: Math.min(c.dur - corte, t.duracion - desdeB - 0.05) })}`;
  const tel = c.dispositivo({ id: "tel", tipo: "telefono", toma: "vacuna", ...(V ? { x: 305, y: 500, ancho: 470 } : { x: 1290, y: 92, ancho: 380 }), contenido, fondoBarra: "#fff8ee" });
  const pastilla = c.flotante({ id: "vencida", toma: "vacuna", marca: "vencida", disp: tel, radio: 999 });
  const destino = V ? { x: 540, y: 400, s: 2.05, g: -3 } : { x: 720, y: 560, s: 2.2, g: -3 };
  const anchoP = pastilla.caja.w * destino.s;
  const linea = tel.cajaDe(M["no-se-puede"]);
  const flecha = V
    ? c.flecha({ id: "f", de: { x: destino.x - 80, y: destino.y + 70 }, a: { x: linea.x + 30, y: linea.y - 14 }, curva: -0.25, color: "var(--coral-oscuro)" })
    : c.flecha({ id: "f", de: { x: destino.x + anchoP / 2 - 60, y: destino.y + 52 }, a: { x: linea.x - 16, y: linea.y + linea.h / 2 }, curva: 0.3, color: "var(--coral-oscuro)" });
  const tPop = corte + 0.75;
  const html = `
    <div class="pd-fondo" id="e4-fondo"></div>
    <div class="pd-camara" id="e4-cam">
      ${tel.html}
      ${c.recuadro({ id: "r", caja: linea, radio: 10, grosor: 3.5, holgura: 6, color: "var(--coral-oscuro)" })}
    </div>
    ${flecha}
    ${pastilla.html}
    ${c.titulo(V
      ? { id: "t", texto: "Te avisa *antes*|de recibirlo.", x: 80, y: 220, ancho: 920, tam: 92 }
      : { id: "t", texto: "Te avisa *antes*|de recibirlo.", x: 110, y: 170, ancho: 900, tam: 84 })}`;
  const js = `
    ${entrada("e4")}
    PD.llegar(tl, "#e4-tel", 0.05, { desdeY: 800, giroY: 12, duracion: 1.1 });
    PD.titulo(tl, "#e4-t", 0.9);
    ${V ? `PD.tituloFuera(tl, "#e4-t", ${n(tPop - 0.35)});` : ""}
    PD.salirDePantalla(tl, "#e4-vencida", ${n(tPop)}, ${JSON.stringify(pastilla.hacia(destino.x, destino.y, destino.s, destino.g))}, { rebote: 0.18 });
    tl.set("#e4-r", { opacity: 1 }, 0);
    PD.trazar(tl, "#e4-f", ${n(tPop + 1.1)}, { duracion: 0.5 });
    PD.trazar(tl, "#e4-r", ${n(tPop + 1.45)}, { duracion: 0.55 });
    tl.to(["#e4-vencida", "#e4-f", "#e4-r"], { opacity: 0, duration: 0.35, ease: PD.salir }, ${n(c.dur - 0.6)});
    ${V ? "" : `PD.tituloFuera(tl, "#e4-t", ${n(c.dur - 0.6)});`}
  `;
  return { html, js, css: `#e4-r { opacity: 0; } #e4-vencida .pd-sombra-flotante, #e4-vencida img { border-radius: 999px; }` };
}

// ── 5. Monitor y teléfono: la caja cobra con terminal y el dueño ve su portal ──
export function caja(c) {
  const V = c.vertical;
  const t = c.toma("caja");
  const M = t.marcas;
  const desdeCaja = 0.5;
  const mon = c.dispositivo({ id: "mon", tipo: "monitor", toma: "caja", ...(V ? { x: 40, y: 470, ancho: 1000 } : { x: 90, y: 150, ancho: 1080 }), video: { inicio: 0, desde: desdeCaja } });
  const tLlegaTel = 6.9;
  const tel = c.dispositivo({ id: "tel", tipo: "telefono", toma: "portal", ...(V ? { x: 610, y: 850, ancho: 400 } : { x: 1420, y: 160, ancho: 340 }), video: { inicio: tLlegaTel - 0.2, desde: 0.6 }, fondoBarra: "#fff8ee" });
  // El saldo sale de la pantalla como tarjeta con el mismo texto de la app
  // (vectorial: nace del tamaño exacto del renglón y crece nítido).
  const cajaSaldo = mon.cajaDe(M.saldo);
  const monto = (/\$\s*[\d,.]+/.exec(M.saldo.texto) || ["$0"])[0].replace(/\s/g, "");
  const tarjeta = V ? { w: 620, h: 210, x: 540, y: 1600 } : { w: 520, h: 190, x: 1560, y: 470 };
  const s0 = cajaSaldo.h / tarjeta.h;
  const salidaSaldo = { x: n(cajaSaldo.x + cajaSaldo.w / 2 - tarjeta.x), y: n(cajaSaldo.y + cajaSaldo.h / 2 - tarjeta.y), scale: n(s0) };
  const saldo = { html: `<div id="e5-saldo" class="e5-saldo" style="left:${n(tarjeta.x - tarjeta.w / 2)}px;top:${n(tarjeta.y - tarjeta.h / 2)}px;width:${tarjeta.w}px;height:${tarjeta.h}px"><span>Saldo de la cuenta</span><b>${c.esc(monto)}</b></div>` };
  const tSaldo = M.saldo.t - desdeCaja + 0.1;
  const tTerminal = M["clic-terminal"].t - desdeCaja;
  const form = mon.centroDe(M.terminal);
  const camForm = c.camaraA(form, V ? 1.3 : 1.55, c.W / 2, c.H * 0.52);
  const html = `
    <div class="pd-fondo" id="e5-fondo"></div>
    <div class="pd-camara" id="e5-cam">${mon.html}</div>
    ${saldo.html}
    ${tel.html}
    ${c.titulo(V
      ? { id: "t1", texto: "Cobras con|*terminal*.", x: 80, y: 220, ancho: 920, tam: 92 }
      : { id: "t1", texto: "Cobras con *terminal*.", x: 90, y: 36, ancho: 1300, tam: 68 })}
    ${c.titulo(V
      ? { id: "t2", texto: "Y el dueño|lo ve en su *portal*.", x: 80, y: 220, ancho: 920, tam: 92 }
      : { id: "t2", texto: "Y el dueño lo ve en su *portal*.", x: 90, y: 36, ancho: 1300, tam: 68 })}`;
  const js = `
    ${entrada("e5")}
    PD.llegar(tl, "#e5-mon", 0.05, { desdeY: 760, duracion: 1.15 });
    PD.titulo(tl, "#e5-t1", 0.85);
    tl.fromTo("#e5-saldo", { opacity: 0, x: ${salidaSaldo.x}, y: ${salidaSaldo.y}, scale: ${salidaSaldo.scale} }, { opacity: 1, duration: 0.15, ease: "none" }, ${n(tSaldo)});
    tl.to("#e5-saldo", { x: 0, y: 0, scale: 1, rotation: -2, duration: 1.1, ease: R(0.14) }, ${n(tSaldo + 0.12)});
    // El total flota: sube y baja un poco mientras está afuera.
    tl.to("#e5-saldo b", { y: -5, duration: 0.8, ease: "sine.inOut", yoyo: true, repeat: 1 }, ${n(tSaldo + 1.2)});
    tl.to("#e5-saldo", { opacity: 0, y: -30, duration: 0.35, ease: PD.salir }, ${n(tTerminal - 0.55)});
    PD.camara(tl, "#e5-cam", ${JSON.stringify(camForm)}, ${n(tTerminal - 0.35)}, { duracion: 1.2 });
    PD.camara(tl, "#e5-cam", { x: 0, y: 0, scale: 1 }, ${n(tLlegaTel - 0.4)}, { duracion: 1.1 });
    PD.alFondo(tl, "#e5-mon-p", ${n(tLlegaTel - 0.2)}, { blur: ${V ? 5 : 3}, escala: ${V ? 0.94 : 0.97} });
    PD.tituloFuera(tl, "#e5-t1", ${n(tLlegaTel - 0.5)});
    tl.fromTo("#e5-tel-p", { opacity: 0 }, { opacity: 1, duration: 0.2 }, ${n(tLlegaTel - 0.2)});
    PD.llegar(tl, "#e5-tel", ${n(tLlegaTel - 0.2)}, { desdeY: 900, giroY: -16, duracion: 1.15 });
    PD.titulo(tl, "#e5-t2", ${n(tLlegaTel + 0.6)});
  `;
  const css = `#e5-tel-p { opacity: 0; }
    .e5-saldo { position: absolute; opacity: 0; background: #fff; border-radius: 26px; display: flex; flex-direction: column; justify-content: center; padding: 0 40px;
      box-shadow: 0 2px 4px rgba(43,42,51,.12), 0 30px 60px -12px rgba(43,42,51,.4), 0 70px 110px -40px rgba(43,42,51,.3); }
    .e5-saldo span { font-size: ${V ? 34 : 30}px; font-weight: 500; color: var(--n-500); }
    .e5-saldo b { display: block; font-size: ${V ? 100 : 88}px; font-weight: 700; letter-spacing: -0.03em; color: var(--coral-oscuro); line-height: 1; margin-top: 6px; }`;
  return { html, js, css };
}

// ── 6. Cierre: tres teléfonos que giran y "15 días gratis" ──
export function cierre(c) {
  const V = c.vertical;
  const ancho = V ? 300 : 280;
  const sep = V ? 330 : 340;
  const y = V ? 620 : 190;
  const frentes = [["celular", "guarderia"], ["celular", "estetica"], ["celular", "hotel"]];
  const reversos = [["vacuna", "simba"], ["celular", "caja"], ["portal", "inicio"]];
  const tels = frentes.map((f, i) => c.dispositivo({
    id: `tel${i}`, tipo: "telefono", toma: f[0], x: c.W / 2 - ancho / 2 + (i - 1) * sep, y: V ? y + (i === 1 ? -40 : 30) : y + (i === 1 ? -20 : 20), ancho,
    contenido: c.imagen(f[0], f[1]), reverso: c.imagen(reversos[i][0], reversos[i][1]), fondoBarra: "#fff8ee",
  }));
  const iso = c.recurso("public/marca/peludesk/isotipo.svg");
  const chihuahua = c.ilustracion("chihuahua-asomandose");
  const html = `
    <div class="pd-fondo" id="e6-fondo" style="background:var(--morado)"></div>
    <div class="pd-camara" id="e6-cam">${tels.map((x) => x.html).join("")}</div>
    ${c.titulo(V
      ? { id: "t", texto: "15 días|*gratis*.", x: 0, y: 700, ancho: c.W, tam: 190, alinear: "center", clase: "e6-claro" }
      : { id: "t", texto: "15 días *gratis*.", x: 0, y: 300, ancho: c.W, tam: 170, alinear: "center", clase: "e6-claro" })}
    <div id="e6-sub" class="e6-sub" style="top:${V ? 1110 : 510}px">Sin tarjeta. Si no te sirve, no pagas nada.</div>
    <div id="e6-marca" class="e6-marca" style="top:${V ? 1195 : 610}px">
      <img src="${iso}" alt="" /><span><b>pelu</b><i>desk</i><em>.mx</em></span>
    </div>
    <img id="e6-chihuahua" src="${chihuahua}" alt="" style="position:absolute;${V ? "left:-49px;top:1500px;width:300px" : "left:-49px;top:660px;width:300px"};opacity:0" />`;
  const css = `
    #e6-raiz { --acento: var(--menta); }
    .e6-claro { color: var(--crema) !important; }
    .e6-sub { position: absolute; left: 0; right: 0; text-align: center; color: rgba(255,248,238,.78); font-size: ${V ? 40 : 36}px; font-weight: 500; opacity: 0; }
    .e6-marca { position: absolute; left: 50%; display: flex; align-items: center; gap: 16px; opacity: 0; margin-left: ${V ? -220 : -200}px; width: ${V ? 440 : 400}px; justify-content: center;
      background: var(--crema); border-radius: 999px; padding: 14px 30px 14px 16px; }
    .e6-marca img { width: ${V ? 64 : 58}px; height: ${V ? 64 : 58}px; border-radius: 16px; }
    .e6-marca span { font-size: ${V ? 50 : 46}px; font-weight: 700; letter-spacing: -0.02em; }
    .e6-marca b { color: var(--morado); font-weight: 700; } .e6-marca i { font-style: normal; color: #1f6b57; } .e6-marca em { font-style: normal; color: var(--n-500); font-weight: 600; }`;
  const js = `
    tl.fromTo("#e6-fondo", { clipPath: "circle(0% at 50% 60%)" }, { clipPath: "circle(120% at 50% 60%)", duration: 0.9, ease: "power2.inOut" }, 0);
    ${tels.map((_, i) => `PD.llegar(tl, "#e6-tel${i}", ${n(0.3 + i * 0.12)}, { desdeY: 900, inclina: 18, duracion: 1.1 });`).join("\n    ")}
    ${tels.map((_, i) => `tl.fromTo("#e6-tel${i}", { rotationY: 0 }, { rotationY: 180, duration: 1.2, ease: R(0.08), transformPerspective: 1800 }, ${n(1.55 + i * 0.14)});`).join("\n    ")}
    ${tels.map((_, i) => `tl.fromTo("#e6-tel${i}-p", { filter: "blur(0px)" }, { immediateRender: false, y: ${V ? 60 : 40}, scale: 0.8, opacity: 0.28, filter: "blur(5px)", duration: 0.8, ease: PD.suave }, ${n(3.1 + i * 0.05)});`).join("\n    ")}
    PD.titulo(tl, "#e6-t", 3.65, { y: 90 });
    tl.fromTo("#e6-sub", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: R(0.06) }, 4.25);
    tl.fromTo("#e6-marca", { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: R(0.14) }, 4.7);
    tl.fromTo("#e6-chihuahua", { opacity: 1, x: -260, rotation: -8 }, { x: 0, rotation: 0, duration: 1.1, ease: R(0.12) }, 5.2);
  `;
  return { html, js, css };
}
