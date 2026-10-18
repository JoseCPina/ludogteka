"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// La app instalable del negocio: registra el service worker, avisa cuando no hay conexión,
// y NO deja escribir nada sin conexión (las acciones de la app son peticiones POST: se
// detienen antes de salir, con un mensaje claro, en vez de quedarse esperando).
//
// Se monta en el layout del personal y en el del portal con el id de la persona: el
// service worker guarda copia de las pantallas de consulta para UNA persona y la borra
// si cambia la sesión.
//
// Nada de esto flota abajo (QA N26): el aviso de «no se guardó» sale arriba, y «Instalar la app» vive en
// instalar.tsx (aviso cerrable en el flujo + opción del menú).

export const MENSAJE_SIN_CONEXION = "Sin conexión: no se guardó nada. Vuelve a intentarlo cuando regrese la señal.";

// Pantallas que se precargan al entrar para tenerlas sin conexión (las que el SW sabe guardar).
const PRECARGAR = ["/recepcion", "/estetica"];

function enviarAlSw(mensaje: Record<string, unknown>) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then((r) => r.active?.postMessage(mensaje)).catch(() => {});
}

function suscribirConexion(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

// ¿Esta pantalla la entregó el service worker desde su copia? Entonces NO hay conexión,
// diga lo que diga navigator.onLine (por ejemplo, un wifi sin internet).
function leerDesdeCopia(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return Boolean(nav?.serverTiming?.some((s) => s.name === "desde-copia"));
  } catch {
    return false;
  }
}
const sinSuscripcion = () => () => {};

export function PwaNegocio({ usuarioId, precargar = true }: { usuarioId: string; precargar?: boolean }) {
  const onLine = useSyncExternalStore(suscribirConexion, () => navigator.onLine, () => true);
  const desdeCopia = useSyncExternalStore(sinSuscripcion, leerDesdeCopia, () => false);
  const [reconectado, setReconectado] = useState(false);
  const enLinea = onLine && (!desdeCopia || reconectado);
  const sinConexionRef = useRef(false);
  useEffect(() => {
    sinConexionRef.current = !enLinea;
  });
  const [volvio, setVolvio] = useState(false);
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  const tempBloqueo = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Registro del service worker y su aviso de quién es la sesión.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let vivo = true;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => {
        if (!vivo) return;
        enviarAlSw({ tipo: "sesion", usuario: usuarioId });
        if (precargar && navigator.onLine && !leerDesdeCopia()) {
          // Una vez que el SW ya controla la página, se piden las pantallas de consulta del día.
          setTimeout(() => enviarAlSw({ tipo: "precargar", urls: PRECARGAR }), 2500);
        }
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [usuarioId, precargar]);

  // Estado de la conexión.
  useEffect(() => {
    const alVolver = () => {
      setReconectado(true);
      setVolvio(true);
      setTimeout(() => setVolvio(false), 5000);
    };
    const alPerder = () => setVolvio(false);
    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alPerder);
    return () => {
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alPerder);
    };
  }, []);

  // Marca en la página: cualquier estilo o prueba puede saber que no hay conexión.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-sin-conexion", !enLinea);
  }, [enLinea]);

  // Nada se escribe sin conexión: se cortan los envíos (formularios y acciones) antes de salir.
  useEffect(() => {
    const avisar = () => {
      setBloqueo(MENSAJE_SIN_CONEXION);
      if (tempBloqueo.current) clearTimeout(tempBloqueo.current);
      tempBloqueo.current = setTimeout(() => setBloqueo(null), 6000);
    };
    const alEnviar = (e: Event) => {
      if (navigator.onLine && !sinConexionRef.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      avisar();
    };
    document.addEventListener("submit", alEnviar, true);
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
      const metodo = (init?.method ?? (entrada instanceof Request ? entrada.method : "GET")).toUpperCase();
      if ((!navigator.onLine || sinConexionRef.current) && metodo !== "GET" && metodo !== "HEAD") {
        avisar();
        return Promise.reject(new Error(MENSAJE_SIN_CONEXION));
      }
      return fetchOriginal(entrada, init);
    };
    return () => {
      document.removeEventListener("submit", alEnviar, true);
      window.fetch = fetchOriginal;
    };
  }, []);

  return (
    <>
      {!enLinea && (
        <div
          role="status"
          aria-live="polite"
          data-testid="aviso-sin-conexion"
          className="fixed inset-x-0 top-0 z-[60] bg-ambar-suave px-4 py-2 text-center text-sm font-semibold text-ambar-oscuro shadow"
        >
          Sin conexión. Estás viendo lo último que se abrió: sirve para consultar, pero no se puede guardar nada hasta que vuelva la señal.
        </div>
      )}
      {enLinea && volvio && (
        <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-[60] bg-menta-suave px-4 py-2 text-center text-sm font-semibold text-menta-oscuro shadow">
          Volvió la conexión. Recarga la pantalla para ver lo más nuevo.
        </div>
      )}
      {bloqueo && (
        <div role="alert" data-testid="aviso-sin-guardar" className="fixed inset-x-4 top-12 z-[60] mx-auto max-w-md rounded-lg border border-coral bg-coral-suave p-3 text-sm font-semibold text-coral-oscuro shadow-lg">
          {bloqueo}
        </div>
      )}
    </>
  );
}

/** En /login: borra las copias que el service worker tenía de la sesión anterior. */
export function LimpiarCopiasSinConexion() {
  useEffect(() => {
    enviarAlSw({ tipo: "limpiar" });
  }, []);
  return null;
}
