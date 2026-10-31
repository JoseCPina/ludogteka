import { CIUDADES_NACIONALES, type CiudadNacional } from "@/lib/prospectos/nacional";
import { normalizarTexto, slugDe } from "./catalogo";

/**
 * Las ciudades del Índice de precios: los 198 municipios de la lista nacional (INEGI), con el nombre corto que la
 * gente escribe («Guadalajara», no «Guadalajara, Jalisco») y su estado para caer al rango estatal.
 */
export type CiudadMercado = { nombre: string; estado: string; slug: string; poblacion: number; clave: string; zona?: string };

/**
 * La capital entera: la lista nacional trae las alcaldías («Iztapalapa, Ciudad de México») porque la prospección busca
 * municipio por municipio, pero Google (y por lo tanto `prospectos.ciudad` y `precios_mercado.ciudad`) dice «Ciudad de
 * México» a secas. Sin esta entrada, las páginas y los rangos de la ciudad con más precios del índice no existían
 * (31 de octubre de 2026). Población del Censo 2020.
 */
const CIUDAD_DE_MEXICO: CiudadMercado = { nombre: "Ciudad de México", estado: "Ciudad de México", slug: "ciudad-de-mexico", poblacion: 9209944, clave: "09", zona: "Ciudad de México" };

export const CIUDADES_MERCADO: CiudadMercado[] = [
  CIUDAD_DE_MEXICO,
  ...CIUDADES_NACIONALES.map((c: CiudadNacional) => {
    const nombre = c.nombre.replace(/,\s*[^,]+$/, "");
    return { nombre, estado: c.estado, slug: slugDe(nombre), poblacion: c.poblacion, clave: c.clave, zona: c.zona };
  }),
];

export const ciudadPorSlug = (slug: string): CiudadMercado | null => CIUDADES_MERCADO.find((c) => c.slug === slug) ?? null;

/**
 * Por nombre, sin acentos ni mayúsculas; también acepta «ciudad, estado» y un slug («naucalpan-de-juarez»). Si no hay
 * una igual, prueba sin el apellido del municipio: Google nombra «Naucalpan de Juárez», «Tlalnepantla de Baz» o
 * «Ecatepec de Morelos» y la lista los trae como se dice la ciudad (Naucalpan, Tlalnepantla, Ecatepec).
 */
export function ciudadPorNombre(nombre: string | null | undefined): CiudadMercado | null {
  if (!nombre) return null;
  const n = normalizarTexto(nombre.replace(/-/g, " ").replace(/,\s*[^,]+$/, ""));
  const igual = CIUDADES_MERCADO.find((c) => normalizarTexto(c.nombre) === n);
  if (igual) return igual;
  const corta = n.replace(/ de [a-z].*$/, "");
  return corta !== n ? (CIUDADES_MERCADO.find((c) => normalizarTexto(c.nombre) === corta) ?? null) : null;
}

/** Las que empiezan o contienen lo escrito, las más pobladas primero (el buscador de la herramienta). */
export function buscarCiudades(q: string, tope = 8): CiudadMercado[] {
  const n = normalizarTexto(q);
  if (!n) return CIUDADES_MERCADO.slice(0, tope);
  const empieza = CIUDADES_MERCADO.filter((c) => normalizarTexto(c.nombre).startsWith(n));
  const contiene = CIUDADES_MERCADO.filter((c) => !empieza.includes(c) && (normalizarTexto(c.nombre).includes(n) || normalizarTexto(c.estado).includes(n)));
  return [...empieza, ...contiene].slice(0, tope);
}
