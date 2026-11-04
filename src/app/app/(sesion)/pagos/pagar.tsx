"use client";
import { dinero } from "@/lib/dinero";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useAbrirEnlace } from "@/hooks/use-abrir-enlace";
import { pedirLinkPagoApp } from "../negocios/acciones";

/**
 * «Pagar $X»: abre el link de pago AL TOCAR (useAbrirEnlace: la pestaña se abre antes de esperar al servidor; si el
 * navegador no deja, el link queda en pantalla para abrirlo con otro toque). Con un link vivo no se pide nada.
 */
export function Pagar({ negocioId, reservaId, saldo, linkVivo }: { negocioId: string; reservaId: string; saldo: number; linkVivo: string | null }) {
  const envio = useEspera();
  const enlace = useAbrirEnlace();
  const [error, setError] = useState<string | null>(null);
  async function pagar() {
    setError(null);
    if (linkVivo) return enlace.abrir(linkVivo);
    const r = await enlace.abrirTras(() => envio.ejecutar(() => pedirLinkPagoApp(negocioId, reservaId)), (x) => (x.error ? null : x.datos?.url));
    if (r.error) setError(r.error);
  }
  return (
    <div style={{ marginTop: "0.75rem" }}>
      <button type="button" className="apd-boton apd-boton-ancho" aria-busy={envio.cargando || undefined} disabled={envio.cargando} onClick={pagar} data-pagar={reservaId}>
        {envio.cargando ? "Preparando el pago…" : `Pagar ${dinero(saldo)}`}
      </button>
      {enlace.enlace?.bloqueado && (
        <p className="apd-aviso apd-aviso-ambar" role="status" style={{ marginTop: "0.6rem" }}>
          Tu navegador no abrió la página de pago.{" "}
          <a href={enlace.enlace.url} target="_blank" rel="noopener noreferrer" className="apd-enlace" data-link-pago>Ábrela aquí</a>.
        </p>
      )}
      {error && <p className="apd-aviso apd-aviso-error" role="alert" style={{ marginTop: "0.6rem" }}>{error}</p>}
    </div>
  );
}
