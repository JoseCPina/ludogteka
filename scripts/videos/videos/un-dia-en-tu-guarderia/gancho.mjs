// Escena 1: la libreta y los chats, contra la agenda limpia.
// Todo dibujado (nada de logos de ninguna app de mensajes): una libreta con
// letra a mano y un teléfono con chats que no paran de llegar. Nombres de
// perros inventados, los mismos del demo.

const APUNTES = [
  { texto: "Lun 29 · guardería", clase: "fecha" },
  { texto: "Coco — baño 11:00 ?" },
  { texto: "Toby hotel vie → dom", tachado: true },
  { texto: "Luna: ¿vacuna?", circulo: true },
  { texto: "Rocky pagó $ ??" },
  { texto: "cupo: 14? 16?" },
];

const CHATS = [
  { quien: "Coco", texto: "¿Tienen lugar el sábado?" },
  { quien: "Toby", texto: "¿A qué hora paso por él?" },
  { quien: "Luna", texto: "¿Ya le toca su vacuna?" },
  { quien: "Rocky", texto: "¿Cuánto te debo?" },
  { quien: "Nala", texto: "Mañana la llevo 8:30" },
  { quien: "Max", texto: "¿Me mandas foto? 🙏" },
  { quien: "Coco", texto: "¿Sí hay lugar?" },
];

export const CSS_GANCHO = `
  .libreta { position: absolute; border-radius: 10px; background-color: #fffdf8;
    background-image: repeating-linear-gradient(180deg, transparent 0 57px, #d6e1ea 57px 59px);
    box-shadow: 0 2px 4px rgba(43,42,51,.12), 0 30px 60px -18px rgba(43,42,51,.35); }
  .libreta::before { content: ""; position: absolute; top: 0; bottom: 0; left: 78px; width: 2px; background: rgba(242,140,130,.55); }
  .libreta .espiral { position: absolute; top: -14px; left: 40px; right: 40px; display: flex; justify-content: space-between; }
  .libreta .espiral i { display: block; width: 14px; height: 30px; border-radius: 8px; background: linear-gradient(90deg,#8f8a96,#e9e6ec 50%,#8f8a96); }
  .apunte { position: absolute; left: 98px; font-family: "Caveat", cursive; font-weight: 600; color: #34406b; white-space: nowrap; }
  .apunte.fecha { color: #2b2a33; }
  .apunte-trazo { position: absolute; overflow: visible; }
  .chat { position: absolute; inset: 0; background: #efe9df; font-family: "Outfit", sans-serif; }
  .chat-enc { position: absolute; left: 0; right: 0; top: 0; height: 64px; background: #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; border-bottom: 1px solid #e6dfd4; }
  .chat-enc b { font-size: 22px; letter-spacing: -.01em; }
  .chat-contador { background: #f28c82; color: #fff; font-weight: 700; font-size: 17px; border-radius: 999px; padding: 3px 11px; min-width: 38px; text-align: center; }
  .chat-lista { position: absolute; left: 14px; right: 14px; top: 78px; }
  .globo { position: relative; background: #fff; border-radius: 16px 16px 16px 5px; padding: 9px 14px 11px; margin-bottom: 10px; box-shadow: 0 1px 1.5px rgba(43,42,51,.14); width: max-content; max-width: 92%; transform-origin: 0 100%; }
  .globo small { display: block; font-weight: 700; font-size: 14px; color: #4b3f72; margin-bottom: 1px; }
  .globo span { font-size: 19px; line-height: 1.2; }
`;

