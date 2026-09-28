"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Las capturas del demo pasando solas en el encabezado de la landing, con
 * pestañas para escoger. Solo avanza mientras se ve (IntersectionObserver y
 * pestaña visible) y se detiene para siempre en cuanto alguien escoge una.
 * Con "reducir movimiento" no avanza sola ni hace fundido: queda la primera
 * y las pestañas siguen funcionando. Solo la primera captura carga de
 * entrada; las demás, cuando el navegador tenga tiempo (loading="lazy").
 */
export type CapturaMovimiento = { captura: string; etiqueta: string; alt: string };

const INTERVALO_MS = 4200;

export function CapturasEnMovimiento({ capturas }: { capturas: CapturaMovimiento[] }) {
  const [actual, setActual] = useState(0);
  const [detenido, setDetenido] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (detenido || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    let reloj: ReturnType<typeof setInterval> | undefined;
    const arrancar = () => {
      clearInterval(reloj);
      if (visible && document.visibilityState === "visible") {
        reloj = setInterval(() => setActual((i) => (i + 1) % capturas.length), INTERVALO_MS);
      }
    };
    const obs = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      arrancar();
    });
    if (caja.current) obs.observe(caja.current);
    document.addEventListener("visibilitychange", arrancar);
    return () => {
      obs.disconnect();
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", arrancar);
    };
  }, [detenido, capturas.length]);

  return (
    <div ref={caja}>
      <div className="pd-captura pd-marco relative aspect-[16/10] overflow-hidden rounded-[18px] border border-n-200 bg-white">
        {capturas.map((c, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={c.captura}
            src={`/peludesk/capturas/${c.captura}-escritorio-1600.webp`}
            srcSet={`/peludesk/capturas/${c.captura}-escritorio-800.webp 800w, /peludesk/capturas/${c.captura}-escritorio-1600.webp 1600w`}
            sizes="(min-width: 1024px) 680px, 100vw"
            width={1600}
            height={1000}
            alt={c.alt}
            aria-hidden={i !== actual}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : undefined}
            decoding="async"
            data-activa={i === actual}
            className="pd-diapositiva absolute inset-0 h-full w-full object-cover object-top"
          />
        ))}
      </div>
      <div role="group" aria-label="Pantallas del demo" className="mt-4 flex flex-wrap justify-center gap-2">
        {capturas.map((c, i) => (
          <button
            key={c.captura}
            type="button"
            aria-pressed={i === actual}
            onClick={() => {
              setDetenido(true);
              setActual(i);
            }}
            className="pd-pestana relative min-h-10 overflow-hidden rounded-full border border-n-200 bg-white px-4 text-sm font-semibold text-n-700 hover:border-morado/40 hover:text-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave aria-pressed:border-morado aria-pressed:bg-morado aria-pressed:text-white"
          >
            {c.etiqueta}
            {i === actual && !detenido && <span aria-hidden className="pd-progreso" key={`p-${actual}`} />}
          </button>
        ))}
      </div>
    </div>
  );
}
