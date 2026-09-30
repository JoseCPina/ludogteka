"use client";

import { useEffect } from "react";
import { enviarEventoPixel, type EventoPixel } from "@/lib/peludesk/pixel-cliente";

/** Pide un evento del píxel al pintarse la página (una vez). Sin marketing aceptado, no sale nada. */
export function EventoPixelAlVer({ nombre, datos }: { nombre: EventoPixel; datos?: Record<string, string | number> }) {
  const clave = JSON.stringify(datos ?? {});
  useEffect(() => {
    enviarEventoPixel(nombre, JSON.parse(clave));
  }, [nombre, clave]);
  return null;
}
