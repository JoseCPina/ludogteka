"use client";

import { useSyncExternalStore } from "react";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

/**
 * QA S39 (N138): el último registro que esta pestaña guardó, por tipo e id. La acción del servidor lo devuelve en su
 * respuesta (`registros`) y `useControlVersion` lo publica aquí; lo que la pantalla muestra de ese registro fuera del
 * formulario (el encabezado de la cita, las fechas de una estancia…) lo lee con `useRegistroVivo` y se pinta al
 * momento, sin esperar a que la página se recargue. Gana la versión más reciente entre lo publicado y lo que trajo el
 * servidor al pintar la página.
 */
const registros = new Map<string, RegistroFinal>();
const oyentes = new Set<() => void>();
const clave = (t: string, i: string) => `${t}:${i}`;

export function publicarRegistros(lista: RegistroFinal[] | null | undefined) {
  if (!lista?.length) return;
  for (const r of lista) registros.set(clave(r.t, r.i), r);
  oyentes.forEach((o) => o());
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/**
 * Los datos de un registro como los muestra la pantalla: los de la página (`inicial`, con su `version`) o, si esta
 * pestaña guardó después, los que devolvió la base al guardar.
 */
export function useRegistroVivo<T extends Record<string, unknown>>(t: string, i: string | null | undefined, inicial: T, version: string | null | undefined): T {
  const vivo = useSyncExternalStore(
    suscribir,
    () => (i ? registros.get(clave(t, i)) : undefined),
    () => undefined
  );
  if (!vivo?.datos || !vivo.version) return inicial;
  if (version && Date.parse(version) >= Date.parse(vivo.version)) return inicial;
  return { ...inicial, ...(vivo.datos as Partial<T>) };
}
