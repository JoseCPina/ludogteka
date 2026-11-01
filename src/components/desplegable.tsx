"use client";

import { useState, type ReactNode } from "react";
import { CierreDesplegable } from "@/components/formulario-accion";
import { Alternar } from "@/components/ui/alternar";

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
      <Alternar type="button" aria-expanded={abierto} onClick={() => { setAviso(null); setAbierto((a) => !a); }} className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-morado hover:text-morado-oscuro">
        <span aria-hidden="true" className="text-xs">{abierto ? "▾" : "▸"}</span>
        {titulo}
      </Alternar>
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
