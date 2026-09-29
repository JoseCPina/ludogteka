"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { devolverConProveedor } from "@/app/(staff)/caja/cobro-integrado-actions";

/**
 * Devolver un cobro que entró por Mercado Pago (terminal o link): el
 * reembolso lo hace Mercado Pago con la cuenta del negocio y, solo si lo
 * acepta, queda la devolución en caja. Total o parcial.
 */
export function DevolucionIntegrada({
  reservaId,
  cobroId,
  disponible,
  simulado,
  onCerrar,
}: {
  reservaId: string;
  cobroId: string;
  disponible: number;
  simulado: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [monto, setMonto] = useState(disponible.toFixed(2));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function devolver() {
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) return setError("El monto a devolver debe ser mayor a cero.");
    if (m > disponible + 0.001) return setError(`Lo más que se puede devolver de este cobro es $${disponible.toFixed(2)}.`);
    if (!motivo.trim()) return setError("Escribe el motivo de la devolución.");
    setError(null);
    setExito(null);
    const res = await envio.ejecutar(() => devolverConProveedor(reservaId, cobroId, m, motivo));
    if (res.error) return setError(res.error);
    setExito(res.aviso ?? "Reembolsado en Mercado Pago y registrado en caja.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-3">
      <p className="text-sm text-n-700">
        Este cobro entró por Mercado Pago. El dinero se le regresa al cliente en su tarjeta o cuenta de Mercado Pago, y la devolución queda en caja
        en el mismo paso. Si Mercado Pago no lo acepta, no se registra nada.
        {simulado ? " (Simulación: no mueve dinero.)" : ""}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label="Monto a devolver" type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </div>
        <p className="pb-2 text-xs text-n-500">Queda por devolver: ${disponible.toFixed(2)}</p>
      </div>
      <Field label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ej. Se canceló una noche ya cobrada" />
      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" variante="peligro" cargando={envio.cargando} onClick={devolver}>
          {envio.cargando ? "Pidiendo el reembolso…" : "Devolver con Mercado Pago"}
        </Button>
        <Button type="button" variante="secundario" onClick={onCerrar}>
          Cerrar
        </Button>
      </AccionesFormulario>
    </div>
  );
}
