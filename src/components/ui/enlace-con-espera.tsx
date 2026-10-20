"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { Spinner } from "./spinner";

// QA S18 (N91): un enlace que lleva a una pantalla que tarda (el check-in) muestra el spinner y se apaga mientras
// carga: sin eso, el primer clic «no hacía nada» por un segundo y se volvía a apretar.
function Contenido({ children, textoCargando }: { children: ReactNode; textoCargando?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className={`inline-flex items-center gap-1.5 ${pending ? "pointer-events-none opacity-70" : ""}`} aria-busy={pending} data-cargando={pending ? "si" : "no"}>
      {pending && <Spinner />}
      {pending && textoCargando ? textoCargando : children}
    </span>
  );
}

export function EnlaceConEspera({ href, className, children, textoCargando }: { href: string; className?: string; children: ReactNode; textoCargando?: string }) {
  return (
    <Link href={href} className={className}>
      <Contenido textoCargando={textoCargando}>{children}</Contenido>
    </Link>
  );
}
