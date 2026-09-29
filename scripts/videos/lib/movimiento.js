// Movimiento de los videos de PeluDesk (corre en la composición, con GSAP).
// Todo es función del tiempo: nada de relojes ni azar, para que HyperFrames
// pueda buscar cualquier cuadro y salga igual.
//
// Regla de la casa: nada arranca ni frena en seco. Lo que llega, llega con
// resorte (velocidad inicial cero y un rebote suave al final); lo que se va,
// acelera al salir.
(function () {
  // Resorte amortiguado normalizado a duración 1: sale en 0 con velocidad 0 y
  // se asienta en 1. `rebote` es cuánto se pasa (0.1 = 10 %).
  function resorte(rebote) {
    rebote = rebote == null ? 0.12 : rebote;
    if (rebote <= 0.001) {
      const w = 9.2;
      return (t) => (t >= 1 ? 1 : 1 - Math.exp(-w * t) * (1 + w * t));
    }
    const ln = Math.log(rebote);
    const z = -ln / Math.sqrt(Math.PI * Math.PI + ln * ln);
    const w = 6.4 / z;
    const wd = w * Math.sqrt(1 - z * z);
    const f = (t) => 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
    const fin = f(1);
    // Corrige el residuo para que termine exactamente en 1.
    return (t) => (t >= 1 ? 1 : t <= 0 ? 0 : f(t) + (1 - fin) * t * t * t);
  }

  const salir = "power2.in";
  const suave = "power3.inOut";

  // Palabras que suben una por una (el HTML ya viene partido en .pd-palabra).
  function titulo(tl, sel, t, o) {
    o = o || {};
    const palabras = document.querySelectorAll(sel + " .pd-palabra");
    tl.fromTo(
      palabras,
      { y: o.y == null ? 70 : o.y, opacity: 0, rotation: o.giro == null ? 2 : o.giro },
      { y: 0, opacity: 1, rotation: 0, duration: o.duracion || 0.9, ease: resorte(o.rebote == null ? 0.1 : o.rebote), stagger: o.escalon == null ? 0.06 : o.escalon },
      t
    );
    return tl;
  }
  function tituloFuera(tl, sel, t, o) {
    o = o || {};
    const palabras = document.querySelectorAll(sel + " .pd-palabra");
    tl.to(palabras, { y: o.y == null ? -40 : o.y, opacity: 0, duration: 0.35, ease: salir, stagger: 0.025 }, t);
    return tl;
  }

  // Llega un dispositivo: desde abajo, un poco inclinado hacia atrás, y se
  // asienta con resorte. La sombra acompaña (lo lleva el propio nodo).
  function llegar(tl, sel, t, o) {
    o = o || {};
    tl.fromTo(
      sel,
      { x: o.x || 0, y: o.desdeY == null ? 700 : o.desdeY, rotationX: o.inclina == null ? 14 : o.inclina, rotationY: o.giroY || 0, scale: o.escala || 0.94, opacity: 1, transformPerspective: 2400 },
      { x: 0, y: 0, rotationX: 0, rotationY: 0, scale: 1, opacity: 1, duration: o.duracion || 1.15, ease: resorte(o.rebote == null ? 0.1 : o.rebote) },
      t
    );
    return tl;
  }
  function irse(tl, sel, t, o) {
    o = o || {};
    tl.fromTo(sel, { filter: "blur(0px)" }, { y: o.y == null ? -120 : o.y, x: o.x || 0, scale: o.escala || 0.9, opacity: 0, filter: "blur(10px)", duration: o.duracion || 0.5, ease: salir, immediateRender: false }, t);
    return tl;
  }

  // Cámara: transforma la capa .pd-camara (origen 0,0). `v` ya viene
  // calculado desde node ({x, y, scale}) para centrar un punto de la escena.
  function camara(tl, sel, v, t, o) {
    o = o || {};
    tl.to(sel, { x: v.x, y: v.y, scale: v.scale, duration: o.duracion || 1.1, ease: o.ease || resorte(o.rebote == null ? 0.04 : o.rebote) }, t);
    return tl;
  }

  // Profundidad: lo de atrás se desenfoca, se achica y se oscurece un poco.
  function alFondo(tl, sel, t, o) {
    o = o || {};
    // Siempre desde un filtro explícito: interpolar desde "none" pasa por brightness(0) (negro).
    tl.fromTo(sel, { filter: "blur(0px) brightness(1)" }, { filter: "blur(" + (o.blur == null ? 6 : o.blur) + "px) brightness(0.96)", scale: o.escala || 0.94, duration: o.duracion || 0.7, ease: suave, immediateRender: false }, t);
    return tl;
  }
  function alFrente(tl, sel, t, o) {
    o = o || {};
    tl.fromTo(sel, { filter: "blur(" + (o.blur == null ? 6 : o.blur) + "px) brightness(0.96)" }, { filter: "blur(0px) brightness(1)", scale: 1, duration: o.duracion || 0.7, ease: suave, immediateRender: false }, t);
    return tl;
  }

  // Un recorte de la pantalla "se sale" del marco: aparece exacto encima de
  // su lugar, se despega (escala + sombra) y viaja a su destino con resorte.
  function salirDePantalla(tl, sel, t, destino, o) {
    o = o || {};
    tl.fromTo(sel, { opacity: 0, x: 0, y: 0, scale: 1 }, { opacity: 1, duration: 0.12, ease: "none" }, t);
    tl.fromTo(sel + " .pd-sombra-flotante", { boxShadow: "0 0 0 rgba(43,42,51,0)" }, { boxShadow: "0 2px 4px rgba(43,42,51,0.12), 0 30px 60px -12px rgba(43,42,51,0.4), 0 70px 110px -40px rgba(43,42,51,0.3)", duration: 0.5, ease: suave }, t + 0.1);
    tl.to(sel, { x: destino.x, y: destino.y, scale: destino.scale, rotation: destino.rotation || 0, duration: o.duracion || 1.05, ease: resorte(o.rebote == null ? 0.14 : o.rebote) }, t + 0.12);
    return tl;
  }

  // Trazo que se dibuja (flechas, subrayados, círculos a mano).
  function trazar(tl, sel, t, o) {
    o = o || {};
    document.querySelectorAll(sel + " path").forEach((p) => {
      const L = p.getTotalLength();
      p.style.strokeDasharray = L + " " + L;
      tl.fromTo(p, { strokeDashoffset: L }, { strokeDashoffset: 0, duration: o.duracion || 0.55, ease: "power2.inOut" }, t);
    });
    return tl;
  }

  // Número que cuenta hasta su valor. Se tweenea innerText con snap (sin
  // onUpdate: al buscar un cuadro, GSAP no dispara callbacks).
  function contar(tl, sel, desde, hasta, t, o) {
    o = o || {};
    tl.fromTo(sel, { innerText: desde }, { innerText: hasta, snap: { innerText: 1 }, duration: o.duracion || 0.9, ease: "power2.out" }, t);
    return tl;
  }

  window.PD = { resorte, salir, suave, titulo, tituloFuera, llegar, irse, camara, alFondo, alFrente, salirDePantalla, trazar, contar };
})();
