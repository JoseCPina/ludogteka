"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { PARAMETROS_ORIGEN } from "@/lib/peludesk/origen";

/**
 * Link a /registro que se lleva de qué campaña venía la persona (utm_* y
 * fbclid de la dirección en la que está), sin guardar nada en el navegador:
 * la etiqueta viaja en el propio link y el registro la anota (ver
 * src/lib/peludesk/origen.ts).
 */
export function EnlaceRegistro({ className, children, ariaLabel }: { className?: string; children: ReactNode; ariaLabel?: string }) {
  const params = useSearchParams();
  const q = new URLSearchParams();
  for (const k of PARAMETROS_ORIGEN) {
    const v = params.get(k);
    if (v) q.set(k, v.slice(0, 300));
  }
  const cola = q.toString();
  return (
    <Link href={cola ? `/registro?${cola}` : "/registro"} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
