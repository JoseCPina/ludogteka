import type { ColoresTarjeta, ConfigReporte } from "./tipos";

const HEX = /^#[0-9a-fA-F]{6}$/;
const AMBAR_POR_OMISION = "#F5B85C";
const MORADO_POR_OMISION = "#4B3F72";

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Mezcla `a` con `b` (0 = a, 1 = b). */
export function mezclar(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const f = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${f(ar, br)}${f(ag, bg)}${f(ab, bb)}`.toUpperCase();
}

export const aclarar = (hex: string, t: number) => mezclar(hex, "#FFFFFF", t);
export const oscurecer = (hex: string, t: number) => mezclar(hex, "#000000", t);

/** Luminancia relativa (0 negro, 1 blanco) para decidir el color del texto encima. */
export function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Los tres colores de la tarjeta de un negocio: los que él configuró en
 * reporte_config; el que falte sale de su marca (negocios.marca.color):
 * primario = el de la marca, secundario = un tinte vivo y acento = ámbar.
 */
export function coloresDeTarjeta(
  config: Pick<ConfigReporte, "color_primario" | "color_secundario" | "color_acento"> | null,
  marca: { color?: string | null } | null
): ColoresTarjeta {
  const base = marca?.color && HEX.test(marca.color) ? marca.color.toUpperCase() : MORADO_POR_OMISION;
  const valido = (v: string | null | undefined) => (v && HEX.test(v) ? v.toUpperCase() : null);
  const primario = valido(config?.color_primario) ?? base;
  return {
    primario,
    secundario: valido(config?.color_secundario) ?? mezclar(primario, "#1FB8B2", 0.6),
    acento: valido(config?.color_acento) ?? AMBAR_POR_OMISION,
  };
}
