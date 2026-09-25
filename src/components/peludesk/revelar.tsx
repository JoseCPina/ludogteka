"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Aparición al entrar en pantalla, una sola vez: opacidad y 12px hacia
 * arriba, 500 ms ease-out. Es la única animación de la landing: marca el
 * ritmo de lectura de cada sección, nada más. Sin JavaScript, o con
 * "reducir movimiento", el contenido está visible desde el principio.
 */
export function Revelar({ children, className = "", retraso = 0 }: { children: ReactNode; className?: string; retraso?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const caja = el.getBoundingClientRect();
    if (caja.top < window.innerHeight * 0.9) return; // ya se ve al cargar: no se esconde
    el.dataset.revelar = "oculto";
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        el.dataset.revelar = "visto";
        obs.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`pd-revelar ${className}`} style={retraso ? ({ "--pd-retraso": `${retraso}ms` } as React.CSSProperties) : undefined}>
      {children}
    </div>
  );
}
