"use client";

import { useState, type ReactNode } from "react";
import { CierreDesplegable } from "@/components/formulario-accion";

// Sección que se abre con un botón de verdad (rol button, aria-expanded), no con <summary>.
export function Desplegable({
  titulo,
  children,
  className = "",
  atributos,
  cerrarAlGuardar = false,
}: {
  titulo: string;
  children: ReactNode;
  className?: string;
  atributos?: Record<string, string>;
  /** Al guardar el formulario de adentro (FormularioAccion con `reiniciar`) se cierra y deja el aviso (QA S15). */
  cerrarAlGuardar?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <div className={className} {...atributos}>
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => { setAviso(null); setAbierto((a) => !a); }}
        className="text-sm font-semibold text-morado"
      >
        {titulo}
      </button>
      {!abierto && aviso && <p role="status" data-desplegable-aviso className="mt-1 text-sm font-semibold text-menta-oscuro">{aviso}</p>}
      {abierto && (
        <div className="mt-2">
          {cerrarAlGuardar ? (
            <CierreDesplegable.Provider value={(m) => { setAviso(m); setAbierto(false); }}>{children}</CierreDesplegable.Provider>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
