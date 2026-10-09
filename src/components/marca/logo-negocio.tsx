"use client";

import { useEffect, useRef, useState } from "react";
import { fredoka } from "@/fuentes";
import type { MarcaNegocio } from "@/lib/landing/negocio";

/**
 * EL logo del negocio: el único lugar de la app donde se pinta. Staff,
 * portal, login, alta por link, ligas públicas, página web, recibos.
 *
 * Reglas que no se rompen (el logo salía estirado a lo ancho en /alta porque
 * la imagen era hija directa de un `flex-col`: con `align-items: stretch` el
 * `w-auto` se convertía en el ancho completo de la columna y la altura fija
 * la dejaba plana):
 *   - La imagen NUNCA lleva ancho y alto fijos a la vez: solo un tope de
 *     altura (`max-h-*`), `h-auto w-auto` y `object-contain`, así conserva
 *     SIEMPRE su proporción original.
 *   - Va dentro de su propio contenedor (`inline-block` / banner), nunca
 *     como hija suelta de un flex que la pueda estirar.
 *   - Si la imagen no carga, se pinta el nombre del negocio como texto.
 *
 * Qué pinta, según negocios.marca:
 *   logo        → su imagen
 *   logo_texto  → su logotipo de palabras con color (Ludogteka)
 *   nada        → su inicial sobre su color, y su nombre
 *
 * Variantes (altura máxima del logo):
 *   barra       → encabezado del staff y del portal (40 px)
 *   encabezado  → arriba de una pantalla pública (64 px en móvil, 80 en escritorio)
 *   banner      → igual, dentro de una franja con el color de la marca (alta por link)
 *   recibo      → documento que se imprime (56 px)
 */
export type VarianteLogo = "barra" | "encabezado" | "banner" | "recibo";

const ALTURAS: Record<VarianteLogo, string> = {
  barra: "max-h-10",
  encabezado: "max-h-16 sm:max-h-20",
  banner: "max-h-16 sm:max-h-20",
  recibo: "max-h-14",
};
// Un logo muy ancho no se sale de su pantalla ni se vuelve un listón.
const ANCHOS: Record<VarianteLogo, string> = {
  barra: "max-w-[10rem] sm:max-w-[13rem]",
  encabezado: "max-w-[16rem] sm:max-w-[20rem]",
  banner: "max-w-[16rem] sm:max-w-[20rem]",
  recibo: "max-w-[14rem]",
};
// Tamaño del logotipo de palabras y de la inicial, por variante.
const PX_TEXTO: Record<VarianteLogo, number> = { barra: 27, encabezado: 40, banner: 40, recibo: 32 };
const PX_INICIAL: Record<VarianteLogo, number> = { barra: 32, encabezado: 48, banner: 48, recibo: 40 };
const PX_NOMBRE: Record<VarianteLogo, number> = { barra: 18, encabezado: 28, banner: 28, recibo: 22 };

const COLOR_POR_OMISION = "#4b3f72";
const esColor = (c: string | null | undefined): c is string => Boolean(c && /^#[0-9a-fA-F]{6}$/.test(c));
export const esUrlDeLogo = (l: string | null | undefined): l is string => Boolean(l && (/^\/(?!\/)/.test(l) || /^https:\/\//.test(l) || /^blob:/.test(l)));

export function LogoNegocio({
  nombre,
  marca,
  variante = "encabezado",
  className = "",
}: {
  nombre: string;
  marca: MarcaNegocio | null | undefined;
  variante?: VarianteLogo;
  className?: string;
}) {
  const color = esColor(marca?.color) ? marca.color : COLOR_POR_OMISION;
  const imagen = esUrlDeLogo(marca?.logo) ? marca.logo : null;
  const [fallo, setFallo] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // Si la imagen ya falló antes de que React se enganchara (el HTML viene
  // del servidor), `onError` no se entera: se revisa aquí.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFallo(true);
  }, [imagen]);

  const marcoBanner = variante === "banner";
  const contenido = (() => {
    if (imagen && !fallo) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={imagen}
          alt={nombre}
          onError={() => setFallo(true)}
          className={`block h-auto w-auto object-contain ${ALTURAS[variante]} ${ANCHOS[variante]} ${marcoBanner ? "rounded-lg bg-white p-1.5" : ""}`}
        />
      );
    }
    if (!imagen && marca?.logo_texto?.length) {
      const letra = marca.logo_fuente === "fredoka" ? `${fredoka.variable} font-[family-name:var(--font-fredoka)]` : "";
      return (
        <span
          role="img"
          aria-label={nombre}
          className={`inline-flex items-baseline font-bold leading-none tracking-[-0.02em] ${letra}`}
          style={{ fontSize: PX_TEXTO[variante] }}
        >
          {marca.logo_texto.map((p, i) => (
            <span key={i} aria-hidden style={{ color: p.color }}>
              {p.texto}
            </span>
          ))}
        </span>
      );
    }
    // Sin imagen (o la imagen no cargó): su nombre como texto, con su inicial.
    return (
      <span className="inline-flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid flex-none place-items-center rounded-[10px] font-bold text-white"
          style={{ width: PX_INICIAL[variante], height: PX_INICIAL[variante], background: color, fontSize: PX_INICIAL[variante] * 0.55, textShadow: "0 1px 1px rgb(0 0 0 / 0.25)" }}
        >
          {(nombre.trim()[0] ?? "·").toUpperCase()}
        </span>
        <span className="font-bold tracking-tight text-n-900" style={{ fontSize: PX_NOMBRE[variante] }}>
          {nombre}
        </span>
      </span>
    );
  })();

  if (marcoBanner) {
    // La franja toma el color de la marca, muy suave: nunca un bloque blanco vacío.
    return (
      <div
        className={`flex w-full items-center justify-center rounded-2xl border px-4 py-5 sm:py-6 ${className}`}
        style={{
          background: `color-mix(in srgb, ${color} 9%, white)`,
          borderColor: `color-mix(in srgb, ${color} 22%, white)`,
        }}
      >
        {contenido}
      </div>
    );
  }
  // inline-block: dentro de un flex-col no se estira a lo ancho (el contenedor
  // sí, la imagen no) y `self-start` la deja alineada a la izquierda.
  return <span className={`inline-block max-w-full self-start align-middle ${className}`}>{contenido}</span>;
}
