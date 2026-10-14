"use client";

import { useRef, type ReactNode } from "react";
import { useSecuencia, useVisible } from "../usar";

/** Marco común de las demos: arranca al verse, se repite mientras siga visible. */
export function Pantalla({
  tiempos,
  retencion = 4500,
  altura = "h-[300px]",
  etiqueta,
  children,
  nota = true,
}: {
  tiempos: readonly number[];
  retencion?: number;
  altura?: string;
  etiqueta: string;
  children: (s: { paso: number; ciclo: number }) => ReactNode;
  nota?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useVisible(ref, 0.35);
  const { paso, ciclo, saliendo } = useSecuencia(tiempos, visible, retencion, 450);
  return (
    <div ref={ref} role="img" aria-label={etiqueta} className={`relative overflow-hidden rounded-2xl border border-n-200 bg-crema ${altura} ${saliendo ? "pd-sale" : ""}`}>
      <div aria-hidden="true" className="pointer-events-none h-full select-none p-3 sm:p-4">
        {children({ paso, ciclo })}
      </div>
      {nota && (
        <p aria-hidden="true" className="absolute bottom-1.5 right-3 text-[10px] text-n-600">
          Datos de ejemplo
        </p>
      )}
    </div>
  );
}
