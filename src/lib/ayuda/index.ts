import type { Articulo } from "./tipos";
import { NOMBRE_GRUPO } from "./tipos";
import { ARTICULOS_DIA_Y_RESERVAS } from "./articulos/dia-y-reservas";
import { ARTICULOS_CAJA_Y_ESTETICA } from "./articulos/caja-y-estetica";
import { ARTICULOS_ADMINISTRACION } from "./articulos/administracion";
import { ARTICULOS_REPORTE_Y_FOTOS } from "./articulos/reporte-y-fotos";
import { ARTICULOS_FACTURACION } from "./articulos/facturacion";

/**
 * El centro de ayuda de PeluDesk: todos los artículos y cómo se encuentran.
 * Los artículos viven en ./articulos (uno por tarea real). Todo cambio que
 * altere cómo se usa una pantalla actualiza su artículo en el mismo cambio.
 */
export const ARTICULOS: Articulo[] = [...ARTICULOS_DIA_Y_RESERVAS, ...ARTICULOS_CAJA_Y_ESTETICA, ...ARTICULOS_ADMINISTRACION, ...ARTICULOS_REPORTE_Y_FOTOS, ...ARTICULOS_FACTURACION];

export { NOMBRE_GRUPO };
export type { Articulo };

const ORDEN_GRUPOS = Object.keys(NOMBRE_GRUPO);

export function articuloPorSlug(slug: string): Articulo | null {
  return ARTICULOS.find((a) => a.slug === slug) ?? null;
}

/** Los que ve un negocio: solo los de sus módulos activos (y los de todos). */
export function articulosDelNegocio(modulos: readonly string[], rol?: string): Articulo[] {
  return ARTICULOS.filter(
    (a) => (!a.modulo || (Array.isArray(a.modulo) ? a.modulo : [a.modulo]).some((m) => modulos.includes(m))) && (!rol || (a.roles as string[]).includes(rol))
  );
}

/** Agrupados para el índice, en el orden de NOMBRE_GRUPO. */
export function agrupar(lista: Articulo[]): { grupo: string; nombre: string; articulos: Articulo[] }[] {
  return ORDEN_GRUPOS.map((g) => ({ grupo: g, nombre: NOMBRE_GRUPO[g], articulos: lista.filter((a) => a.grupo === g) })).filter(
    (g) => g.articulos.length > 0
  );
}

/** Sin acentos ni mayúsculas, para buscar. */
export function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Texto plano del artículo (sin marcas de Markdown). */
export function textoPlano(a: Articulo): string {
  return a.cuerpo
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*#>]/g, "")
    .replace(/^\s*(\d+\.|-)\s+/gm, "");
}

/** Búsqueda por palabras: título y palabras pesan más que el cuerpo. */
export function buscar(q: string, lista: Articulo[] = ARTICULOS): Articulo[] {
  const terminos = normalizar(q)
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9ñ]/g, ""))
    .filter((t) => t.length > 2);
  if (!terminos.length) return [];
  const puntuados = lista.map((a) => {
    const titulo = normalizar(`${a.titulo} ${(a.palabras ?? []).join(" ")}`);
    const resto = normalizar(`${a.resumen} ${textoPlano(a)}`);
    let puntos = 0;
    for (const t of terminos) {
      const raiz = t.length > 5 ? t.slice(0, t.length - 2) : t;
      if (titulo.includes(raiz)) puntos += 3;
      else if (resto.includes(raiz)) puntos += 1;
    }
    return { a, puntos };
  });
  return puntuados
    .filter((p) => p.puntos > 0)
    .sort((x, y) => y.puntos - x.puntos)
    .map((p) => p.a);
}

export { articuloDeRuta } from "./rutas";
