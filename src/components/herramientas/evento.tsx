"use client";

import { useEffect } from "react";
import { pixelHerramienta, registrarEventoCliente } from "@/lib/herramientas/cliente";

/** Al abrir una herramienta: «visita» en la medición propia y ViewContent en el píxel (solo con marketing aceptado). */
export function EventoHerramienta({ clave }: { clave: string }) {
  useEffect(() => {
    registrarEventoCliente(clave, "visita");
    pixelHerramienta("ViewContent", clave);
  }, [clave]);
  return null;
}
