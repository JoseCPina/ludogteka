// Lo que se dibuja ENCIMA de la app mientras se graba (dentro de la página):
// resaltado de un elemento, zoom de cámara, la etiqueta del paso y las
// tarjetas de título, resumen y «Siguiente». Todo con transiciones CSS (la
// grabación es el screencast de Chromium: lo que se ve es lo que queda).
//
// El zoom es una transformación de <html>: el mouse real de Playwright usa
// coordenadas sin transformar, así que NUNCA se hace clic con zoom puesto
// (el grabador siempre aleja antes de actuar).
export const CSS_HUD = `
  html{transform-origin:0 0}
  #pd-resalte{position:fixed;z-index:2147483640;pointer-events:none;border-radius:12px;border:4px solid #f5b85c;
    box-shadow:0 0 0 9999px rgba(30,24,52,.52),0 0 0 8px rgba(245,184,92,.35);opacity:0;transition:opacity .25s ease}
  #pd-resalte.ver{opacity:1}
  #pd-etiqueta{position:fixed;z-index:2147483645;left:50%;top:18px;transform:translate(-50%,-90px);pointer-events:none;
    background:#4b3f72;color:#fff;font:600 24px/1.2 Outfit,system-ui,sans-serif;padding:12px 28px;border-radius:999px;
    box-shadow:0 8px 24px rgba(30,24,52,.35);transition:transform .45s cubic-bezier(.2,.9,.3,1.15);white-space:nowrap}
  #pd-etiqueta.ver{transform:translate(-50%,0)}
  #pd-etiqueta b{color:#f5b85c;margin-right:10px}
  #pd-tarjeta{position:fixed;inset:0;z-index:2147483647;background:linear-gradient(135deg,#4b3f72 0%,#2b2447 100%);color:#fff;
    display:flex;flex-direction:column;justify-content:center;padding:0 140px;opacity:0;pointer-events:none;transition:opacity .5s ease;font-family:Outfit,system-ui,sans-serif}
  #pd-tarjeta.ver{opacity:1}
  #pd-tarjeta .marca{display:flex;align-items:center;gap:18px;font-size:34px;font-weight:700;letter-spacing:.2px;margin-bottom:56px;color:#a7d8c8}
  #pd-tarjeta .marca img{width:64px;height:64px;border-radius:16px}
  #pd-tarjeta .area{display:inline-block;align-self:flex-start;background:rgba(167,216,200,.16);color:#a7d8c8;font-size:28px;font-weight:600;padding:8px 22px;border-radius:999px;margin-bottom:28px}
  #pd-tarjeta h1{font-size:84px;line-height:1.08;font-weight:700;margin:0;max-width:1500px;text-wrap:balance}
  #pd-tarjeta h2{font-size:60px;line-height:1.1;font-weight:700;margin:0 0 40px;color:#f5b85c}
  #pd-tarjeta p.sub{font-size:36px;line-height:1.35;color:#d9d3ec;margin:30px 0 0;max-width:1400px}
  #pd-tarjeta ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:26px}
  #pd-tarjeta li{font-size:46px;line-height:1.25;display:flex;gap:22px;align-items:flex-start;max-width:1500px;opacity:0;transform:translateY(18px);transition:opacity .5s ease,transform .5s ease}
  #pd-tarjeta li.ver{opacity:1;transform:none}
  #pd-tarjeta li::before{content:"✓";flex:none;display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:#a7d8c8;color:#4b3f72;font-size:32px;font-weight:700;margin-top:2px}
  #pd-tarjeta .sig{font-size:30px;color:#a7d8c8;margin-bottom:18px}
`;

