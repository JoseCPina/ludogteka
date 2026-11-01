"use client";

import { createContext, useContext, type ReactNode } from "react";
import { puedeAbrir, type Acceso } from "@/lib/auth/acceso";
import { Enlace } from "@/components/ui/enlace";

// QA N127: quién es la persona en este negocio (rol, permisos, módulos, Veterinaria), para que un componente de
// cliente esconda todo enlace o botón que lleve a una página que no puede abrir. Es la misma función con la que el
// middleware decide (src/lib/auth/acceso.ts). Lo provee el layout del personal.
const ContextoAcceso = createContext<Acceso | null>(null);

export function ProveedorAcceso({ acceso, children }: { acceso: Acceso; children: ReactNode }) {
  return <ContextoAcceso.Provider value={acceso}>{children}</ContextoAcceso.Provider>;
}

/** `puede(href)`: ¿esta persona abre esa página? Sin proveedor (fuera del personal: portal, público) no esconde nada. */
export function usePuedeAbrir(): (href: string) => boolean {
  const acceso = useContext(ContextoAcceso);
  return (href) => (acceso ? puedeAbrir(acceso, href) : true);
}

/** Muestra lo de adentro solo si la persona puede abrir `href` (sirve también desde una página de servidor). */
export function SiPuedeAbrir({ href, children, sino = null }: { href: string; children: ReactNode; sino?: ReactNode }) {
  return <>{usePuedeAbrir()(href) ? children : sino}</>;
}

/**
 * Un enlace dentro de una frase («captúralo en Servicios»): si la persona no puede abrir la página, queda el texto
 * sin enlace, para que la frase se siga leyendo.
 */
export function EnlaceOTexto({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return usePuedeAbrir()(href) ? (
    <Enlace href={href} className={className} enTexto>
      {children}
    </Enlace>
  ) : (
    <span>{children}</span>
  );
}
