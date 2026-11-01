"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Spinner } from "./spinner";
import { useLento } from "./button";

/**
 * UX (1 de noviembre de 2026): un control que se prende y se apaga, o que elige una opción: una foto que se marca para
 * mandar, una opción de un selector de botones (día, plan, periodicidad, con qué cobras), una sugerencia de una lista,
 * una sección que se despliega. Es un `<button>` con cursor, foco visible y 44 px; la forma de la opción la pone quien
 * lo usa con `className`, y el estado va en `aria-pressed` (`activo`), `aria-checked` (con `role="radio"`) o
 * `aria-expanded`. Si elegir GUARDA en el servidor, `cargando` lo deja ocupado (deshabilitado, `aria-busy` y su giro)
 * mientras espera, como un `<Button>`. Lo que ejecuta una acción es `<Button>`; lo que navega, `<Enlace>`.
 */
export const Alternar = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { activo?: boolean; cargando?: boolean }>(
  ({ activo, cargando, className = "", type = "button", disabled, children, ...props }, ref) => {
    const lento = useLento(cargando);
    return (
    <button
      ref={ref}
      type={type}
      data-ui="alternar"
      data-tope={cargando !== undefined ? "" : undefined}
      aria-pressed={props.role === undefined && props["aria-expanded"] === undefined && activo !== undefined ? activo : undefined}
      aria-busy={cargando || undefined}
      disabled={disabled || cargando}
      className={`min-h-11 min-w-11 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-progress ${className}`}
      {...props}
    >
      {children}
      {cargando && <Spinner className="ml-1.5 inline-block align-middle" />}
      {cargando && lento && <span data-sigue-trabajando="" className="ml-1.5 text-sm font-semibold">Sigue trabajando…</span>}
    </button>
    );
  }
);
Alternar.displayName = "Alternar";
