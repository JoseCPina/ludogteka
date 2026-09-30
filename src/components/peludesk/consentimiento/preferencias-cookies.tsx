"use client";

import { EVENTO_ABRIR_PREFERENCIAS } from "@/lib/peludesk/cookies";

/** El enlace «Preferencias de cookies» del pie: reabre el panel para cambiar o revocar. */
export function BotonPreferenciasCookies({ className = "" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_PREFERENCIAS))}>
      Preferencias de cookies
    </button>
  );
}
