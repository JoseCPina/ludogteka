"use client";

import { useEffect } from "react";

export const MENSAJE_SALIR_SIN_GUARDAR = "Tienes cambios sin guardar. Se conservan en el borrador, pero si sales ahora no se emiten. ¿Salir de todos modos?";

/**
 * Mientras `activo`, avisa antes de dejar la pantalla (QA N34, 18 de octubre de 2026): al recargar o cerrar
 * (`beforeunload`) Y al seguir un enlace interno de la app (menú lateral, Inicio, Clientes…), que en Next no
 * dispara `beforeunload`. El clic se atrapa en la fase de captura, antes que el `<Link>` de Next; si la persona
 * cancela, no se navega. Un enlace a otra pestaña, con tecla modificadora o a la misma ruta no pregunta.
 */
export function useAvisoAlSalir(activo: boolean, mensaje = MENSAJE_SALIR_SIN_GUARDAR) {
  useEffect(() => {
    if (!activo) return;
    const alDescargar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const alClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const destino = new URL(a.href, location.href);
      if (destino.origin !== location.origin) return;
      if (destino.pathname === location.pathname && destino.search === location.search) return;
      if (!window.confirm(mensaje)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("beforeunload", alDescargar);
    document.addEventListener("click", alClic, true);
    return () => {
      window.removeEventListener("beforeunload", alDescargar);
      document.removeEventListener("click", alClic, true);
    };
  }, [activo, mensaje]);
}
