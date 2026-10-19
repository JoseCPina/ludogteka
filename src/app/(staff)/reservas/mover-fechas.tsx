"use client";

import { useEffect, useRef, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { AvisoConflicto } from "@/components/concurrencia/aviso-conflicto";
import { sumarDiasFecha } from "@/lib/formato";
import { dinero } from "@/lib/dinero";
import type { Conflicto } from "@/lib/concurrencia/tipos";
import { cotizarFechas, moverFechas, type VistaPreviaFechas } from "./reserva-actions";

/**
 * Mover las fechas de una estancia (QA N43): la versión del registro se toma AL ABRIR este formulario, la vista
 * previa dice en cuánto queda la cuenta antes de guardar, y «Guardar fechas» solo se activa con esa vista previa
 * de las fechas que están escritas. Si alguien cambió la reserva mientras tanto, no se guarda y se avisa.
 */
export function MoverFechas({
  estanciaId,
  esGuarderia,
  entrada,
  salida,
  version,
  soloSalida = false,
  textoBoton = "Guardar fechas",
  onHecho,
  onCancelar,
}: {
  estanciaId: string;
  esGuarderia: boolean;
  entrada: string;
  salida: string;
  /** updated_at de la estancia tal como la leyó la pantalla. */
  version: string | null;
  /** Extender en el check-out: solo se mueve la salida. */
  soloSalida?: boolean;
  textoBoton?: string;
  onHecho: (r: { entrada: string; salida: string; version: string | null }) => void;
  onCancelar: () => void;
}) {
  const envio = useEspera();
  const [versionLeida] = useState(version);
  const [nuevaEntrada, setNuevaEntrada] = useState(entrada);
  const [nuevaSalida, setNuevaSalida] = useState(soloSalida ? sumarDiasFecha(salida, 1) : salida);
  const [vista, setVista] = useState<(VistaPreviaFechas & { clave: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<Conflicto | null>(null);
  const salidaFinal = esGuarderia ? sumarDiasFecha(nuevaEntrada, 1) : nuevaSalida;
  const clave = `${nuevaEntrada}|${salidaFinal}`;
  const pedida = useRef("");

  useEffect(() => {
    if (!nuevaEntrada || !salidaFinal || salidaFinal <= nuevaEntrada) return;
    if (pedida.current === clave) return;
    pedida.current = clave;
    const t = setTimeout(async () => {
      const r = await cotizarFechas(estanciaId, nuevaEntrada, salidaFinal).catch(() => ({ error: "No pudimos calcular el total. Intenta de nuevo." }) as VistaPreviaFechas);
      if (pedida.current === clave) setVista({ ...r, clave });
    }, 350);
    return () => clearTimeout(t);
  }, [clave, estanciaId, nuevaEntrada, salidaFinal]);

  const vistaVigente = vista && vista.clave === clave ? vista : null;
  const sinCambio = nuevaEntrada === entrada && salidaFinal === salida;
  const listo = !!vistaVigente && !vistaVigente.error && !sinCambio;

  async function guardar(forzar = false) {
    setError(null);
    if (!vistaVigente || vistaVigente.error) return setError(vistaVigente?.error ?? "Espera la vista previa del total.");
    const res = await envio.ejecutar(() =>
      moverFechas(estanciaId, nuevaEntrada, salidaFinal, {
        totalVisto: vistaVigente.totalDespues ?? 0,
        versiones: versionLeida ? [{ t: "estancias", i: estanciaId, v: versionLeida }] : [],
        forzar,
      })
    );
    if (res.conflicto) return setConflicto(res.conflicto);
    if (res.error) return setError(res.error);
    setConflicto(null);
    onHecho({ entrada: nuevaEntrada, salida: salidaFinal, version: res.version ?? null });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-3" data-mover-fechas>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!soloSalida && (
          <Field label={esGuarderia ? "Nueva fecha" : "Nueva entrada"} type="date" value={nuevaEntrada} onChange={(e) => setNuevaEntrada(e.target.value)} />
        )}
        {!esGuarderia && (
          <Field label={soloSalida ? "Nueva salida" : "Nueva salida"} type="date" value={nuevaSalida} min={nuevaEntrada} onChange={(e) => setNuevaSalida(e.target.value)} />
        )}
      </div>
      <div data-vista-previa-fechas className="text-sm text-n-700" aria-live="polite">
        {sinCambio ? (
          <span>Escoge las fechas nuevas.</span>
        ) : !vistaVigente ? (
          <span>Calculando el total…</span>
        ) : vistaVigente.error ? (
          <span className="text-coral-oscuro">{vistaVigente.error}</span>
        ) : (
          <span>
            Total de la cuenta: <b>{dinero(vistaVigente.totalAntes ?? 0)}</b> → <b data-total-despues={vistaVigente.totalDespues}>{dinero(vistaVigente.totalDespues ?? 0)}</b>
            {" · "}Saldo: {dinero(vistaVigente.saldoAntes ?? 0)} → <b>{dinero(vistaVigente.saldoDespues ?? 0)}</b>
          </span>
        )}
      </div>
      {conflicto && (
        <AvisoConflicto
          conflicto={conflicto}
          registro="esta reserva"
          cargando={envio.cargando}
          onRecargar={() => {
            setConflicto(null);
            onCancelar();
          }}
          onGuardarEncima={() => guardar(true)}
        />
      )}
      <AccionesFormulario error={error}>
        <Button type="button" cargando={envio.cargando} disabled={!listo || !!conflicto} onClick={() => guardar(false)} data-guardar-fechas>
          {textoBoton}
        </Button>
        <Button type="button" variante="secundario" onClick={onCancelar}>
          Dejarlas
        </Button>
      </AccionesFormulario>
    </div>
  );
}
