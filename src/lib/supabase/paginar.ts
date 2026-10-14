// La API de Supabase (PostgREST) corta TODA lectura en `max_rows` = 1,000 filas
// SIN dar error: una lista o una suma hecha en JavaScript sobre más filas se
// queda corta en silencio. Dos reglas:
//   1. Un total o un conteo se agrega en la base (sum/count en SQL, una función
//      o `count: "exact", head: true`), nunca trayendo filas para sumarlas aquí.
//   2. Una lista que de verdad hace falta completa se lee con `leerTodo`, que
//      pide página por página hasta el final. Quien llama TIENE que ordenar con
//      una llave única al final (por ejemplo `.order("nombre").order("id")`):
//      sin orden estable, dos páginas pueden repetir o saltarse filas.
// `scripts/auditoria/limite-filas-dev.mjs` revisa que ninguna consulta de lista
// quede sin acotar.

export const TAM_PAGINA = 1000;

type Pagina<T> = { data: T[] | null; error: { message: string } | null };
type Paginable<T> = PromiseLike<Pagina<T>> & { range: (desde: number, hasta: number) => PromiseLike<Pagina<T>> };

/**
 * Lee todas las filas de una consulta, de 1,000 en 1,000. `construir` se llama una
 * vez por página y devuelve la consulta SIN `.range()` (se agrega aquí).
 * Devuelve la misma forma `{ data, error }` que una consulta normal.
 */
export async function leerTodo<T>(construir: () => Paginable<T>, tope = 200_000): Promise<{ data: T[]; error: { message: string } | null }> {
  const todas: T[] = [];
  for (let desde = 0; desde < tope; desde += TAM_PAGINA) {
    const { data, error } = await construir().range(desde, desde + TAM_PAGINA - 1);
    if (error) return { data: todas, error };
    const filas = data ?? [];
    todas.push(...filas);
    if (filas.length < TAM_PAGINA) return { data: todas, error: null };
  }
  return { data: todas, error: { message: `La lectura pasó de ${tope} filas: se detuvo para no cargar de más.` } };
}

/** Parte una lista de ids en bloques para `.in()`: la URL tiene tope de largo. */
export function enBloques<T>(lista: readonly T[], tamano = 200): T[][] {
  const bloques: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) bloques.push(lista.slice(i, i + tamano));
  return bloques;
}

/** Como `leerTodo`, pero para un `.in("columna", ids)` con muchos ids: un bloque de ids a la vez. */
export async function leerTodoPorIds<T, Id>(ids: readonly Id[], construir: (bloque: Id[]) => Paginable<T>, tamano = 200): Promise<{ data: T[]; error: { message: string } | null }> {
  const todas: T[] = [];
  for (const bloque of enBloques(ids, tamano)) {
    const { data, error } = await leerTodo<T>(() => construir(bloque));
    if (error) return { data: todas, error };
    todas.push(...data);
  }
  return { data: todas, error: null };
}
