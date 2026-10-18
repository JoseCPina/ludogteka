"use client";

import type { ReactNode } from "react";

export const EVENTO_PEDIR = "web-negocio:pedir";

/**
 * Lleva al formulario de pedir cita con un servicio ya escogido (el formulario escucha el evento). Funciona igual
 * en la vista previa y en la página publicada.
 */
export function BotonPedir({ clave, children, className, style }: { clave?: string; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <a
      href="#pedir"
      data-boton-pedir={clave ?? ""}
      className={className}
      style={style}
      onClick={() => {
        if (clave) window.dispatchEvent(new CustomEvent(EVENTO_PEDIR, { detail: clave }));
      }}
    >
      {children}
    </a>
  );
}
