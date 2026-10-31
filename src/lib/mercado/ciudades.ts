import { CIUDADES_NACIONALES, type CiudadNacional } from "@/lib/prospectos/nacional";
import { normalizarTexto, slugDe } from "./catalogo";

/**
 * Las ciudades del Índice de precios: los 198 municipios de la lista nacional (INEGI), con el nombre corto que la
 * gente escribe («Guadalajara», no «Guadalajara, Jalisco») y su estado para caer al rango estatal.
 */
export type CiudadMercado = { nombre: string; estado: string; slug: string; poblacion: number; clave: string; zona?: string };

export const CIUDADES_MERCADO: CiudadMercado[] = CIUDADES_NACIONALES.map((c: CiudadNacional) => {
  const nombre = c.nombre.replace(/,\s*[^,]+$/, "");
  return { nombre, estado: c.estado, slug: slugDe(nombre), poblacion: c.poblacion, clave: c.clave, zona: c.zona };
});

export const ciudadPorSlug = (slug: string): CiudadMercado | null => CIUDADES_MERCADO.find((c) => c.slug === slug) ?? null;

/** Por nombre, sin acentos ni mayúsculas; también acepta «ciudad, estado». */
export function ciudadPorNombre(nombre: string | null | undefined): CiudadMercado | null {
  if (!nombre) return null;
  const n = normalizarTexto(nombre.replace(/,\s*[^,]+$/, ""));
  return CIUDADES_MERCADO.find((c) => normalizarTexto(c.nombre) === n) ?? null;
}

/** Las que empiezan o contienen lo escrito, las más pobladas primero (el buscador de la herramienta). */
export function buscarCiudades(q: string, tope = 8): CiudadMercado[] {
  const n = normalizarTexto(q);
  if (!n) return CIUDADES_MERCADO.slice(0, tope);
  const empieza = CIUDADES_MERCADO.filter((c) => normalizarTexto(c.nombre).startsWith(n));
  const contiene = CIUDADES_MERCADO.filter((c) => !empieza.includes(c) && (normalizarTexto(c.nombre).includes(n) || normalizarTexto(c.estado).includes(n)));
  return [...empieza, ...contiene].slice(0, tope);
}
