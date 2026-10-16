"use client";

import { useState, type ReactNode } from "react";

// Sección que se abre con un botón de verdad (rol button, aria-expanded), no con <summary>.
export function Desplegable({
  titulo,
  children,
  className = "",
  atributos,
}: {
  titulo: string;
  children: ReactNode;
  className?: string;
  atributos?: Record<string, string>;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className={className} {...atributos}>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="text-sm font-semibold text-morado"
      >
        {titulo}
      </button>
      {abierto && <div className="mt-2">{children}</div>}
    </div>
  );
}