export function scriptHud(logoUrl) {
  return `(() => {
    const LOGO = ${JSON.stringify(logoUrl)};
    const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
    function el(id, tag = "div") {
      let e = document.getElementById(id);
      if (!e && document.body) { e = document.createElement(tag); e.id = id; document.body.appendChild(e); }
      return e;
    }
    function iniciar() {
      if (document.getElementById("pd-hud-css")) return;
      const s = document.createElement("style"); s.id = "pd-hud-css"; s.textContent = ${JSON.stringify(CSS_HUD)}; document.head.appendChild(s);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

    const hud = {
      resaltar(caja, pad = 10) {
        const r = el("pd-resalte");
        r.style.left = caja.x - pad + "px"; r.style.top = caja.y - pad + "px";
        r.style.width = caja.w + pad * 2 + "px"; r.style.height = caja.h + pad * 2 + "px";
        void r.offsetWidth; r.classList.add("ver");
      },
      quitarResalte() { document.getElementById("pd-resalte")?.classList.remove("ver"); },
      etiqueta(n, texto) {
        const e = el("pd-etiqueta");
        e.innerHTML = "<b>" + n + "</b>" + texto;
        void e.offsetWidth; e.classList.add("ver");
      },
      quitarEtiqueta() { document.getElementById("pd-etiqueta")?.classList.remove("ver"); },
      // Cámara: acerca hacia el centro de la caja (en px de la pantalla) con factor f.
      zoom(caja, f, ms = 750) {
        const W = innerWidth, H = innerHeight, h = document.documentElement;
        const ox = caja.x + caja.w / 2, oy = caja.y + caja.h / 2;
        let tx = W / 2 - ox, ty = H / 2 - oy;
        // Sin franjas vacías: el contenido ampliado tiene que cubrir la pantalla.
        const izq = ox - f * ox + tx, der = ox + f * (W - ox) + tx;
        if (izq > 0) tx -= izq; if (der < W) tx += W - der;
        const arr = oy - f * oy + ty, aba = oy + f * (H - oy) + ty;
        if (arr > 0) ty -= arr; if (aba < H) ty += H - aba;
        h.style.transformOrigin = ox + "px " + oy + "px";
        h.style.transition = "transform " + ms + "ms cubic-bezier(.4,0,.2,1)";
        h.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + f + ")";
      },
      alejar(ms = 650) {
        const h = document.documentElement;
        h.style.transition = "transform " + ms + "ms cubic-bezier(.4,0,.2,1)";
        h.style.transform = "none";
      },
      tarjeta(html) {
        const t = el("pd-tarjeta");
        t.innerHTML = html;
        t.querySelectorAll(".marca img").forEach((i) => (i.src = LOGO));
        void t.offsetWidth; t.classList.add("ver");
      },
      async puntos() {
        const lis = [...document.querySelectorAll("#pd-tarjeta li")];
        for (const li of lis) { li.classList.add("ver"); await esperar(650); }
      },
      quitarTarjeta() { document.getElementById("pd-tarjeta")?.classList.remove("ver"); },
    };
    window.__tut = hud;
  })();`;
}

export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export const tarjetaTitulo = ({ numero, area, titulo, subtitulo }) =>
  `<div class="marca"><img alt="">PeluDesk · Tutoriales</div><span class="area">${esc(area)} · Video ${esc(numero)}</span><h1>${esc(titulo)}</h1>${subtitulo ? `<p class="sub">${esc(subtitulo)}</p>` : ""}`;

export const tarjetaResumen = ({ puntos }) =>
  `<div class="marca"><img alt="">PeluDesk · Tutoriales</div><h2>En resumen</h2><ul>${puntos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;

export const tarjetaSiguiente = ({ siguiente, ultimo }) =>
  ultimo
    ? `<div class="marca"><img alt="">PeluDesk · Tutoriales</div><h1>Eso es todo por ahora</h1><p class="sub">Más videos y artículos en Ayuda. Pruébalo 15 días gratis en peludesk.mx</p>`
    : `<div class="marca"><img alt="">PeluDesk · Tutoriales</div><p class="sig">Siguiente video</p><h1>${esc(siguiente)}</h1>`;
