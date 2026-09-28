"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * El menú de la landing en el celular: botón que abre un panel con las
 * secciones, los dos botones y las redes. Se cierra con Escape, al tocar un
 * enlace o al tocar fuera. En pantallas grandes no se pinta (md:hidden).
 */
export function MenuCelular({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !boton.current?.contains(t)) setAbierto(false);
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("pointerdown", fuera);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [abierto]);

  return (
    <div className="md:hidden">
      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
        onClick={() => setAbierto((a) => !a)}
        className="flex h-11 w-11 items-center justify-center rounded-md text-n-900 hover:bg-n-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {abierto ? (
            <path d="M6 6l12 12M18 6 6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>
      <div
        ref={panel}
        id={id}
        hidden={!abierto}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setAbierto(false);
        }}
        className="pd-menu absolute inset-x-0 top-full border-b border-n-200 bg-crema px-4 pb-6 pt-2 shadow-[0_16px_32px_-16px_rgb(75_63_114/0.25)]"
      >
        {children}
      </div>
    </div>
  );
}
