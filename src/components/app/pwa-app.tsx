"use client";

import { useEffect, useSyncExternalStore } from "react";

// La app instalable para dueños: registra su service worker (public/sw-app.js), le dice de quién es la sesión (la
// copia sin conexión es de una persona) y avisa arriba cuando no hay señal. Las notificaciones push las maneja el
// mismo service worker; suscribirse se hace desde Avisos (activar-avisos.tsx).
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

export function PwaApp({ usuarioId }: { usuarioId: string | null }) {
  const enLinea = useSyncExternalStore(suscribirConexion, () => navigator.onLine, () => true);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw-app.js", { scope: "/" })
      .then(() => enviarAlSw({ tipo: "sesion", usuario: usuarioId ?? "" }))
      .catch(() => {});
  }, [usuarioId]);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-sin-conexion", !enLinea);
  }, [enLinea]);
  if (enLinea) return null;
  return (
    <div role="status" aria-live="polite" data-testid="aviso-sin-conexion" className="apd-aviso apd-aviso-ambar" style={{ position: "fixed", insetInline: "1rem", top: "calc(0.5rem + env(safe-area-inset-top))", zIndex: 40 }}>
      Sin señal. Estás viendo lo último que se abrió; cuando vuelva, se actualiza solo.
    </div>
  );
}
