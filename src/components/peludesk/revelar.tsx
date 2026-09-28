"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Aparición al entrar en pantalla, una sola vez. `desde`:
 *   - "abajo": opacidad y 16px hacia arriba (texto y capturas);
 *   - "asomar": un perro que se asoma, sube desde abajo con un rebote corto.
 * Sin JavaScript, o con "reducir movimiento", el contenido está visible
 * desde el principio. Solo anima opacity y transform (no tumba el celular).
 */
export function Revelar({
  children,
  className = "",
  retraso = 0,
  desde = "abajo",
}: {
  children: ReactNode;
  className?: string;
  retraso?: number;
  desde?: "abajo" | "asomar";
}) {
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
      { rootMargin: "0px 0px -10% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      data-desde={desde}
      className={`pd-revelar ${className}`}
      style={retraso ? ({ "--pd-retraso": `${retraso}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
