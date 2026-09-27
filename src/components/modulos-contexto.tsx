"use client";

import { createContext, useContext, type ReactNode } from "react";

// Los módulos activos del negocio, para los componentes de cliente que
// esconden lo que el negocio no tiene (la base lo bloquea de todos modos).
// Lo provee el layout del staff con lo que dice modulos_activos().
const ContextoModulos = createContext<readonly string[] | null>(null);

export function ProveedorModulos({ modulos, children }: { modulos: readonly string[]; children: ReactNode }) {
  return <ContextoModulos.Provider value={modulos}>{children}</ContextoModulos.Provider>;
}

/** Sin proveedor (fuera del staff) no esconde nada. */
export function useModulos(): { tiene: (m: string) => boolean } {
  const modulos = useContext(ContextoModulos);
  return { tiene: (m) => (modulos ? modulos.includes(m) : true) };
}
