"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelarReserva } from "../reserva-actions";
import { AvisoConflicto } from "@/components/concurrencia/aviso-conflicto";
import type { Conflicto, VersionLeida } from "@/lib/concurrencia/tipos";

export function CancelarReservaBoton({
  reservaId,
  cancelables,
  versiones = [],
}: {
  reservaId: string;
  cancelables: number;
  /** Las versiones de las estancias tal como se leyeron (QA N43). */
  versiones?: VersionLeida[];
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const cargando = useEspera();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [leidas, setLeidas] = useState(versiones);
  const [conflicto, setConflicto] = useState<Conflicto | null>(null);

  async function confirmar(forzar = false) {
    const res = await cargando.ejecutar(() => cancelarReserva(reservaId, { versiones: leidas, forzar }));
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
    const base =
      res.noCancelables > 0
        ? `Se cancelaron ${res.canceladas}. ${res.noCancelables} ya no se podían cancelar (revisa su estado, p. ej. ya hicieron check-in) y no se tocaron.`
        : `Se cancelaron ${res.canceladas}.`;
    setMensaje([base, ...(res.avisos ?? [])].join(" "));
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
    return <p className="text-sm font-semibold text-n-700">{mensaje}</p>;
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
        ¿Cancelar los {cancelables} perro(s) que todavía se pueden cancelar de esta reserva?
      </p>
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
