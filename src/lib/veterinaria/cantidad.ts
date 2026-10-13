/**
 * Una cantidad escrita a mano: un número con o sin unidad («2», «2.5», «2,5 ml», «2ml»).
 * La unidad que se escribe se ignora: la que vale es la de consumo del producto, que la
 * pantalla ya muestra. Devuelve `null` si no es un número positivo.
 */
export function leerCantidad(valor: string): number | null {
  const m = valor.trim().match(/^(\d+(?:[.,]\d+)?)\s*[a-zA-ZáéíóúñÁÉÍÓÚÑ.]*$/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Lo que dice la pantalla cuando una cantidad no se entiende. */
export const AYUDA_CANTIDAD = "Escribe un número, con o sin unidad: por ejemplo 2 o 2 ml.";
