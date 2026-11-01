"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { Enlace } from "./enlace";

// QA S18 (N91): un enlace que lleva a una pantalla que tarda (el check-in) dice qué está abriendo mientras carga: sin
// eso, el primer clic «no hacía nada» por un segundo y se volvía a apretar. UX (1 de noviembre de 2026): el giro, el
// atenuado y el freno al doble toque ya los pone todo `<Enlace>`; aquí solo se cambia el texto.
function Texto({ children, textoCargando }: { children: ReactNode; textoCargando?: string }) {
  const { pending } = useLinkStatus();
  return <span data-cargando={pending ? "si" : "no"}>{pending && textoCargando ? textoCargando : children}</span>;
}

export function EnlaceConEspera({ href, className, children, textoCargando }: { href: string; className?: string; children: ReactNode; textoCargando?: string }) {
  return (
    <Enlace href={href} className={className}>
      <Texto textoCargando={textoCargando}>{children}</Texto>
    </Enlace>
  );
}
