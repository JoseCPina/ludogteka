"use client";

import { InputHTMLAttributes, forwardRef, useId, useState } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  ayuda?: string;
};

function IconoOjo({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.4 5.3A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a13.6 13.6 0 0 1-3.14 4.06M6.3 6.3A13.7 13.7 0 0 0 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.24-.88"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const Field = forwardRef<HTMLInputElement, Props>(
  ({ label, error, ayuda, id, className = "", type, ...props }, ref) => {
    const idGenerado = useId();
    const inputId = id ?? idGenerado;
    const descripcionId = error
      ? `${inputId}-error`
      : ayuda
        ? `${inputId}-ayuda`
        : undefined;
    const esPassword = type === "password";
    const [mostrar, setMostrar] = useState(false);

    return (
      <div>
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-n-800">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={esPassword ? (mostrar ? "text" : "password") : type}
            aria-invalid={error ? true : undefined}
            aria-describedby={descripcionId}
            className={`min-h-12 w-full rounded-md border-[1.5px] bg-white px-3.5 text-base text-n-900 focus:border-azul focus:outline-none focus:ring-[3px] focus:ring-azul-suave ${
              esPassword ? "pr-11" : ""
            } ${error ? "border-naranja-oscuro bg-naranja-suave" : "border-n-400"} ${className}`}
            {...props}
          />
          {esPassword && (
            <button
              type="button"
              onClick={() => setMostrar((v) => !v)}
              tabIndex={-1}
              aria-label={mostrar ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-n-500 hover:text-n-800"
            >
              <IconoOjo visible={mostrar} />
            </button>
          )}
        </div>
        {error && (
          <p id={descripcionId} className="mt-1.5 text-sm font-semibold text-naranja-oscuro">
            {error}
          </p>
        )}
        {!error && ayuda && (
          <p id={descripcionId} className="mt-1.5 text-sm text-n-600">
            {ayuda}
          </p>
        )}
      </div>
    );
  }
);
Field.displayName = "Field";
