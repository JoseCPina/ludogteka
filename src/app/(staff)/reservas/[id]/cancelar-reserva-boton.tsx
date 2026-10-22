"use client";

import { useState, useRef } from "react";
import { useEspera } from "@/hooks/use-espera";
import { esEnterParaConfirmar, valorDelCampo } from "@/lib/ui/campo-vivo";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cancelarReserva } from "../reserva-actions";
import { AvisoConflicto } from "@/components/concurrencia/aviso-conflicto";
import type { Conflicto, VersionLeida } from "@/lib/concurrencia/tipos";
import { unirFrases, unirNombres } from "@/lib/texto/frases";
import { formatearFecha, formatearHoraNegocio } from "@/lib/formato";
import { useZonaNegocio } from "@/components/zona-negocio";

export function CancelarReservaBoton({
  reservaId,
  cancelables,
  nombres = [],
  versiones = [],
  detalle = null,
}: {
  reservaId: string;
  cancelables: number;
  /** QA R23 (N52): los perros que todavía se pueden cancelar, para nombrarlos con la concordancia correcta. */
  nombres?: string[];
  /** Las versiones de las estancias tal como se leyeron (QA N43). */
  versiones?: VersionLeida[];
  /** QA S18 (N52): servicio y fechas de lo que se cancela («Hotel por noche de Luna, 20 oct al 22 oct»). */
  detalle?: string | null;
}) {
  const router = useRouter();
  const zona = useZonaNegocio();
  const quienes = unirNombres(nombres);
  const [confirmando, setConfirmando] = useState(false);
  const cargando = useEspera();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const campoMotivo = useRef<HTMLTextAreaElement>(null);
  const [leidas, setLeidas] = useState(versiones);
  const [conflicto, setConflicto] = useState<Conflicto | null>(null);

  async function confirmar(forzar = false) {
    const motivoFinal = valorDelCampo(campoMotivo, motivo);
    setMotivo(motivoFinal);
    const res = await cargando.ejecutar(() => cancelarReserva(reservaId, { versiones: leidas, forzar }, motivoFinal));
    setConfirmando(false);
    if (res.conflicto) {
      setConflicto(res.conflicto);
      return;
    }
    setConflicto(null);
    if (res.error) {
      setMensaje(res.error);
      return;
    }
    // «Se canceló la reserva de Luna y Max el 19 oct 2026 a las 6:05 p.m.» (un perro o varios).
    const ahora = new Date().toISOString();
    const cuando = `el ${formatearFecha(ahora, zona)} a las ${formatearHoraNegocio(ahora, zona)}`;
    const deQuien = res.canceladas === cancelables && quienes ? ` de ${quienes}` : res.canceladas === 1 ? " de 1 perro" : ` de ${res.canceladas} perros`;
    const base = unirFrases(
      `Se canceló la reserva${deQuien} ${cuando}`,
      res.noCancelables > 0
        ? res.noCancelables === 1
          ? "1 perro ya no se podía cancelar (revisa su estado, p. ej. ya hizo check-in) y no se tocó"
          : `${res.noCancelables} perros ya no se podían cancelar (revisa su estado, p. ej. ya hicieron check-in) y no se tocaron`
        : null,
      motivoFinal.trim() ? `Motivo: ${motivoFinal.trim()}` : null
    );
    setMensaje(unirFrases(base, ...(res.avisos ?? [])));
    router.refresh();
  }

  if (conflicto) {
    return (
      <AvisoConflicto
        conflicto={conflicto}
        registro="esta reserva"
        cargando={cargando.cargando}
        onRecargar={() => setConflicto(null)}
        onGuardarEncima={() => confirmar(true)}
      />
    );
  }

  if (mensaje) {
    return <p className="text-sm font-semibold text-n-700" data-reserva-cancelada-aviso="">{mensaje}</p>;
  }

  if (!confirmando) {
    return (
      <Button type="button" variante="peligro" onClick={() => { setLeidas(versiones); setConfirmando(true); }}>
        Cancelar toda la reserva
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3">
      <p className="text-sm font-semibold text-coral-oscuro">
        {detalle
          ? `¿Cancelar ${detalle}?`
          : cancelables === 1
          ? `¿Cancelar la reserva de ${quienes || "el perro que todavía se puede cancelar"}?`
          : `¿Cancelar la reserva de los ${cancelables} perros${quienes ? ` (${quienes})` : ""}?`}
      </p>
      <Textarea
        label="Motivo (opcional)"
        name="motivo_cancelacion"
        rows={2}
        maxLength={500}
        ref={campoMotivo}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        onKeyDown={(e) => { if (esEnterParaConfirmar(e)) { e.preventDefault(); void confirmar(); } }}
        placeholder="ej. El cliente cambió de fechas"
        ayuda="Queda en la bitácora de la reserva con tu nombre y la hora."
      />
      <div className="flex gap-2">
        <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={() => confirmar()}>
          {cargando.cargando ? "Cancelando…" : "Sí, cancelar todo"}
        </Button>
        <Button type="button" variante="secundario" onClick={() => setConfirmando(false)}>
          No
        </Button>
      </div>
    </div>
  );
}
