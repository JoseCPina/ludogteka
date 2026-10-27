"use client";

import { useRegistroVivo } from "@/components/concurrencia/registro-vivo";
import { useZonaNegocio } from "@/components/zona-negocio";
import { formatearDiaDeInstante, horaLocalDeInstante } from "@/lib/formato";

/**
 * Día y hora de la cita en el encabezado. QA S39 (N138): si esta pestaña la reprogramó (también al guardar encima),
 * pinta la hora que devolvió la base al momento, sin esperar a que la página se recargue.
 */
export function HoraCitaViva({ citaId, inicio, fin, version }: { citaId: string; inicio: string; fin: string | null; version: string | null }) {
  const zona = useZonaNegocio();
  const vivo = useRegistroVivo("citas_estetica", citaId, { inicio, fin } as Record<string, unknown>, version);
  const i = vivo.inicio as string;
  const f = (vivo.fin as string | null) ?? null;
  return (
    <span data-hora-cita={i}>
      {formatearDiaDeInstante(i, zona)} · {horaLocalDeInstante(i, zona)}
      {f ? ` – ${horaLocalDeInstante(f, zona)}` : ""}
    </span>
  );
}
