"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { aplicarBonoAEstancia } from "../../../bono-actions";

export type EstadoPaseCheckin =
  | { tipo: "cubierto"; descripcion: string }
  | { tipo: "disponible"; descripcion: string; precioDia: number }
  | { tipo: "paga"; precioDia: number }
  | { tipo: "no_aplica" };

// Lo primero que recepción necesita saber al recibir a un perro de
// guardería: viene con pase o paga el día. Y si el dueño tiene pases sin
// aplicar (compró después de reservar), aplicarlos aquí mismo.
export function PaseCheckin({ estanciaId, estado }: { estanciaId: string; estado: EstadoPaseCheckin }) {
  const router = useRouter();
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (estado.tipo === "no_aplica") return null;

  async function aplicar() {
    setAplicando(true);
    setError(null);
    const res = await aplicarBonoAEstancia(estanciaId);
    setAplicando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  if (estado.tipo === "cubierto") {
    return (
      <div className="rounded-lg border-l-4 border-verde bg-verde-suave px-4 py-3">
        <p className="font-bold text-verde-oscuro">Viene con pase</p>
        <p className="text-sm text-verde-oscuro">{estado.descripcion}</p>
      </div>
    );
  }

  if (estado.tipo === "disponible") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-amarillo bg-amarillo-suave px-4 py-3">
        <div>
          <p className="font-bold text-amarillo-oscuro">Tiene pases sin aplicar</p>
          <p className="text-sm text-amarillo-oscuro">
            {estado.descripcion}. Hoy quedó como día suelto (${estado.precioDia.toFixed(2)}).
          </p>
          {error && <p className="mt-1 text-sm font-semibold text-naranja-oscuro">{error}</p>}
        </div>
        <Button type="button" disabled={aplicando} onClick={aplicar}>
          {aplicando ? "Aplicando…" : "Usar el pase para hoy"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-l-4 border-n-300 bg-n-50 px-4 py-3">
      <p className="font-bold text-n-900">Paga el día suelto: ${estado.precioDia.toFixed(2)}</p>
      <p className="text-sm text-n-600">El dueño no tiene pases ni mensualidad vigentes.</p>
    </div>
  );
}
