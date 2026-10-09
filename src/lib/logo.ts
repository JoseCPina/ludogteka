/**
 * Reglas del logo del negocio: las mismas en la pantalla (antes de subir) y
 * en el servidor (al recibirlo). La pantalla avisa; el servidor decide.
 */
export const TIPOS_LOGO = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const MAX_BYTES_LOGO = 2 * 1024 * 1024;
// Lado menor y lado mayor mínimos (px): menos se ve borroso hasta en el encabezado.
export const MIN_LADO_MENOR_LOGO = 100;
export const MIN_LADO_MAYOR_LOGO = 200;
// Más ancho que 4:1 (o más alto que 1:4) se ve como un listón.
export const PROPORCION_EXTREMA = 4;

export type AvisoLogo = { nivel: "error" | "aviso"; texto: string };

export function extensionDeLogo(tipo: string): "png" | "jpg" | "webp" | "svg" | null {
  return tipo === "image/png" ? "png" : tipo === "image/jpeg" ? "jpg" : tipo === "image/webp" ? "webp" : tipo === "image/svg+xml" ? "svg" : null;
}

/** Un SVG con scripts o manejadores no se sube: se abre dentro de nuestras páginas. */
export function svgPeligroso(texto: string): boolean {
  return /<script|<foreignObject|\son[a-z]+\s*=|javascript:|<iframe|<embed|<object/i.test(texto);
}

/** Lo que bloquea o avisa según el archivo y sus dimensiones reales. */
export function avisosDeLogo(a: { tipo: string; bytes: number; ancho: number | null; alto: number | null }): AvisoLogo[] {
  const r: AvisoLogo[] = [];
  if (!(TIPOS_LOGO as readonly string[]).includes(a.tipo)) r.push({ nivel: "error", texto: "El logo tiene que ser PNG, JPG, WebP o SVG." });
  if (a.bytes > MAX_BYTES_LOGO) r.push({ nivel: "error", texto: `El logo pesa ${(a.bytes / 1024 / 1024).toFixed(1)} MB; el máximo es ${MAX_BYTES_LOGO / 1024 / 1024} MB. Súbelo más chico.` });
  if (a.ancho && a.alto && a.tipo !== "image/svg+xml") {
    if (Math.min(a.ancho, a.alto) < MIN_LADO_MENOR_LOGO || Math.max(a.ancho, a.alto) < MIN_LADO_MAYOR_LOGO)
      r.push({ nivel: "error", texto: `El logo mide ${a.ancho}×${a.alto} px y es muy chico: necesita al menos ${MIN_LADO_MENOR_LOGO} px de lado menor y ${MIN_LADO_MAYOR_LOGO} px de lado mayor.` });
  }
  if (a.ancho && a.alto) {
    const p = a.ancho / a.alto;
    if (p > PROPORCION_EXTREMA) r.push({ nivel: "aviso", texto: `El logo es extremadamente ancho (${a.ancho}×${a.alto}): se va a ver muy chico de alto. Recórtalo más cerca de su dibujo.` });
    if (p < 1 / PROPORCION_EXTREMA) r.push({ nivel: "aviso", texto: `El logo es extremadamente alto (${a.ancho}×${a.alto}): se va a ver muy angosto. Recórtalo más cerca de su dibujo.` });
  }
  return r;
}
