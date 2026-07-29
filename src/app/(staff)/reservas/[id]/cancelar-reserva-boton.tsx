"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelarReserva } from "../reserva-actions";

export function CancelarReservaBoton({
  reservaId,
  cancelables,
}: {
  reservaId: string;
  cancelables: number;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function confirmar() {
    setCargando(true);
    const res = await cancelarReserva(reservaId);
    setCargando(false);
    setConfirmando(false);
    if (res.error) {
      setMensaje(res.error);
      return;
    }
    setMensaje(
      res.noCancelables > 0
        ? `Se cancelaron ${res.canceladas}. ${res.noCancelables} ya no se podían cancelar (revisa su estado, p. ej. ya hicieron check-in) y no se tocaron.`
        : `Se cancelaron ${res.canceladas}.`
    );
    router.refresh();
  }

  if (mensaje) {
    return <p className="text-sm font-semibold text-n-700">{mensaje}</p>;
  }

  if (!confirmando) {
    return (
      <Button type="button" variante="peligro" onClick={() => setConfirmando(true)}>
        Cancelar toda la reserva
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-naranja bg-naranja-suave p-3">
      <p className="text-sm font-semibold text-naranja-oscuro">
        ¿Cancelar los {cancelables} perro(s) que todavía se pueden cancelar de esta reserva?
      </p>
      <div className="flex gap-2">
        <Button type="button" variante="peligro" disabled={cargando} onClick={confirmar}>
          {cargando ? "Cancelando…" : "Sí, cancelar todo"}
        </Button>
        <Button type="button" variante="secundario" onClick={() => setConfirmando(false)}>
          No
        </Button>
      </div>
    </div>
  );
}
