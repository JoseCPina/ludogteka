"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";

// Dónde empieza cada reseña dentro del recorrido de la lista.
const posicion = (ul: HTMLElement, li: HTMLElement) => li.getBoundingClientRect().left - ul.getBoundingClientRect().left + ul.scrollLeft;

/**
 * Las reseñas en el celular: se deslizan de lado, con flechas y un punto por reseña que dice en cuál vas. En
 * escritorio son una cuadrícula de tres y las flechas y los puntos no salen.
 */
export function CarruselResenas({ children }: { children: ReactNode }) {
  const lista = useRef<HTMLUListElement>(null);
  const total = Children.count(children);
  const [actual, setActual] = useState(0);

  useEffect(() => {
    const ul = lista.current;
    if (!ul) return;
    const medir = () => {
      const items = Array.from(ul.children) as HTMLElement[];
      if (!items.length) return;
      const izq = ul.scrollLeft + 20;
      let mejor = 0;
      items.forEach((li, i) => {
        if (Math.abs(posicion(ul, li) - izq) < Math.abs(posicion(ul, items[mejor]) - izq)) mejor = i;
      });
      // Al final del recorrido cuenta la última, aunque no quepa alineada a la izquierda.
      if (ul.scrollLeft + ul.clientWidth >= ul.scrollWidth - 4) mejor = items.length - 1;
      setActual(mejor);
    };
    ul.addEventListener("scroll", medir, { passive: true });
    return () => ul.removeEventListener("scroll", medir);
  }, []);

  const ir = (i: number) => {
    const ul = lista.current;
    const li = ul?.children[Math.max(0, Math.min(total - 1, i))] as HTMLElement | undefined;
    if (!ul || !li) return;
    ul.scrollTo({ left: posicion(ul, li) - 20, behavior: "smooth" });
  };

  return (
    <div data-carrusel-resenas>
      <ul ref={lista} className="-mx-5 mt-6 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
        {children}
      </ul>
      {total > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 sm:hidden">
          <button type="button" aria-label="Reseña anterior" disabled={actual === 0} onClick={() => ir(actual - 1)} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-black/10 disabled:opacity-35" data-resena-anterior>
            <CaretLeft size={18} weight="bold" aria-hidden />
          </button>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Reseñas">
            {Array.from({ length: total }, (_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === actual}
                aria-label={`Reseña ${i + 1} de ${total}`}
                onClick={() => ir(i)}
                className="flex h-6 w-6 items-center justify-center"
                data-punto-resena={i}
              >
                <span className={`block rounded-full transition-all ${i === actual ? "h-2.5 w-5 bg-[var(--w-acento)]" : "h-2.5 w-2.5 bg-black/25"}`} aria-hidden />
              </button>
            ))}
          </div>
          <button type="button" aria-label="Reseña siguiente" disabled={actual === total - 1} onClick={() => ir(actual + 1)} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-black/10 disabled:opacity-35" data-resena-siguiente>
            <CaretRight size={18} weight="bold" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
