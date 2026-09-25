"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { Alert } from "@/components/ui/alert";
import { restablecerPasswordCliente, type EstadoRestablecer } from "./password-actions";

export function RestablecerPassword({
  clienteId,
  clienteNombre,
  tieneCuenta,
}: {
  clienteId: string;
  clienteNombre: string;
  tieneCuenta: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const ocupado = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EstadoRestablecer | null>(null);

  async function restablecer() {
    setError(null);
    const res = await ocupado.ejecutar(() => restablecerPasswordCliente(clienteId));
    if (res.error) {
      setError(res.error);
      return;
    }
    setConfirmando(false);
    setResultado(res);
  }


  return (
    <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
      <h2 className="text-lg font-bold text-n-900">Contraseña del portal</h2>

      {!tieneCuenta ? (
        <p className="text-n-600">
          {clienteNombre} todavía no tiene cuenta. Mándale un link de alta y la crea él mismo con su
          teléfono.
        </p>
      ) : (
        <>
          <p className="text-n-600">
            Si te escribe por WhatsApp diciendo que la olvidó, restablécela aquí. No hay correo de
            recuperación: su cuenta va con su teléfono.
          </p>

          {error && (
            <Alert variante="error" titulo="No se pudo restablecer">
              {error}
            </Alert>
          )}

          {resultado?.password ? (
            <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-menta bg-menta-suave p-4">
              <p className="font-bold text-menta-oscuro">Contraseña temporal</p>
              <CampoCopiable valor={resultado.password} monoespaciado textoCopiado="Copiada" />
              <p className="text-sm text-menta-oscuro">
                Esto se muestra una sola vez: si cierras la pantalla ya no la puedes volver a ver,
                tendrías que generar otra. Dile que la cambie desde su portal en cuanto entre.
              </p>
              <div className="flex flex-wrap gap-2">
                {resultado.urlWhatsApp && (
                  <a href={resultado.urlWhatsApp} target="_blank" rel="noreferrer">
                    <Button type="button">Mandársela por WhatsApp</Button>
                  </a>
                )}
              </div>
            </div>
          ) : confirmando ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border-[1.5px] border-ambar bg-ambar-suave p-4">
              <p className="w-full text-sm text-ambar-oscuro">
                La contraseña actual de {clienteNombre} deja de servir en ese momento. Si no era él
                quien la pidió, se queda fuera de su portal hasta que le pases la nueva.
              </p>
              <Button type="button" cargando={ocupado.cargando} onClick={restablecer}>
                {ocupado.cargando ? "Restableciendo…" : "Sí, restablecer"}
              </Button>
              <Button type="button" variante="secundario" onClick={() => setConfirmando(false)}>
                No
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variante="secundario"
              className="self-start"
              onClick={() => setConfirmando(true)}
            >
              Restablecer contraseña
            </Button>
          )}
        </>
      )}
    </div>
  );
}
