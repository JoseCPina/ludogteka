"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { anularCobro, anularCobroGrupo } from "../../correcciones-actions";

/**
 * Anular un cobro junto: el grupo completo, o la parte de UNA cuenta (el folio y
 * el recibo se recalculan con lo que queda). No se borra nada: queda en el
 * historial del recibo.
 */
export function CorreccionesRecibo({
  grupoId,
  cuentas,
  turnoCerrado,
  puedeTurnosCerrados,
}: {
  grupoId: string;
  cuentas: { cobroId: string; reservaId: string; descripcion: string; anulado: boolean }[];
  turnoCerrado: boolean;
  puedeTurnosCerrados: boolean;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [objetivo, setObjetivo] = useState<null | { tipo: "grupo" } | { tipo: "parte"; cobroId: string; reservaId: string; descripcion: string }>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const vivas = cuentas.filter((c) => !c.anulado);
  if (vivas.length === 0) return null;
  if (aviso) return <p role="status" className="text-sm font-semibold text-menta-oscuro">{aviso}</p>;
  if (turnoCerrado && !puedeTurnosCerrados) {
    return <p className="text-xs text-n-500">Este cobro es de un turno ya cerrado: para anularlo hace falta el permiso «Corregir cobros de turnos cerrados».</p>;
  }

  async function confirmar() {
    setError(null);
    if (motivo.trim().length < 5) return setError("Escribe el motivo: qué pasó con este cobro.");
    if (!objetivo) return;
    const r = await envio.ejecutar(() => (objetivo.tipo === "grupo" ? anularCobroGrupo(grupoId, motivo) : anularCobro(objetivo.cobroId, motivo, objetivo.reservaId)));
    if (r.error) return setError(r.error);
    setAviso(r.aviso ?? "Listo.");
    setObjetivo(null);
    router.refresh();
  }

  return (
    <div data-correcciones-recibo className="flex flex-col gap-3 print:hidden">
      {!objetivo ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variante="secundario" onClick={() => setObjetivo({ tipo: "grupo" })}>
            Anular el cobro junto completo
          </Button>
          {vivas.length > 1 &&
            vivas.map((c) => (
              <Button key={c.cobroId} type="button" variante="secundario" onClick={() => setObjetivo({ tipo: "parte", cobroId: c.cobroId, reservaId: c.reservaId, descripcion: c.descripcion })}>
                Anular solo: {c.descripcion.length > 28 ? `${c.descripcion.slice(0, 28)}…` : c.descripcion}
              </Button>
            ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border-[1.5px] border-ambar bg-ambar-suave p-3">
          <p className="text-sm font-semibold text-ambar-oscuro">
            {objetivo.tipo === "grupo"
              ? `¿Anular el cobro junto completo (${vivas.length} cuentas)? Todas vuelven a quedar por cobrar y el recibo queda anulado.`
              : `¿Anular solo la parte de «${objetivo.descripcion}»? El resto del cobro junto sigue, y el total y el folio se recalculan.`}{" "}
            Nada se borra: queda en el historial.
          </p>
          {turnoCerrado && <p className="text-sm text-ambar-oscuro">Este cobro es de un turno ya cerrado: su corte no cambia y la corrección queda como ajuste en el turno abierto.</p>}
          <Textarea label="Motivo (obligatorio)" rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <AccionesFormulario error={error}>
            <Button type="button" variante="peligro" cargando={envio.cargando} onClick={confirmar}>
              Anular
            </Button>
            <Button type="button" variante="secundario" onClick={() => { setObjetivo(null); setError(null); }}>
              Dejarlo
            </Button>
          </AccionesFormulario>
        </div>
      )}
    </div>
  );
}
