"use client";

import { useEffect, useRef, useState } from "react";
import { List, X } from "@phosphor-icons/react/dist/ssr";

/**
 * El menú de la página web en el celular: un botón de hamburguesa que abre los enlaces a las secciones. Se cierra
 * al escoger uno, con Escape o al tocar fuera. En escritorio los enlaces van en el encabezado y esto no se ve.
 */
export function MenuMovil({ enlaces, oscuro }: { enlaces: { href: string; texto: string }[]; oscuro?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    const fuera = (e: PointerEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    window.addEventListener("keydown", tecla);
    window.addEventListener("pointerdown", fuera);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("pointerdown", fuera);
    };
  }, [abierto]);

  if (!enlaces.length) return null;
  return (
    <div ref={caja} className="relative md:hidden" data-menu-movil>
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls="menu-pagina-web"
        aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
        onClick={() => setAbierto((a) => !a)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md"
        data-boton-menu
      >
        {abierto ? <X size={22} weight="bold" aria-hidden /> : <List size={22} weight="bold" aria-hidden />}
      </button>
      {abierto && (
        <nav
          id="menu-pagina-web"
          aria-label="Secciones"
          className={`absolute right-0 top-12 z-40 flex min-w-48 flex-col rounded-[var(--w-radio-chico)] p-1.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,.45)] ring-1 ${oscuro ? "bg-[var(--w-profundo)] text-white ring-white/15" : "bg-white text-[var(--w-tinta)] ring-black/10"}`}
        >
          {enlaces.map((e) => (
            <a key={e.href} href={e.href} onClick={() => setAbierto(false)} className="flex min-h-11 items-center rounded-md px-3 text-[15px] font-semibold hover:bg-black/5" data-enlace-menu={e.href}>
              {e.texto}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
