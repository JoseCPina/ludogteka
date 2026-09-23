"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { conTope, conTopeAccion, esperarConTope, mensajeDeFallo, TOPE_MS, type ConError } from "@/lib/ui/espera";

/**
 * La espera de un botón: `cargando` mientras corre, tope de tiempo, y
 * si la acción truena o se agota el tiempo, el resultado trae el mensaje
 * en `error` con la misma forma que devuelven todas las server actions.
 * `cargando` SIEMPRE vuelve a false, pase lo que pase.
 *
 *   const envio = useEspera();
 *   const res = await envio.ejecutar(() => crearInvitacion(...));
 *   if (res.error) { setError(res.error); return; }
 *   ...
 *   <Button cargando={envio.cargando} onClick={generar}>Generar</Button>
 *
 * Un componente con dos botones independientes usa dos hooks.
 */
export function useEspera(opciones: { tope?: number } = {}) {
  const tope = opciones.tope ?? TOPE_MS;
  const [cargando, setCargando] = useState(false);
  // Si el componente se desmonta mientras espera, no se toca el estado.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const ejecutar = useCallback(
    async <T extends ConError>(fn: () => Promise<T>): Promise<T> => {
      setCargando(true);
      try {
        return await esperarConTope(fn, tope);
      } finally {
        if (montado.current) setCargando(false);
      }
    },
    [tope]
  );

  // Para flujos de varios pasos (comprimir, subir a Storage, guardar):
  // el cuerpo devuelve lo que quiera y aquí solo se garantiza el tope,
  // el `cargando` y un error en español si algo truena. Se lee así:
  //   const r = await subiendo.correr(async () => { ... });
  //   if (!r.ok) { setError(r.error); return; }
  const correr = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false; error: string }> => {
      setCargando(true);
      try {
        return { ok: true, valor: await conTope(fn(), tope) };
      } catch (e) {
        return { ok: false, error: mensajeDeFallo(e) };
      } finally {
        if (montado.current) setCargando(false);
      }
    },
    [tope]
  );

  return { cargando, ejecutar, correr };
}

// Para formularios con useActionState: la misma acción, con tope. El
// `pending` de useActionState se apaga solo cuando la acción resuelve, y
// con esto siempre resuelve.
export function useAccionConTope<S extends ConError, P extends unknown[]>(
  accion: (...args: P) => Promise<S>,
  tope: number = TOPE_MS
): (...args: P) => Promise<S> {
  return useMemo(() => conTopeAccion(accion, tope), [accion, tope]);
}
