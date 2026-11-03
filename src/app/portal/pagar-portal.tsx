"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Enlace } from "@/components/ui/enlace";
import { useEspera } from "@/hooks/use-espera";
import { useAbrirEnlace } from "@/hooks/use-abrir-enlace";
import { dinero } from "@/lib/dinero";
import { pedirLinkPagoPortal } from "./pago-actions";

/** «Pagar $saldo» del portal: abre el link al tocar (useAbrirEnlace); si el navegador no deja, el link queda a la vista. */
export function PagarPortal({ reservaId, saldo }: { reservaId: string; saldo: number }) {
  const envio = useEspera();
  const enlace = useAbrirEnlace();
  const [error, setError] = useState<string | null>(null);
  async function pagar() {
    setError(null);
    const r = await enlace.abrirTras(() => envio.ejecutar(() => pedirLinkPagoPortal(reservaId)), (x) => (x.error ? null : x.datos?.url));
    if (r.error) setError(r.error);
  }
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" cargando={envio.cargando} onClick={pagar} sinBloqueo data-pagar-portal={reservaId}>
        Pagar {dinero(saldo)}
      </Button>
      {enlace.enlace?.bloqueado && (
        <p className="text-sm text-n-700" role="status">
          Tu navegador no abrió la página de pago. <Enlace href={enlace.enlace.url} enTexto>Ábrela aquí</Enlace>.
        </p>
      )}
      {error && <p className="text-sm font-semibold text-coral-oscuro" role="alert">{error}</p>}
    </div>
  );
}
