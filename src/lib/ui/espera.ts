/**
 * Espera con tope, para todo lo que la app manda al servidor.
 *
 * El defecto que esto cierra: un botón que hace `setCargando(true)`,
 * espera una server action y hace `setCargando(false)` después. Si la
 * acción truena (excepción en vez de `{ error }`) o nunca contesta, el
 * `false` no llega y el botón se queda en "Generando…" para siempre, sin
 * error y sin salida. Pasó en la ficha del cliente, en el alta y en el
 * link de complemento, y estaba repetido a mano en cuarenta lugares.
 *
 * De aquí en adelante nada espera sin tope: `useEspera` (hook para
 * botones) y `useAccionConTope` (para formularios con `useActionState`)
 * heredan esto, y el próximo botón que alguien agregue lo usa en vez de
 * repetir el patrón.
 */

export const TOPE_MS = 20_000;

export class TiempoAgotado extends Error {
  constructor() {
    super("tiempo agotado");
    this.name = "TiempoAgotado";
  }
}

export const MENSAJE_TIEMPO_AGOTADO =
  "Tardó demasiado en responder. Revisa tu conexión e intenta de nuevo. Si crees que sí se guardó, recarga la página antes de repetirlo para no duplicarlo.";

export const MENSAJE_FALLO_INESPERADO =
  "No pudimos completar la operación. Intenta de nuevo; si sigue fallando, avísale al equipo técnico.";

export function conTope<T>(promesa: Promise<T>, ms: number = TOPE_MS): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new TiempoAgotado()), ms);
  });
  return Promise.race([promesa, tope]).finally(() => {
    if (temporizador) clearTimeout(temporizador);
  });
}

export function mensajeDeFallo(e: unknown): string {
  if (e instanceof TiempoAgotado) return MENSAJE_TIEMPO_AGOTADO;
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return MENSAJE_TIEMPO_AGOTADO;
  }
  return MENSAJE_FALLO_INESPERADO;
}

// Toda server action de esta app devuelve `{ error: string | null, ... }`.
// Cuando la espera falla (tope o excepción), el resultado que se entrega
// tiene la MISMA forma, con el mensaje en `error`: el `if (res.error)` que
// cada pantalla ya tiene lo muestra sin que haya que tocar nada más.
export type ConError = { error: string | null };

export async function esperarConTope<T extends ConError>(
  fn: () => Promise<T>,
  ms: number = TOPE_MS
): Promise<T> {
  try {
    return await conTope(fn(), ms);
  } catch (e) {
    return { error: mensajeDeFallo(e) } as T;
  }
}

// Versión para acciones de formulario (`useActionState`): misma firma
// (estadoPrevio, formData) => estado, con el tope puesto.
export function conTopeAccion<S extends ConError, P extends unknown[]>(
  accion: (...args: P) => Promise<S>,
  ms: number = TOPE_MS
): (...args: P) => Promise<S> {
  return (...args: P) => esperarConTope(() => accion(...args), ms);
}
