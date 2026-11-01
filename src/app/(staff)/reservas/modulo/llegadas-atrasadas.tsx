"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useEspera } from "@/hooks/use-espera";
import { useControlVersion, AvisoVersion } from "@/components/concurrencia/use-control-version";
import { formatearFechaCalendario } from "@/lib/formato";
import { marcarNoLlego } from "../reserva-actions";
import { Enlace } from "@/components/ui/enlace";

export type LlegadaAtrasada = {
  id: string;
  reservaId: string;
  perro: string;
  servicio: string;
  fechaEntrada: string;
  version: string | null;
};

// Una reserva cuya entrada ya pasó sin check-in: sigue viva pero no cuenta en la ocupación hasta que se resuelva.
// Desde aquí se marca «No llegó», se hace el check-in tardío (vuelve a contar desde ese momento) o se reprograma.
function Fila({ f }: { f: LlegadaAtrasada }) {
  const ctl = useControlVersion("estancias", f.id, f.version);
  const envio = useEspera();
  const [confirmando, setConfirmando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function noLlego(forzar = false) {
    setError(null);
    const res = await envio.ejecutar(() => marcarNoLlego(f.id, ctl.control(forzar)));
    if (ctl.huboConflicto(res, () => noLlego(true))) return;
    if (res.error) return setError(res.error);
    setHecho(true);
  }

  return (
    <li data-llegada-atrasada={f.id} className="flex flex-col gap-2 rounded-md border border-ambar bg-white px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-n-900">{f.perro}</span>
        <span className="text-xs text-n-500">
          {f.servicio} · entraba el {formatearFechaCalendario(f.fechaEntrada)}
        </span>
      </div>
      {hecho ? (
        <p data-marcada-no-llego className="text-sm text-n-600">Marcada «No llegó».</p>
      ) : (
        <>
          <AvisoVersion ctl={ctl} registro="esta reserva" cargando={envio.cargando} onRecargar={() => setConfirmando(false)} />
          {error && <Alert variante="error" titulo="No se pudo marcar">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Enlace href={`/reservas/estancias/${f.id}/checkin`}>Check-in tardío</Enlace>
            <Enlace href={`/reservas/${f.reservaId}`}>Reprogramar</Enlace>
            {confirmando ? (
              <>
                <Button type="button" variante="peligro" cargando={envio.cargando} onClick={() => noLlego()} data-confirmar-no-llego>
                  Sí, no llegó
                </Button>
                <Button type="button" variante="secundario" disabled={envio.cargando} onClick={() => setConfirmando(false)}>
                  No
                </Button>
              </>
            ) : (
              <Button type="button" variante="secundario" onClick={() => setConfirmando(true)} data-no-llego>
                No llegó
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export function LlegadasAtrasadas({ filas, hayMas }: { filas: LlegadaAtrasada[]; hayMas: boolean }) {
  if (filas.length === 0) return null;
  return (
    <section data-lista="llegadas-atrasadas" className="flex flex-col gap-3 rounded-lg border border-ambar bg-ambar-suave p-4">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-ambar-oscuro">Llegadas atrasadas</h2>
        <p className="mt-1 text-sm text-n-700">
          Su fecha de entrada ya pasó y no hicieron check-in. No cuentan en la ocupación: márcalas «No llegó», haz el check-in tardío o reprográmalas.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {filas.map((f) => (
          <Fila key={f.id} f={f} />
        ))}
      </ul>
      {hayMas && (
        <p className="text-sm text-n-600">
          Hay más. Las ves en el <Enlace href="/reservas/calendario" enTexto>calendario de reservas</Enlace>.
        </p>
      )}
    </section>
  );
}
