"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFecha, formatearFechaCalendario } from "@/lib/formato";
import { crearMedicamento, toggleActivoMedicamento, registrarDosis } from "./medicamento-actions";

export type DosisFila = { id: string; administrado_at: string; omitida: boolean; notas: string | null };

export type MedicamentoFila = {
  id: string;
  medicamento: string;
  dosis: string;
  horario: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  activo: boolean;
  notas: string | null;
  dosisRegistradas: DosisFila[];
};

export function MedicamentosSeccion({
  perroId,
  medicamentos,
  puedeEscribir,
}: {
  perroId: string;
  medicamentos: MedicamentoFila[];
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [registrandoDosisPara, setRegistrandoDosisPara] = useState<string | null>(null);
  const [omitida, setOmitida] = useState(false);
  const [notasDosis, setNotasDosis] = useState("");

  const [medicamento, setMedicamento] = useState("");
  const [dosis, setDosis] = useState("");
  const [horario, setHorario] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [notas, setNotas] = useState("");

  async function agregar() {
    setEnviando(true);
    setError(null);
    const res = await crearMedicamento(perroId, { medicamento, dosis, horario, fechaInicio, fechaFin, notas });
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMedicamento("");
    setDosis("");
    setHorario("");
    setFechaInicio("");
    setFechaFin("");
    setNotas("");
    setAgregando(false);
    router.refresh();
  }

  async function toggleActivo(id: string, activoActual: boolean) {
    setError(null);
    const res = await toggleActivoMedicamento(id, perroId, !activoActual);
    if (res.error) setError(res.error);
    router.refresh();
  }

  async function confirmarDosis(perroMedicamentoId: string) {
    setEnviando(true);
    setError(null);
    const res = await registrarDosis(perroMedicamentoId, perroId, omitida, notasDosis);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setRegistrandoDosisPara(null);
    setOmitida(false);
    setNotasDosis("");
    router.refresh();
  }

  const ordenados = [...medicamentos].sort((a, b) => Number(b.activo) - Number(a.activo));

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
        </Alert>
      )}

      {ordenados.length === 0 ? (
        <p className="text-n-600">Este perro no tiene medicamentos registrados.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ordenados.map((m) => (
            <li key={m.id} className={`rounded-lg border-[1.5px] p-4 ${m.activo ? "border-n-200 bg-white" : "border-n-200 bg-n-50 opacity-70"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-n-900">{m.medicamento}</span>
                  <span className="ml-2 text-n-700">{m.dosis}</span>
                  {m.horario && <span className="ml-2 text-sm text-n-500">· {m.horario}</span>}
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    m.activo ? "bg-verde-suave text-verde-oscuro" : "bg-n-100 text-n-600"
                  }`}
                >
                  {m.activo ? "Activo" : "Inactivo"}
                </span>
              </div>
              <p className="mt-1 text-sm text-n-600">
                Desde {formatearFechaCalendario(m.fecha_inicio)}
                {m.fecha_fin ? ` hasta ${formatearFechaCalendario(m.fecha_fin)}` : ""}
              </p>
              {m.notas && <p className="mt-1 text-sm text-n-700">{m.notas}</p>}

              {puedeEscribir && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.activo && (
                    <Button type="button" variante="secundario" onClick={() => setRegistrandoDosisPara(m.id)}>
                      Registrar dosis
                    </Button>
                  )}
                  <Button type="button" variante="secundario" onClick={() => toggleActivo(m.id, m.activo)}>
                    {m.activo ? "Marcar inactivo" : "Reactivar"}
                  </Button>
                </div>
              )}

              {registrandoDosisPara === m.id && (
                <div className="mt-3 flex flex-col gap-2 rounded-md border border-n-200 bg-n-50 p-3">
                  <label className="flex items-center gap-2 text-n-900">
                    <input
                      type="checkbox"
                      checked={omitida}
                      onChange={(e) => setOmitida(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Se omitió esta dosis
                  </label>
                  <Textarea
                    label={omitida ? "Motivo" : "Notas (opcional)"}
                    value={notasDosis}
                    onChange={(e) => setNotasDosis(e.target.value)}
                    rows={2}
                    disabled={enviando}
                  />
                  <div className="flex gap-2">
                    <Button type="button" disabled={enviando} onClick={() => confirmarDosis(m.id)}>
                      {enviando ? "Guardando…" : "Confirmar"}
                    </Button>
                    <Button
                      type="button"
                      variante="secundario"
                      onClick={() => {
                        setRegistrandoDosisPara(null);
                        setOmitida(false);
                        setNotasDosis("");
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {m.dosisRegistradas.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 border-t border-n-200 pt-2">
                  {m.dosisRegistradas.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-n-600">{formatearFecha(d.administrado_at)}</span>
                      {d.omitida && (
                        <span className="rounded-full bg-naranja-suave px-2 py-0.5 text-xs font-semibold text-naranja-oscuro">
                          Omitida
                        </span>
                      )}
                      {d.notas && <span className="text-n-700">{d.notas}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEscribir &&
        (agregando ? (
          <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
            <Field label="Medicamento" value={medicamento} onChange={(e) => setMedicamento(e.target.value)} disabled={enviando} />
            <Field label="Dosis" value={dosis} onChange={(e) => setDosis(e.target.value)} disabled={enviando} />
            <Field
              label="Horario (opcional)"
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              placeholder="ej. cada 8 horas"
              disabled={enviando}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} disabled={enviando} />
              <Field label="Hasta (opcional)" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} disabled={enviando} />
            </div>
            <Textarea label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} disabled={enviando} />
            <div className="flex gap-2">
              <Button type="button" disabled={enviando} onClick={agregar}>
                {enviando ? "Guardando…" : "Agregar medicamento"}
              </Button>
              <Button type="button" variante="secundario" onClick={() => setAgregando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variante="secundario" className="self-start" onClick={() => setAgregando(true)}>
            Agregar medicamento
          </Button>
        ))}
    </div>
  );
}
