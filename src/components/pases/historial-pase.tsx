"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { cargarHistorialPase } from "@/app/(staff)/reservas/pase-ajuste-actions";
import { describirRenglon, type RenglonHistorialPase } from "@/lib/bonos/ajuste";
import { formatearFecha } from "@/lib/formato";
import { useZonaNegocio } from "@/components/zona-negocio";

/** Los ajustes de un pase, del más nuevo al más viejo (nunca se editan). */
export function HistorialPase({ bonoId }: { bonoId: string }) {
  const zona = useZonaNegocio();
  const [renglones, setRenglones] = useState<RenglonHistorialPase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const carga = useEspera();

  async function alternar() {
    if (abierto) return setAbierto(false);
    setAbierto(true);
    if (renglones) return;
    const res = await carga.ejecutar(() => cargarHistorialPase(bonoId));
    if (res.error) return setError(res.error);
    setRenglones(res.renglones);
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="min-h-11 self-start text-sm font-semibold text-morado hover:underline" onClick={alternar}>
        {abierto ? "Ocultar historial de ajustes" : "Ver historial de ajustes"}
      </button>
      {abierto && carga.cargando && <p className="text-sm text-n-600">Cargando…</p>}
      {abierto && error && <p className="text-sm font-semibold text-coral-oscuro">{error}</p>}
      {abierto && renglones && renglones.length === 0 && (
        <p className="text-sm text-n-600">Este pase no tiene ajustes: sus días usados son solo de check-ins reales.</p>
      )}
      {abierto && renglones && renglones.length > 0 && (
        <ul className="flex flex-col gap-2">
          {renglones.map((r) => {
            const d = describirRenglon(r);
            return (
              <li key={r.id} className="rounded-md border border-n-200 bg-white px-3 py-2 text-sm">
                <p className="font-semibold text-n-900">{d.titulo}</p>
                <p className="text-n-700">{d.detalle}</p>
                <p className="text-xs text-n-500">
                  {r.por_nombre} · {formatearFecha(r.cuando, zona)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
