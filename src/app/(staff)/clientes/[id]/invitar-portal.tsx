"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearFecha } from "@/lib/formato";
import { useZonaNegocio } from "@/components/zona-negocio";
import { invitarAlPortal, type EstadoInvitarPortal } from "./portal-actions";

/** El botón «Invitar al portal» de la ficha del cliente (solo si todavía no tiene cuenta). */
export function InvitarPortal({ clienteId, clienteNombre, tieneCuenta }: { clienteId: string; clienteNombre: string; tieneCuenta: boolean }) {
  const zona = useZonaNegocio();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EstadoInvitarPortal | null>(null);

  if (tieneCuenta) return null;

  async function generar() {
    setError(null);
    const res = await envio.ejecutar(() => invitarAlPortal(clienteId));
    if (res.error) return setError(res.error);
    setResultado(res);
  }

  return (
    <div id="invitar-portal" className="flex flex-col gap-3 border-t border-n-200 pt-6">
      <h2 className="text-lg font-bold text-n-900">Invitar al portal</h2>
      <p className="text-n-600">
        {clienteNombre} todavía no tiene cuenta. Mándale un enlace de un solo uso: él escoge su contraseña y entra con su teléfono. Sirve 7 días.
      </p>
      {error && <Alert variante="error" titulo="No se pudo crear la invitación">{error}</Alert>}
      {resultado?.url && (
        <div className="flex flex-col gap-2">
          <CampoCopiable etiqueta="Enlace de invitación" valor={resultado.url} />
          {resultado.expiraAt && <p className="text-sm text-n-600">Vence el {formatearFecha(resultado.expiraAt, zona)}. Se muestra solo ahora: si lo pierdes, genera otro.</p>}
          {resultado.urlWhatsApp && (
            <a href={resultado.urlWhatsApp} target="_blank" rel="noreferrer" className="self-start rounded-md border-[1.5px] border-morado px-4 py-3 font-semibold text-morado hover:bg-morado-suave">
              Mandar por WhatsApp
            </a>
          )}
        </div>
      )}
      <AccionesFormulario error={null}>
        <Button type="button" variante={resultado ? "secundario" : "primario"} cargando={envio.cargando} onClick={generar}>
          {resultado ? "Generar otro enlace" : "Invitar al portal"}
        </Button>
      </AccionesFormulario>
    </div>
  );
}
