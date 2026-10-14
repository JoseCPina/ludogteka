"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

// Piezas compartidas de las demos animadas de la landing. Todo es React
// montando elementos por turnos + CSS (peludesk-animaciones.css). Ninguna demo
// toca la base: usan datos de ejemplo escritos en el código.

const consulta = "(prefers-reduced-motion: reduce)";

/** «Reducir movimiento»: las demos muestran directamente su estado final. */
export function useReducido(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(consulta).matches,
    () => false
  );
}

/** Verdadero mientras el elemento se ve y la pestaña está al frente. */
export function useVisible(ref: RefObject<Element | null>, umbral = 0.3): boolean {
  const [dentro, setDentro] = useState(false);
  const [frente, setFrente] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setDentro(e.isIntersecting), { threshold: umbral });
    obs.observe(el);
    const alCambiar = () => setFrente(document.visibilityState === "visible");
    alCambiar();
    document.addEventListener("visibilitychange", alCambiar);
    return () => {
      obs.disconnect();
      document.removeEventListener("visibilitychange", alCambiar);
    };
  }, [ref, umbral]);
  return dentro && frente;
}

type Secuencia = { paso: number; ciclo: number; saliendo: boolean };

/**
 * Pasos por turnos. `tiempos` son los milisegundos (desde el arranque) en que
 * entra cada paso: `paso` vale cuántos ya entraron. Corre una vez, se queda en
 * su estado final `retencion` ms, se desvanece y vuelve a empezar, mientras
 * `activo` sea verdadero. `ciclo` cambia en cada vuelta (úsalo como `key`).
 * Con «reducir movimiento»: `paso` = todos, sin movimiento.
 */
export function useSecuencia(tiempos: readonly number[], activo: boolean, retencion = 4500, salida = 500): Secuencia & { reducido: boolean } {
  const reducido = useReducido();
  const [estado, setEstado] = useState<Secuencia>({ paso: 0, ciclo: 0, saliendo: false });
  // Los tiempos de cada demo son constantes: se leen una sola vez.
  const [lista] = useState(tiempos);
  useEffect(() => {
    if (reducido || !activo) return;
    const ids: number[] = [];
    const total = lista[lista.length - 1] ?? 0;
    const arrancar = () => {
      setEstado((s) => ({ paso: 0, ciclo: s.ciclo + 1, saliendo: false }));
      lista.forEach((t, i) => ids.push(window.setTimeout(() => setEstado((s) => ({ ...s, paso: i + 1 })), t)));
      ids.push(window.setTimeout(() => setEstado((s) => ({ ...s, saliendo: true })), total + retencion));
      ids.push(window.setTimeout(arrancar, total + retencion + salida));
    };
    arrancar();
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [activo, reducido, retencion, salida, lista]);
  if (reducido) return { paso: lista.length, ciclo: 0, saliendo: false, reducido };
  return { ...estado, reducido };
}

/** Un número que cuenta de 0 a `valor` cuando `activo` se vuelve verdadero. */
export function useContador(valor: number, activo: boolean, ms = 1100): number {
  const reducido = useReducido();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reducido) return;
    if (!activo) {
      const id = requestAnimationFrame(() => setN(0));
      return () => cancelAnimationFrame(id);
    }
    let id = 0;
    const t0 = performance.now();
    const paso = (ahora: number) => {
      const p = Math.min(1, (ahora - t0) / ms);
      setN(valor * (1 - Math.pow(1 - p, 3)));
      if (p < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [valor, activo, ms, reducido]);
  return reducido ? valor : n;
}

export const pesosEjemplo = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;
