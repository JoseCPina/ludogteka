import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { ErrorDeRed, llamar } from "./api";

/**
 * Lo que pinta una pantalla: una petición por pantalla (/api/movil/<accion>), que se vuelve a pedir al regresar a la
 * pantalla (gesto de regreso o pestaña) y al jalar hacia abajo.
 */
export function usePantalla<T>(accion: string, args: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const clave = JSON.stringify(args);
  const primera = useRef(true);

  const pedir = useCallback(
    async (modo: "inicial" | "refresco" | "silencio") => {
      if (modo === "refresco") setRefrescando(true);
      try {
        const r = await llamar<T & { error: string | null }>(accion, JSON.parse(clave) as unknown[]);
        if (r.error) setError(r.error);
        else {
          setError(null);
          setDatos(r as T);
        }
      } catch (e) {
        setError(e instanceof ErrorDeRed ? e.message : "Algo falló. Intenta de nuevo.");
      } finally {
        setCargando(false);
        setRefrescando(false);
      }
    },
    [accion, clave]
  );

  useFocusEffect(
    useCallback(() => {
      pedir(primera.current ? "inicial" : "silencio");
      primera.current = false;
    }, [pedir])
  );

  return { datos, error, cargando, refrescando, refrescar: () => pedir("refresco"), recargar: () => pedir("silencio"), setDatos };
}

/**
 * Una acción que escribe: con su estado de espera, háptica de éxito o de error y el mensaje de la base tal cual.
 * Nunca se queda colgada: la petición tiene tope (api.ts).
 */
export function useAccion() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vivo = useRef(true);
  useEffect(() => () => void (vivo.current = false), []);

  const ejecutar = useCallback(async <R extends { error: string | null }>(fn: () => Promise<R>): Promise<R | null> => {
    setOcupado(true);
    setError(null);
    try {
      const r = await fn();
      if (r.error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        if (vivo.current) setError(r.error);
      } else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return r;
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      if (vivo.current) setError(e instanceof ErrorDeRed ? e.message : "Algo falló. Intenta de nuevo.");
      return null;
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }, []);

  return { ocupado, error, setError, ejecutar };
}
