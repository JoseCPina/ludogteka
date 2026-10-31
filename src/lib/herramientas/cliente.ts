"use client";

import { enviarEventoPixel } from "@/lib/peludesk/pixel-cliente";

/**
 * Medición de las herramientas desde el navegador: «visita» al abrir y «uso» cuando la herramienta dio un
 * resultado. Va por sendBeacon a /api/herramientas/evento con las etiquetas utm de la dirección; el servidor filtra
 * robots y guarda la IP solo en hash. Nada se guarda en el navegador. El píxel (ViewContent/Lead) sale aparte y solo
 * con marketing aceptado (src/lib/peludesk/pixel-cliente.ts).
 */
export type EventoCliente = "visita" | "uso";

export function origenActual(): Record<string, string> {
  if (typeof location === "undefined") return {};
  const p = new URLSearchParams(location.search);
  const o: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
    const v = p.get(k);
    if (v) o[k] = v.slice(0, 150);
  }
  return o;
}

const usosMandados = new Set<string>();

export function registrarEventoCliente(herramienta: string, evento: EventoCliente, datos: { giro?: string | null; ciudad?: string | null } = {}) {
  if (typeof window === "undefined") return;
  // Un «uso» por combinación por visita: cambiar la talla tres veces no son tres usos.
  const llave = `${evento}|${datos.giro ?? ""}|${datos.ciudad ?? ""}`;
  if (evento === "uso" && usosMandados.has(llave)) return;
  usosMandados.add(llave);
  const cuerpo = JSON.stringify({ herramienta, evento, ...origenActual(), giro: datos.giro ?? null, ciudad: datos.ciudad ?? null });
  try {
    if (navigator.sendBeacon?.("/api/herramientas/evento", new Blob([cuerpo], { type: "application/json" }))) return;
  } catch {
    /* sigue por fetch */
  }
  fetch("/api/herramientas/evento", { method: "POST", body: cuerpo, headers: { "Content-Type": "application/json" }, keepalive: true, signal: AbortSignal.timeout(5000) }).catch(() => {});
}

/** El píxel y Google Ads (si está): ViewContent al abrir la herramienta, Lead al dejar el teléfono. */
export function pixelHerramienta(evento: "ViewContent" | "Lead", herramienta: string, eventId?: string) {
  enviarEventoPixel(evento, { content_name: herramienta, content_category: "herramienta" }, eventId);
}
