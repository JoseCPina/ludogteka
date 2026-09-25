"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { aplicarBonoAEstancia } from "../../../bono-actions";

export type EstadoPaseCheckin =
  | { tipo: "cubierto"; descripcion: string }
  | { tipo: "disponible"; descripcion: string; precioDia: number }
  | { tipo: "paga"; precioDia: number }
  | { tipo: "no_aplica" };

// Lo primero que recepción necesita saber al recibir a un perro de
// guardería: viene con pase o paga el día. Y si ESTE perro tiene pases sin
// aplicar (se compraron después de reservar), aplicarlos aquí mismo. El
// paquete es por perro: el de otro perro del mismo dueño no cuenta.
export function PaseCheckin({ estanciaId, estado }: { estanciaId: string; estado: EstadoPaseCheckin }) {
  const router = useRouter();
  const aplicando = useEspera();
  const [error, setError] = useState<string | null>(null);

  if (estado.tipo === "no_aplica") return null;

  async function aplicar() {
    setError(null);
    const res = await aplicando.ejecutar(() => aplicarBonoAEstancia(estanciaId));
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  if (estado.tipo === "cubierto") {
    return (
      <div className="rounded-lg border-l-4 border-menta bg-menta-suave px-4 py-3">
        <p className="font-bold text-menta-oscuro">Viene con pase</p>
        <p className="text-sm text-menta-oscuro">{estado.descripcion}</p>
      </div>
    );
  }

  if (estado.tipo === "disponible") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-4 border-ambar bg-ambar-suave px-4 py-3">
        <div>
          <p className="font-bold text-ambar-oscuro">Tiene pases sin aplicar</p>
          <p className="text-sm text-ambar-oscuro">
            {estado.descripcion}. Hoy quedó como día suelto (${estado.precioDia.toFixed(2)}).
          </p>
          {error && <p className="mt-1 text-sm font-semibold text-coral-oscuro">{error}</p>}
        </div>
        <Button type="button" cargando={aplicando.cargando} onClick={aplicar}>
          {aplicando.cargando ? "Aplicando…" : "Usar el pase para hoy"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-l-4 border-n-300 bg-n-50 px-4 py-3">
      <p className="font-bold text-n-900">Paga el día suelto: ${estado.precioDia.toFixed(2)}</p>
      <p className="text-sm text-n-600">Este perro no tiene pases ni mensualidad vigentes (el paquete es por perro).</p>
    </div>
  );
}
