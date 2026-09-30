"use client";

import { useEffect, useRef, useState } from "react";

/**
 * El botón de WhatsApp de peludesk.mx (el bot de ventas y soporte): solo un
 * enlace a wa.me, sin scripts de terceros.
 *
 *  · Círculo menta con el ícono en morado (contraste 5.9:1, AA), borde fino y
 *    sombra suave. Celular: 52 px. Escritorio: pastilla «¿Dudas? Escríbenos»
 *    que se contrae al ícono cuando la persona sigue bajando.
 *  · No sale en el primer pantallazo: aparece con una entrada suave cuando la
 *    persona ya bajó del inicio.
 *  · Nunca tapa nada: se sube sobre la barra «Pruébalo» y el aviso de cookies
 *    (elementos con data-fijo-inferior) y se esconde mientras estaría encima de
 *    una captura, un formulario, un botón o un enlace de llamada a la acción
 *    (.pd-captura, form, .pd-boton, [data-evita-whatsapp]).
 *  · «Reducir movimiento»: aparece y se contrae sin animación (peludesk.css).
 */
const OBSTACULOS = ".pd-captura, form, .pd-boton, [data-evita-whatsapp]";
const TAMANO = 52;

export function BotonWhatsApp({ href }: { href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);
  const [compacto, setCompacto] = useState(false);
  const [sube, setSube] = useState(0);
  const [reposo, setReposo] = useState(false);

  useEffect(() => {
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      const el = ref.current;
      if (!el) return;
      const alto = window.innerHeight;
      const y = window.scrollY;
      const pasoInicio = y > alto * 0.85;
      // Sobre lo fijo de abajo (barra «Pruébalo», aviso de cookies), con aire.
      const margen = window.innerWidth >= 768 ? 24 : 16;
      let subir = 0;
      for (const f of document.querySelectorAll<HTMLElement>("[data-fijo-inferior]")) {
        if (f.getAttribute("aria-hidden") === "true") continue;
        // Posición FINAL del bloque (las barras entran deslizándose: su rect a
        // media animación miente): pegado abajo, con su alto y su margen.
        if (f.offsetHeight === 0) continue;
        const pegado = parseFloat(getComputedStyle(f).bottom) || 0;
        // Solo si el bloque llega hasta el lado del botón.
        const r = f.getBoundingClientRect();
        if (r.right < window.innerWidth - margen - el.offsetWidth) continue;
        subir = Math.max(subir, pegado + f.offsetHeight + 12 - margen);
      }
      setSube(subir);
      // Dónde quedaría el botón: si cae sobre algo que no debe tapar, se esconde.
      const ancho = el.offsetWidth || TAMANO;
      const caja = { r: window.innerWidth - margen, l: window.innerWidth - margen - ancho, b: alto - margen - subir, t: alto - margen - subir - TAMANO };
      let encima = false;
      for (const o of document.querySelectorAll<HTMLElement>(OBSTACULOS)) {
        const r = o.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom < caja.t || r.top > caja.b) continue;
        if (r.right > caja.l && r.left < caja.r) {
          encima = true;
          break;
        }
      }
      setVisible(pasoInicio && !encima);
      setCompacto(y > alto * 0.85 + 360);
    };
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    document.addEventListener("transitionend", pedir, true);
    // El aviso de cookies aparece y desaparece sin que haya scroll.
    const obs = new MutationObserver(pedir);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-hidden", "data-visible"] });
    return () => {
      window.removeEventListener("scroll", pedir);
      window.removeEventListener("resize", pedir);
      document.removeEventListener("transitionend", pedir, true);
      obs.disconnect();
      if (cuadro) cancelAnimationFrame(cuadro);
    };
  }, []);

  // Una vez a la vista, la pastilla se contrae sola a los 6 s (en páginas cortas no hay scroll que lo haga).
  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setReposo(true), 6000);
    return () => window.clearTimeout(t);
  }, [visible]);

  return (
    <a
      ref={ref}
      href={href}
      target="_blank"
      rel="noopener"
      aria-label="Escríbenos por WhatsApp"
      data-visible={visible}
      data-compacto={compacto || reposo}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      style={{ ["--pd-wa-sube" as string]: `${sube}px` }}
      className="pd-wa fixed bottom-4 right-4 z-50 flex h-[52px] min-w-[52px] items-center justify-center gap-2 rounded-full border border-morado/25 bg-menta text-morado shadow-[0_6px_20px_rgb(75_63_114/0.18)] hover:bg-menta-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado md:bottom-6 md:right-6"
    >
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" fill="currentColor" className="shrink-0">
        <path d="M16.04 3C9.4 3 4 8.38 4 15.02c0 2.12.55 4.19 1.6 6.02L4 29l8.14-1.56a12 12 0 0 0 3.9.66C22.68 28.1 28 22.72 28 16.08S22.68 3 16.04 3Zm0 22.1c-1.24 0-2.45-.3-3.5-.87l-.5-.28-4.83.93.96-4.7-.3-.5a9.02 9.02 0 0 1-1.4-4.86c0-4.99 4.07-9.05 9.06-9.05a9.05 9.05 0 0 1 9.06 9.05 9.05 9.05 0 0 1-9.05 9.28Zm4.97-6.77c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.15-.42-2.19-1.35-.81-.72-1.35-1.61-1.51-1.88-.16-.27-.02-.42.12-.55.12-.12.27-.32.4-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.02-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.95.93-.95 2.27s.98 2.63 1.11 2.81c.14.18 1.92 2.94 4.66 4.12.65.28 1.16.45 1.56.58.65.21 1.25.18 1.72.11.52-.08 1.6-.65 1.83-1.29.23-.63.23-1.17.16-1.29-.07-.11-.25-.18-.52-.32Z" />
      </svg>
      <span className="pd-wa-texto hidden text-[15px] font-semibold md:inline">¿Dudas? Escríbenos</span>
    </a>
  );
}
