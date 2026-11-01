"use client";

import { useSyncExternalStore } from "react";

/**
 * UX (1 de noviembre de 2026): las navegaciones en curso del panel, para la barra delgada de arriba
 * (`<BarraNavegacion>`). Las abre el enlace en el momento en que Next decide navegar (`onNavigate` de `<Link>`, solo
 * cuando de verdad hay navegación: no con Ctrl, ni a otra pestaña, ni a la misma página) o un formulario que manda a la
 * pantalla siguiente al guardar; las cierra el propio enlace cuando su estado pendiente se apaga (llegó, o otra
 * navegación la reemplazó) y la barra cuando cambia la ruta. Así la barra nunca se queda colgada.
 */
const activas = new Set<number>();
const oyentes = new Set<() => void>();
let siguiente = 1;
let foto = false;

function avisar() {
  foto = activas.size > 0;
  for (const o of oyentes) o();
}

export function empezarNavegacion(): number {
  const id = siguiente++;
  activas.add(id);
  avisar();
  return id;
}

export function terminarNavegacion(id: number | null | undefined) {
  if (id == null || !activas.delete(id)) return;
  avisar();
}

export function terminarTodas() {
  if (!activas.size) return;
  activas.clear();
  avisar();
}

export function useNavegacionActiva(): boolean {
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => foto,
    () => false
  );
}

/** La URL a la que lleva un href, comparable con la actual (ruta + búsqueda, sin el #). */
export function esLaMismaPagina(href: string): boolean {
  if (typeof window === "undefined") return false;
  const u = new URL(href, window.location.href);
  return u.origin === window.location.origin && u.pathname === window.location.pathname && u.search === window.location.search;
}
