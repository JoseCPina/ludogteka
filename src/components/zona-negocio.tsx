"use client";

import { createContext, useContext, type ReactNode } from "react";

// La zona horaria del negocio, para los componentes de cliente que
// convierten un instante en fecha u hora (src/lib/formato.ts). La pone el
// layout raíz con la del negocio del dominio; vale igual en el render del
// servidor y en el navegador, así que no hay desfase al hidratar.
const ZonaNegocio = createContext<string | null>(null);

export function ProveedorZonaNegocio({ zona, children }: { zona: string; children: ReactNode }) {
  return <ZonaNegocio.Provider value={zona}>{children}</ZonaNegocio.Provider>;
}

export function useZonaNegocio(): string {
  const zona = useContext(ZonaNegocio);
  // Sin proveedor no hay negocio (la plataforma): no hay fechas de negocio
  // que mostrar, y adivinar una zona sería repetir el bug de siempre.
  if (!zona) throw new Error("useZonaNegocio fuera de un negocio.");
  return zona;
}
