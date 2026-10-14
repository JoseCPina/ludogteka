// La API de Supabase corta TODA lectura en 1,000 filas sin dar error (max_rows). En una auditoría eso congela una
// suma o una lista en 1,000 y la prueba «pasa» con datos incompletos. Regla: un total o un conteo sale de la base
// (`count: "exact", head: true` o una función SQL); una lista completa se lee con `todas`, que pide página por página.
// Quien llama ordena por una llave única al final (`.order("id")`) para que las páginas no se repitan ni se salten.
// Gemela de src/lib/supabase/paginar.ts (que la app no puede importar desde un .mjs).

export const TAM_PAGINA = 1000;

/** Lee todas las filas de `construir()` (una consulta SIN .range(), con orden estable). Devuelve { data, error }. */
export async function todas(construir, tope = 200_000) {
  const filas = [];
  for (let desde = 0; desde < tope; desde += TAM_PAGINA) {
    const { data, error } = await construir().range(desde, desde + TAM_PAGINA - 1);
    if (error) return { data: filas, error };
    filas.push(...(data ?? []));
    if ((data ?? []).length < TAM_PAGINA) return { data: filas, error: null };
  }
  return { data: filas, error: { message: `Más de ${tope} filas: se detuvo.` } };
}

/** Cuántas filas tiene una consulta, contadas por la base (no trayendo las filas). `consulta` ya trae su from() y sus filtros. */
export async function contar(consulta) {
  const { count, error } = await consulta;
  if (error) throw new Error(`contar: ${error.message}`);
  return count ?? 0;
}
