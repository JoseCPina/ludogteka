"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// Un bloque con «Ocultar» que se acuerda en este navegador. Sin
// localStorage (ventana privada) simplemente se vuelve a mostrar.
const suscriptores = new Set<() => void>();
const suscribir = (cb: () => void) => {
  suscriptores.add(cb);
  return () => suscriptores.delete(cb);
};

function leer(clave: string): boolean {
  try {
    return localStorage.getItem(`pd-${clave}`) === "1";
  } catch {
    return false;
  }
}

export function OcultableLocal({ clave, children }: { clave: string; children: ReactNode }) {
  const oculto = useSyncExternalStore(suscribir, () => leer(clave), () => false);
  if (oculto) return null;
  return (
    <div className="flex flex-col gap-1">
      {children}
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(`pd-${clave}`, "1");
          } catch {
            /* sin almacenamiento */
          }
          suscriptores.forEach((cb) => cb());
        }}
        className="self-end text-xs font-semibold text-n-500 hover:text-n-700"
      >
        Ocultar
      </button>
    </div>
  );
}
