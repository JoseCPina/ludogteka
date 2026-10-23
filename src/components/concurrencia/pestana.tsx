"use client";

import { ENCABEZADO_PESTANA } from "@/lib/concurrencia/tipos";

// N120: cada pestaña del navegador tiene su id (vive en la memoria de la página: otra pestaña, o la misma recargada,
// tiene otro) y lo manda en toda petición a este mismo sitio, también en las acciones del servidor. El servidor lo
// pasa a la base y el control de concurrencia distingue «yo en esta pantalla» de «yo en otra pestaña».

function nuevoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type ConPestana = Window & { __peludeskPestana?: string };

if (typeof window !== "undefined" && !(window as ConPestana).__peludeskPestana) {
  const id = nuevoId();
  (window as ConPestana).__peludeskPestana = id;
  const original = window.fetch.bind(window);
  window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    let destino: string;
    try {
      destino = new URL(typeof entrada === "string" || entrada instanceof URL ? entrada : entrada.url, window.location.href).origin;
    } catch {
      return original(entrada, init);
    }
    if (destino !== window.location.origin) return original(entrada, init);
    const encabezados = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : undefined));
    encabezados.set(ENCABEZADO_PESTANA, id);
    return original(entrada, { ...init, headers: encabezados });
  };
}

/** Se monta una vez en el layout del personal; no pinta nada. */
export function PestanaConcurrencia() {
  return null;
}
