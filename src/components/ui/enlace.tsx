"use client";

import type { AnchorHTMLAttributes, ComponentProps, ReactNode } from "react";
import { EnlacePrecarga } from "./enlace-precarga";

/**
 * UX (1 de noviembre de 2026): EL enlace del panel. Lo que navega es enlace y se ve como enlace, siempre igual: morado
 * de acento, subrayado al pasar (y siempre subrayado dentro de un texto), cursor de mano, foco visible y 44 px de área
 * táctil cuando va suelto. Lo que ejecuta una acción es `<Button>` (src/components/ui/button.tsx). Nada de enlaces con
 * forma de botón ni de botones que parecen texto (docs/ux-respuesta.md).
 *
 * Formas:
 *   · `texto` (la de siempre): el enlace suelto o en una lista. `enTexto` lo marca dentro de una frase (subrayado fijo,
 *     sin el alto mínimo: la regla de los 44 px exime a un enlace dentro de un renglón de texto).
 *   · `bloque`: una tarjeta o un renglón entero que lleva a otra pantalla (la forma la pone `className`); suma foco,
 *     cursor y el estado pendiente.
 * Interno (`/ruta`, sin `target` ni `download`): navega con `<EnlacePrecarga>` (estado pendiente, barra de arriba,
 * doble toque ignorado y precarga al pasar; `precarga="automatica"` para lo que casi seguro se abre después).
 * Externo, `tel:`, `mailto:`, WhatsApp, descargas y `/api`: un `<a>` con el mismo aspecto.
 */
export const CLASE_ENLACE =
  "cursor-pointer rounded-sm font-semibold text-morado decoration-[1.5px] underline-offset-[3px] hover:underline hover:text-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado focus-visible:ring-offset-2";
/** Suelto (no dentro de un renglón de texto): 44 px de alto y de ancho para el dedo. */
const AREA_TACTIL = "inline-flex min-h-11 min-w-11 items-center gap-1.5";
const CLASE_BLOQUE = "min-h-11 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado focus-visible:ring-offset-2";

type Comunes = {
  href: string;
  children?: ReactNode;
  className?: string;
  forma?: "texto" | "bloque";
  /** Dentro de una frase: subrayado siempre y sin alto mínimo. */
  enTexto?: boolean;
  precarga?: "al-pasar" | "automatica";
};
type Props = Comunes & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children"> &
  Pick<ComponentProps<typeof EnlacePrecarga>, "replace" | "scroll">;

export function esNavegacionInterna(href: string, props: { target?: string; download?: unknown }) {
  return href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api/") && (!props.target || props.target === "_self") && props.download === undefined;
}

export function claseEnlace({ forma = "texto", enTexto = false, className = "" }: Pick<Comunes, "forma" | "enTexto" | "className">) {
  if (forma === "bloque") return `${CLASE_BLOQUE} ${className}`.trim();
  return `${CLASE_ENLACE} ${enTexto ? "underline" : AREA_TACTIL} ${className}`.trim();
}

export function Enlace({ href, children, className, forma = "texto", enTexto = false, precarga = "al-pasar", replace, scroll, ...resto }: Props) {
  const clase = claseEnlace({ forma, enTexto, className });
  const ui = forma === "bloque" ? "enlace-bloque" : "enlace";
  const marcas = { "data-ui": ui, "data-en-texto": enTexto ? "" : undefined } as Record<string, string | undefined>;
  if (esNavegacionInterna(href, resto)) {
    return (
      <EnlacePrecarga href={href} automatica={precarga === "automatica"} replace={replace} scroll={scroll} className={clase} {...marcas} {...resto}>
        {children}
      </EnlacePrecarga>
    );
  }
  // Lo que sale de la app se abre en otra pestaña (salvo tel:, mailto: y descargas, que el navegador resuelve solo).
  const fuera = /^https?:\/\//.test(href) && resto.target === undefined;
  return (
    <a href={href} className={clase} {...marcas} {...(fuera ? { target: "_blank", rel: "noopener noreferrer" } : {})} {...resto}>
      {children}
    </a>
  );
}
