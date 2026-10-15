"use client";

import { useEffect } from "react";
import { mensajeDeValidacion, type CampoValidable } from "@/lib/ui/mensajes-validacion";

/**
 * Pone en español los avisos nativos de validación de TODO formulario de la app (un solo lugar,
 * montado en el layout raíz): escucha `invalid` en captura y fija el mensaje con
 * `setCustomValidity`; al escribir o cambiar el campo lo limpia para que el navegador vuelva a
 * evaluarlo. Un campo con su propio mensaje personalizado (puesto por otro código) no se toca.
 */
export function ValidacionEnEspanol() {
  useEffect(() => {
    const propios = new WeakSet<Element>();

    function alInvalido(e: Event) {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
      // Si alguien más fijó un mensaje a propósito, se respeta.
      if (el.validationMessage && !propios.has(el) && el.validity.customError) return;
      el.setCustomValidity(mensajeDeValidacion(el as CampoValidable));
      propios.add(el);
    }

    function limpiar(e: Event) {
      const el = e.target;
      if (el instanceof Element && propios.has(el)) {
        (el as CampoValidable).setCustomValidity("");
        propios.delete(el);
      }
    }

    document.addEventListener("invalid", alInvalido, true);
    document.addEventListener("input", limpiar, true);
    document.addEventListener("change", limpiar, true);
    return () => {
      document.removeEventListener("invalid", alInvalido, true);
      document.removeEventListener("input", limpiar, true);
      document.removeEventListener("change", limpiar, true);
    };
  }, []);
  return null;
}
