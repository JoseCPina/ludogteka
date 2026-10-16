"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { useZonaNegocio } from "@/components/zona-negocio";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { anularRequisitoAplicado, corregirRequisitoAplicado } from "./requisitos-actions";

export type RequisitoAplicadoFila = {
  id: string;
  fecha_aplicacion: string;
  fecha_vencimiento: string;
  detalle: string | null;
  notas: string | null;
  tipo_etiqueta: string;
  comprobante_url: string | null;
  anulado: boolean;
  anulado_motivo: string | null;
  correcciones: number;
};

function AccionesRegistro({ perroId, fila }: { perroId: string; fila: RequisitoAplicadoFila }) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const [modo, setModo] = useState<"corregir" | "anular" | null>(null);
  const [fecha, setFecha] = useState(fila.fecha_aplicacion);
  const [detalle, setDetalle] = useState(fila.detalle ?? "");
  const [notas, setNotas] = useState(fila.notas ?? "");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actualizando, iniciar] = useTransition();
  const envio = useEspera();

  async function enviar() {
    setError(null);
    const res = await envio.ejecutar(() =>
      modo === "anular"
        ? anularRequisitoAplicado(perroId, fila.id, motivo)
        : corregirRequisitoAplicado(perroId, fila.id, { fechaAplicacion: fecha, detalle, notas, motivo })
    );
    if (res.error) {
      setError(res.error);
      return;
    }
    setModo(null);
    iniciar(() => { router.refresh(); });
  }

  if (!modo) {
    return (
      <div className="flex gap-3 text-sm font-semibold">
        <button type="button" className="text-morado hover:underline" onClick={() => setModo("corregir")}>Corregir</button>
        <button type="button" className="text-coral-oscuro hover:underline" onClick={() => setModo("anular")}>Anular con motivo</button>
      </div>
    );
  }
  return (
    <div className="mt-2 flex max-w-sm flex-col gap-2 rounded-md border border-n-200 bg-white p-3">
      {modo === "corregir" && (
        <>
          <Field label="Fecha de aplicación" name="fecha" type="date" max={hoyNegocio(zona)} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <Field label="Veterinario / producto" name="detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          <Textarea label="Notas" name="notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </>
      )}
      <Textarea
        label={modo === "anular" ? "Motivo de la anulación" : "Motivo de la corrección"}
        name="motivo"
        rows={2}
        required
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        ayuda={modo === "anular" ? "El registro no se borra: queda anulado con este motivo." : "Queda guardado lo que decía antes."}
      />
      <AccionesFormulario error={error}>
        <Button type="button" variante={modo === "anular" ? "peligro" : "primario"} cargando={envio.cargando || actualizando} onClick={enviar}>
          {modo === "anular" ? "Anular registro" : "Guardar corrección"}
        </Button>
        <Button type="button" variante="secundario" onClick={() => { setModo(null); setError(null); }}>Cancelar</Button>
      </AccionesFormulario>
    </div>
  );
}

export function RequisitosHistorial({ filas, perroId, puedeGestionar = false }: { filas: RequisitoAplicadoFila[]; perroId: string; puedeGestionar?: boolean }) {
  if (filas.length === 0) {
    return (
      <p className="text-n-600">Todavía no hay aplicaciones registradas para este perro.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Tipo
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Aplicación
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Vence
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Detalle / notas
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Comprobante
            </th>
            {puedeGestionar && (
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Registro
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.id} data-requisito-id={fila.id} data-anulado={fila.anulado ? "si" : "no"} className={fila.anulado ? "bg-n-50 text-n-500" : undefined}>
              <td className="border-b border-n-200 px-4 py-3 font-semibold text-n-900">
                <span className={fila.anulado ? "line-through" : undefined}>{fila.tipo_etiqueta}</span>
                {fila.anulado && (
                  <span className="mt-1 block text-xs font-semibold text-coral-oscuro no-underline">Anulado: {fila.anulado_motivo}</span>
                )}
                {!fila.anulado && fila.correcciones > 0 && (
                  <span className="mt-1 block text-xs font-normal text-n-500">Corregido {fila.correcciones === 1 ? "una vez" : `${fila.correcciones} veces`}</span>
                )}
              </td>
              <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-900">
                {formatearFechaCalendario(fila.fecha_aplicacion)}
              </td>
              <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-900">
                {formatearFechaCalendario(fila.fecha_vencimiento)}
              </td>
              <td className="border-b border-n-200 px-4 py-3 text-n-600">
                {fila.detalle ?? "—"}
                {fila.notas && <span className="block text-xs italic">{fila.notas}</span>}
              </td>
              <td className="border-b border-n-200 px-4 py-3">
                {fila.comprobante_url ? (
                  <a
                    href={fila.comprobante_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-morado hover:underline"
                  >
                    Ver foto
                  </a>
                ) : (
                  <span className="text-n-400">—</span>
                )}
              </td>
              {puedeGestionar && (
                <td className="border-b border-n-200 px-4 py-3">
                  {fila.anulado ? <span className="text-xs text-n-400">—</span> : <AccionesRegistro perroId={perroId} fila={fila} />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
