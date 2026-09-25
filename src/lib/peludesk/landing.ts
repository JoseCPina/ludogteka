import { urlDelNegocio } from "@/lib/negocio/actual";

/**
 * Lo que alimenta la landing de PeluDesk (peludesk.mx, src/app/peludesk).
 *
 * Las capturas son del negocio de DEMOSTRACIÓN (Patitas & Co., datos
 * inventados: scripts/demo/sembrar-demo.mjs) y se regeneran con
 * scripts/demo/capturas.mjs + scripts/demo/optimizar-capturas.mjs. Viven en
 * public/peludesk/capturas/<nombre>-escritorio.webp (1600 y 800 px de ancho)
 * y <nombre>-celular.webp (780 px).
 */
export const SLUG_DEMO = "patitasyco";

export function urlDemo(): string {
  return urlDelNegocio({ slug: SLUG_DEMO, dominio: null, url_publica: null });
}

/**
 * Ludogteka como caso real: vacío a propósito. Se llena (cita, quién la
 * dice, qué usan) SOLO cuando el dueño de PeluDesk confirme qué se puede
 * publicar. Mientras sea null, la sección no se pinta.
 */
export const CASO_REAL: { negocio: string; ciudad: string; cita: string; quien: string; usan: string[] } | null = null;

export type Captura = { nombre: string; alt: string; ancho: number; alto: number };

// Proporción de las capturas: escritorio 1280×800 (16:10), celular 390×844.
export const ESCRITORIO = { ancho: 1600, alto: 1000 };
export const CELULAR = { ancho: 780, alto: 1688 };