// `soloCaos`: solo la libreta y los chats (sin el monitor limpio ni el segundo título), con `titulo` propio.
export function gancho(c, { monitorFinal, fotoAgenda, soloCaos = false, titulo = null }) {
  const V = c.vertical;
  const { W } = c;
  // ── Libreta ──
  const lib = V ? { x: 90, y: 470, w: 600, h: 700, giro: -7 } : { x: 170, y: 250, w: 600, h: 700, giro: -7 };
  const tamLetra = 46;
  const apuntes = APUNTES.map((a, i) => {
    const top = 58 + 70 + i * 59 * 1.0 - 44 + (i === 0 ? 0 : 20);
    return `<div id="e1-ap${i}" class="apunte ${a.clase || ""}" style="top:${top}px;font-size:${a.clase ? 52 : tamLetra}px;clip-path:inset(0 100% 0 0)">${c.esc(a.texto)}</div>`;
  }).join("");
  // Tachón sobre "Toby hotel" y círculo a mano sobre "¿vacuna?"
  const y2 = 58 + 70 + 2 * 59 - 44 + 20 + 30, y3 = 58 + 70 + 3 * 59 - 44 + 20 + 28;
  const trazos = `<svg id="e1-trazos" class="apunte-trazo" style="left:0;top:0;width:${lib.w}px;height:${lib.h}px" viewBox="0 0 ${lib.w} ${lib.h}" fill="none" stroke="#b23c31" stroke-width="4" stroke-linecap="round">
      <path d="M92 ${y2} C180 ${y2 - 6} 300 ${y2 + 5} 470 ${y2 - 3}" />
      <path d="M230 ${y3 - 34} C330 ${y3 - 44} 395 ${y3 - 10} 380 ${y3 + 16} C360 ${y3 + 42} 230 ${y3 + 40} 222 ${y3 + 8} C216 ${y3 - 16} 270 ${y3 - 36} 320 ${y3 - 38}" />
    </svg>`;
  const libreta = `<div id="e1-libreta-p" style="position:absolute;left:${lib.x}px;top:${lib.y}px;width:${lib.w}px;height:${lib.h}px">
      <div id="e1-libreta" class="libreta" style="left:0;top:0;width:${lib.w}px;height:${lib.h}px">
        <div class="espiral">${"<i></i>".repeat(9)}</div>
        ${apuntes}${trazos}
      </div>
    </div>`;

  // ── Teléfono con chats (dibujado) ──
  const telW = V ? 400 : 360;
  const chatHtml = `<div class="chat">
      <div class="chat-enc"><b>Chats</b><span class="chat-contador" id="e1-contador">3</span></div>
      <div class="chat-lista" id="e1-lista">
        ${CHATS.map((m, i) => `<div class="globo" id="e1-g${i}"><small>${c.esc(m.quien)}</small><span>${c.esc(m.texto.replace(" 🙏", ""))}</span></div>`).join("")}
      </div>
    </div>`;
  const tel = c.dispositivo({
    id: "tel", tipo: "telefono", proporcion: 2.05, anchoApp: telW, fondoBarra: "#ffffff",
    x: V ? 600 : 1400, y: V ? 700 : 260, ancho: telW, contenido: chatHtml,
  });

  // ── Monitor limpio (el mismo cuadro con el que arranca la escena 2) ──
  const mon = soloCaos ? { html: "" } : c.dispositivo({ id: "mon", tipo: "monitor", toma: "estetica", ...monitorFinal, contenido: fotoAgenda });

  const titulo1 = c.titulo(V
    ? { id: "t1", texto: titulo ?? "Así empiezan|muchas mañanas.", x: 80, y: 230, ancho: 920, tam: 92 }
    : { id: "t1", texto: titulo ?? "Así empiezan muchas mañanas.", x: 0, y: 92, ancho: W, tam: 84, alinear: "center" });
  const titulo2 = soloCaos ? "" : c.titulo(V
    ? { id: "t2", texto: "Y así, con|*PeluDesk*.", x: 80, y: 230, ancho: 920, tam: 92 }
    : { id: "t2", texto: "Y así,|con *PeluDesk*.", x: 110, y: 380, ancho: 560, tam: 84 });
  const huellas = `<img id="e1-huellas" src="${c.ilustracion("huellitas")}" alt="" style="position:absolute;${V ? "left:720px;top:1500px;width:300px" : "left:1650px;top:780px;width:230px"};opacity:0" />`;

  const html = `
    <div class="pd-fondo"></div>
    ${huellas}
    <div class="pd-camara" id="e1-cam">${libreta}${tel.html}${mon.html}</div>
    ${titulo1}${titulo2}`;

  // Ritmo: llega la libreta, luego el teléfono; cuando se detienen, el
  // título; hasta después los apuntes y los chats. Hacia los 4 s todo se va al
  // fondo y sube el monitor limpio.
  // Con la escena más larga (7.3 s, por la frase nueva de la voz) el cambio al
  // monitor se recorre lo mismo: la libreta y los chats acompañan la lista.
  const T = 3.8 + Math.max(0, c.dur - 6.5);
  const js = `
    gsap.set("#e1-libreta", { rotation: ${lib.giro} });
    gsap.set("#e1-tel", { rotation: 6 });
    tl.fromTo("#e1-libreta", { x: -260, y: 380, rotation: -18 }, { x: 0, y: 0, rotation: ${lib.giro}, duration: 1.0, ease: R(0.1) }, 0);
    tl.fromTo("#e1-tel", { x: 300, y: 420, rotation: 16 }, { x: 0, y: 0, rotation: 6, duration: 1.0, ease: R(0.1) }, 0.15);
    PD.titulo(tl, "#e1-t1", 0.75);
    ${APUNTES.map((_, i) => `tl.to("#e1-ap${i}", { clipPath: "inset(0 0% 0 0)", duration: 0.34, ease: "power1.inOut" }, ${(1.0 + i * 0.3).toFixed(2)});`).join("\n    ")}
    PD.trazar(tl, "#e1-trazos", 2.55, { duracion: 0.45 });
    ${CHATS.map((_, i) => `tl.fromTo("#e1-g${i}", { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: R(0.18) }, ${(1.05 + i * 0.36).toFixed(2)});`).join("\n    ")}
    tl.fromTo("#e1-lista", { y: 0 }, { y: -170, duration: 1.4, ease: "power2.inOut" }, 2.3);
    PD.contar(tl, "#e1-contador", 3, 23, 1.1, { duracion: 2.4 });
    tl.fromTo("#e1-huellas", { opacity: 0, y: 20 }, { opacity: 0.22, y: 0, duration: 0.8, ease: PD.suave }, 1.4);

    ${soloCaos ? `tl.to(["#e1-libreta-p", "#e1-tel-p", "#e1-huellas"], { opacity: 0, duration: 0.45, ease: PD.salir }, ${c.dur - 0.5});
    PD.tituloFuera(tl, "#e1-t1", ${c.dur - 0.55});` : `
    // Todo al fondo: se desenfoca, se achica y se hace a un lado.
    PD.tituloFuera(tl, "#e1-t1", ${T});
    tl.fromTo("#e1-libreta-p", { filter: "blur(0px) saturate(1)" }, { immediateRender: false, x: ${V ? -40 : -60}, y: ${V ? -80 : 40}, scale: ${V ? 0.62 : 0.55}, filter: "blur(7px) saturate(0.4)", opacity: 0.55, duration: 0.8, ease: PD.suave }, ${T});
    tl.fromTo("#e1-tel-p", { filter: "blur(0px) saturate(1)" }, { immediateRender: false, x: ${V ? 60 : -80}, y: ${V ? -40 : 60}, scale: ${V ? 0.6 : 0.5}, filter: "blur(7px) saturate(0.4)", opacity: 0.55, duration: 0.8, ease: PD.suave }, ${T + 0.05});
    tl.to("#e1-huellas", { opacity: 0, duration: 0.4 }, ${T});
    tl.fromTo("#e1-mon-p", { opacity: 0 }, { opacity: 1, duration: 0.15 }, ${T + 0.2});
    PD.llegar(tl, "#e1-mon", ${T + 0.2}, { desdeY: ${V ? 1100 : 900}, duracion: 1.1 });
    PD.titulo(tl, "#e1-t2", ${T + 0.85});
    // Se van la libreta y los chats; el monitor se queda donde lo recoge la escena 2.
    tl.to(["#e1-libreta-p", "#e1-tel-p"], { opacity: 0, duration: 0.45, ease: PD.salir }, ${c.dur - 0.9});
    PD.tituloFuera(tl, "#e1-t2", ${c.dur - 0.55});`}
  `;
  return { html, js, css: CSS_GANCHO + `#e1-mon-p { opacity: 0; }` };
}
