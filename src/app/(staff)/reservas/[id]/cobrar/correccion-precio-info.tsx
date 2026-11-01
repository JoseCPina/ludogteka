"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { anularCorreccionPrecio } from "@/app/(staff)/caja/correcciones-actions";
import { useZonaNegocio } from "@/components/zona-negocio";
import { formatearFecha, formatearHoraNegocio } from "@/lib/formato";
import { dinero } from "@/lib/dinero";
import type { TotalesCuenta } from "@/lib/cobro/totales";

/** Una corrección de precio de una línea (vigente o ya no). */
export type CorreccionPrecio = {
  id: string;
  lineaTipo: string;
  lineaId: string;
  monto: number;
  precioAntes: number;
  precioDespues: number;
  precioOriginal: number;
  motivo: string;
  porNombre: string;
  creadaEn: string;
  vigente: boolean;
  bajaMotivo: string | null;
  bajaPorNombre: string | null;
  bajaEn: string | null;
};

/**
 * QA S17 (N48): una línea tiene a lo más UNA corrección vigente (el ajuste neto contra su precio original). Aquí se
 * ve el precio vigente, el historial completo de la línea y se anula la corrección con motivo.
 */
export function CorreccionPrecioInfo({
  correccion,
  historial,
  reservaId,
  puedeAnular,
  alAnular,
}: {
  correccion: CorreccionPrecio;
  historial: CorreccionPrecio[];
  reservaId: string;
  puedeAnular: boolean;
  alAnular: (totales?: TotalesCuenta) => void;
}) {
  const zona = useZonaNegocio();
  const envio = useEspera();
  const [verHistorial, setVerHistorial] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function anular() {
    setError(null);
    if (motivo.trim().length < 5) return setError("Escribe el motivo: por qué se anula la corrección.");
    const r = await envio.ejecutar(() => anularCorreccionPrecio(correccion.id, motivo, reservaId));
    if (r.error) return setError(r.error);
    setAnulando(false);
    setMotivo("");
    alAnular(r.totales);
  }

  return (
    <div className="mt-1 flex flex-col gap-1.5" data-correccion-precio={correccion.id}>
      <p className="text-xs text-n-600">
        Precio original {dinero(correccion.precioOriginal)} · vigente <b className="text-n-900">{dinero(correccion.precioDespues)}</b> · {correccion.porNombre},{" "}
        {formatearFecha(correccion.creadaEn, zona)} {formatearHoraNegocio(correccion.creadaEn, zona)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setVerHistorial((v) => !v)} data-ver-historial-precio variante="secundario" tamano="compacto">
          {verHistorial ? "Ocultar historial" : "Ver historial"}
        </Button>
        {puedeAnular && !anulando && (
          <Button type="button" onClick={() => setAnulando(true)} data-anular-correccion variante="secundario" tamano="compacto">
            Anular corrección
          </Button>
        )}
      </div>
      {verHistorial && (
        <ol className="flex flex-col gap-1 rounded-md bg-n-50 p-2 text-xs text-n-700" data-historial-precio>
          {historial.map((h) => (
            <li key={h.id} className={h.vigente ? "font-semibold text-n-900" : ""}>
              {dinero(h.precioAntes)} → {dinero(h.precioDespues)} · {h.motivo} · {h.porNombre}, {formatearFecha(h.creadaEn, zona)} {formatearHoraNegocio(h.creadaEn, zona)}
              {h.vigente ? " · vigente" : h.bajaMotivo ? ` · ${h.bajaMotivo}${h.bajaPorNombre ? ` (${h.bajaPorNombre}${h.bajaEn ? `, ${formatearFecha(h.bajaEn, zona)}` : ""})` : ""}` : ""}
            </li>
          ))}
        </ol>
      )}
      {anulando && (
        <div className="flex flex-col gap-2 rounded-md border border-coral bg-white p-3">
          <p className="text-sm text-n-800">La línea vuelve a su precio original ({dinero(correccion.precioOriginal)}). La corrección queda en el historial.</p>
          <Textarea label="Motivo (obligatorio)" rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <AccionesFormulario error={error}>
            <Button type="button" variante="peligro" cargando={envio.cargando} onClick={anular} data-confirmar-anular-correccion>
              Anular corrección
            </Button>
            <Button type="button" variante="secundario" onClick={() => { setAnulando(false); setError(null); }}>
              Dejarla
            </Button>
          </AccionesFormulario>
        </div>
      )}
    </div>
  );
}
