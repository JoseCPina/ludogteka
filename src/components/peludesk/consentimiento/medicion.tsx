"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import type { Consentimiento } from "@/lib/peludesk/cookies";
import { activarPixel, desactivarPixel, enviarEventoPixel, pixelCargado, type EventoPixel } from "@/lib/peludesk/pixel-cliente";

/**
 * Lo único que mide peludesk.mx, y solo con permiso:
 *  · analítica (Vercel Web Analytics, sin cookies) si aceptó «Analítica»;
 *  · píxel de Meta si aceptó «Marketing» y hay píxel configurado.
 * Sin permiso este componente no carga nada y no pide nada a nadie.
 *
 * Los elementos con data-pixel-evento="Lead" (los botones del demo) mandan
 * ese evento al tocarlos.
 */
export function Medicion({ consentimiento, pixelId }: { consentimiento: Consentimiento; pixelId: string | null }) {
  const pathname = usePathname();
  const marketing = consentimiento.marketing && Boolean(pixelId);
  const visto = useRef<string | null>(null);

  useEffect(() => {
    if (marketing && pixelId) {
      activarPixel(pixelId);
      visto.current = pathname;
    } else if (consentimiento.decidido) {
      desactivarPixel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketing, pixelId, consentimiento.decidido]);

  // Otra página dentro del sitio (sin recargar): otra vista.
  useEffect(() => {
    if (!marketing || !pixelCargado() || visto.current === pathname) return;
    visto.current = pathname;
    enviarEventoPixel("PageView");
  }, [pathname, marketing]);

  useEffect(() => {
    const alTocar = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-pixel-evento]");
      const nombre = el?.getAttribute("data-pixel-evento") as EventoPixel | null;
      if (nombre) enviarEventoPixel(nombre, { content_name: el?.getAttribute("data-pixel-contenido") ?? "demo" });
    };
    document.addEventListener("click", alTocar, { capture: true });
    return () => document.removeEventListener("click", alTocar, { capture: true });
  }, []);

  return consentimiento.analitica ? <Analytics /> : null;
}
