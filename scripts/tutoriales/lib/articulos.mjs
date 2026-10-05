// Los artículos de ayuda por slug (título), leídos del código, para los enlaces de la descripción de YouTube.
import { articulosDeAyuda } from "./fuentes.mjs";
let cache = null;
export function articuloPorSlugArchivo(slug) {
  cache ??= new Map(articulosDeAyuda().map((a) => [a.slug, a]));
  return cache.get(slug) ?? null;
}
