"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { terminarTodas, useNavegacionActiva } from "@/lib/ui/navegacion-pendiente";

/** Tope de seguridad: si algo raro deja una navegación abierta, la barra se apaga sola. */
const TOPE_MS = 20_000;

// Al cambiar la ruta (o la búsqueda) la navegación llegó: se cierran todas.
function AlLlegar() {
  const ruta = usePathname();
  const busqueda = useSearchParams();
  const clave = `${ruta}?${busqueda?.toString() ?? ""}`;
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    terminarTodas();
  }, [clave]);
  return null;
}

/**
 * UX (1 de noviembre de 2026): la barra delgada de arriba mientras una navegación del panel está en curso
 * (src/lib/ui/navegacion-pendiente.ts). `data-activa="si"` desde el primer instante (lo lee la auditoría); se VE solo si
 * la navegación pasa de 150 ms (la hoja de estilos la retrasa), para que lo que carga al momento no parpadee. Con
 * movimiento reducido no avanza: queda una franja fija.
 */
export function BarraNavegacion() {
  const activa = useNavegacionActiva();
  useEffect(() => {
    if (!activa) return;
    const t = setTimeout(terminarTodas, TOPE_MS);
    return () => clearTimeout(t);
  }, [activa]);
  return (
    <>
      <Suspense fallback={null}>
        <AlLlegar />
      </Suspense>
      <div data-barra-navegacion="" data-activa={activa ? "si" : "no"} aria-hidden="true" className="barra-navegacion" />
    </>
  );
}
