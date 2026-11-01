/**
 * Arranca a la vez un grupo de consultas independientes de una pantalla (tiempo del panel, 1 de noviembre de 2026).
 *
 * Una consulta de Supabase (`supabase.from(...)`, `supabase.rpc(...)`) es un «thenable» PEREZOSO: no sale a la base
 * hasta que alguien llama su `.then`, y no tiene `.catch`. Ponerlas en un objeto no las adelanta, y `.catch` sobre una
 * de ellas truena (`TypeError: a.catch is not a function`: así quedaron /admin y /recepcion con la primera versión).
 * `Promise.resolve(x)` llama su `.then` en ese momento (sale ya) y devuelve una `Promise` de verdad; aquí además se le
 * cuelga un `.catch` vacío, para que si la pantalla sale antes (error de otra tanda) ninguna quede como rechazo sin
 * atrapar. Quien la espera con `await` sigue recibiendo su resultado o su error.
 */
export function arrancarTodas<T extends Record<string, PromiseLike<unknown>>>(previas: T): { [K in keyof T]: Promise<Awaited<T[K]>> } {
  const salida = {} as { [K in keyof T]: Promise<Awaited<T[K]>> };
  for (const k of Object.keys(previas) as (keyof T)[]) {
    const p = Promise.resolve(previas[k]) as Promise<Awaited<T[typeof k]>>;
    p.catch(() => {});
    salida[k] = p;
  }
  return salida;
}
