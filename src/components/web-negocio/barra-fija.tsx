"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * La barra fija de abajo de la vista previa de un prospecto. Se esconde al bajar (para no tapar lo que se lee) y
 * vuelve al subir o al llegar al final. La página además reserva su espacio abajo (pb), así que nada queda tapado.
 */
export function BarraFija({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const [visible, setVisible] = useState(true);
  const ultimo = useRef(0);

  useEffect(() => {
    ultimo.current = window.scrollY;
    const mover = () => {
      const y = window.scrollY;
      const alFinal = window.innerHeight + y >= document.documentElement.scrollHeight - 8;
      if (alFinal || y < 80) setVisible(true);
      else if (y > ultimo.current + 6) setVisible(false);
      else if (y < ultimo.current - 6) setVisible(true);
      ultimo.current = y;
    };
    window.addEventListener("scroll", mover, { passive: true });
    return () => window.removeEventListener("scroll", mover);
  }, []);

  return (
    <div
      data-barra-activar
      data-visible={visible ? "si" : "no"}
      className={`${className ?? ""} transition-transform duration-200 motion-reduce:transition-none ${visible ? "translate-y-0" : "translate-y-full"}`}
      style={style}
    >
      {children}
    </div>
  );
}
