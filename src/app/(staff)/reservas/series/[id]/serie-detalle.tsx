"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario } from "@/lib/formato";
import { cancelarEstancia } from "../../reserva-actions";
import {
  renovarHorizonte,
  editarSerie,
  pausarSerie,
  quitarPausa,
  cancelarSerie,
  type ResultadoFecha,
} from "../../series-actions";
import { DIAS_SEMANA, formatearDiasSemana } from "../dias-semana";

type Servicio = { id: string; nombre: string; categoria: string };
type Estancia = { id: string; fechaEntrada: string; estado: string };
type Pausa = { id: string; desde: string; hasta: string; motivo: string | null };

const ETIQUETA_ESTADO: Record<string, string> = {
  reservada: "Reservada",
  confirmada: "Confirmada",
  en_curso: "En curso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
  no_llego: "No llegó",
};

const ESTILO_ESTADO: Record<string, string> = {
  reservada: "bg-n-100 text-n-700",
  confirmada: "bg-azul-suave text-azul",
  en_curso: "bg-verde-suave text-verde-oscuro",
  finalizada: "bg-n-100 text-n-600",
  cancelada: "bg-naranja-suave text-naranja-oscuro",
  no_llego: "bg-naranja-suave text-naranja-oscuro",
};

function ResumenGeneracion({ resultados }: { resultados: ResultadoFecha[] }) {
  const creadas = resultados.filter((r) => r.exito);
  const noCupieron = resultados.filter((r) => !r.exito);
  if (resultados.length === 0) {
    return <p className="text-sm text-n-600">No había fechas nuevas que generar en este horizonte.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {creadas.length > 0 && (
        <p className="text-sm text-verde-oscuro">
          Se generaron {creadas.length} fecha{creadas.length === 1 ? "" : "s"}:{" "}
          {creadas.map((r) => formatearFechaCalendario(r.fecha)).join(", ")}
        </p>
      )}
      {noCupieron.length > 0 && (
        <div className="rounded-md border-[1.5px] border-naranja bg-naranja-suave p-3">
          <p className="text-sm font-semibold text-naranja-oscuro">No cupieron:</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-naranja-oscuro">
            {noCupieron.map((r) => (
              <li key={r.fecha}>
                {formatearFechaCalendario(r.fecha)}: {r.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SerieDetalle({
  serieId,
  servicioId,
  diasSemana,
  fechaInicio,
  fechaFin,
  cancelada,
  servicios,
  estancias,
  pausas,
  hoy,
}: {
  serieId: string;
  servicioId: string;
  diasSemana: number[];
  fechaInicio: string;
  fechaFin: string | null;
  cancelada: boolean;
  servicios: Servicio[];
  estancias: Estancia[];
  pausas: Pausa[];
  hoy: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const [resultadosRenovar, setResultadosRenovar] = useState<ResultadoFecha[] | null>(null);

  const [editando, setEditando] = useState(false);
  const [confirmandoEditar, setConfirmandoEditar] = useState(false);
  const [diasEdit, setDiasEdit] = useState<number[]>(diasSemana);
  const [servicioEdit, setServicioEdit] = useState(servicioId);
  const [tieneFinEdit, setTieneFinEdit] = useState(Boolean(fechaFin));
  const [fechaFinEdit, setFechaFinEdit] = useState(fechaFin ?? hoy);
  const [resultadosEditar, setResultadosEditar] = useState<{ canceladas: number; resultados: ResultadoFecha[] } | null>(
    null
  );

  const [pausando, setPausando] = useState(false);
  const [pausaDesde, setPausaDesde] = useState(hoy);
  const [pausaHasta, setPausaHasta] = useState(hoy);
  const [pausaMotivo, setPausaMotivo] = useState("");

  const [confirmandoCancelarSerie, setConfirmandoCancelarSerie] = useState(false);
  const [serieCanceladaLocal, setSerieCanceladaLocal] = useState(false);
  const serieCancelada = cancelada || serieCanceladaLocal;

  const [cancelandoDia, setCancelandoDia] = useState<string | null>(null);

  const afectadasPorEdicion = estancias.filter(
    (e) => (e.estado === "reservada" || e.estado === "confirmada") && e.fechaEntrada >= hoy
  ).length;

  function alternarDiaEdit(dia: number) {
    setDiasEdit((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia].sort()));
  }

  async function accionRenovar() {
    setCargando(true);
    setError(null);
    const res = await renovarHorizonte(serieId);
    setCargando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResultadosRenovar(res.resultados);
    router.refresh();
  }

  async function accionGuardarEdicion() {
    setCargando(true);
    setError(null);
    const res = await editarSerie(serieId, diasEdit, servicioEdit, tieneFinEdit ? fechaFinEdit : null);
    setCargando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResultadosEditar({ canceladas: res.canceladas, resultados: res.resultados });
    setConfirmandoEditar(false);
    setEditando(false);
    router.refresh();
  }

  async function accionPausar() {
    setCargando(true);
    setError(null);
    const res = await pausarSerie(serieId, pausaDesde, pausaHasta, pausaMotivo);
    setCargando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setPausando(false);
    setPausaMotivo("");
    router.refresh();
  }

  async function accionQuitarPausa(pausaId: string) {
    setCargando(true);
    setError(null);
    const res = await quitarPausa(serieId, pausaId);
    setCargando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function accionCancelarSerie() {
    setCargando(true);
    setError(null);
    const res = await cancelarSerie(serieId);
    setCargando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSerieCanceladaLocal(true);
    setConfirmandoCancelarSerie(false);
    router.refresh();
  }

  async function accionCancelarDia(estanciaId: string) {
    setCancelandoDia(estanciaId);
    setError(null);
    const res = await cancelarEstancia(estanciaId);
    setCancelandoDia(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  const proximas = estancias.filter((e) => e.fechaEntrada >= hoy);
  const pasadas = estancias.filter((e) => e.fechaEntrada < hoy);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
        </Alert>
      )}

      {serieCancelada && (
        <Alert variante="advertencia" titulo="Esta serie está cancelada">
          Ya no se generarán fechas nuevas. Las estancias que ya tenían check-in o ya pasaron se conservan tal cual.
        </Alert>
      )}

      <div className="rounded-lg border border-n-200 bg-white p-4">
        <p className="text-sm text-n-600">Patrón actual</p>
        <p className="font-bold text-n-900">
          {servicios.find((s) => s.id === servicioId)?.nombre ?? "—"} · {formatearDiasSemana(diasSemana)}
        </p>
        <p className="text-sm text-n-600">
          Desde {formatearFechaCalendario(fechaInicio)}
          {fechaFin ? ` hasta ${formatearFechaCalendario(fechaFin)}` : ", sin fecha de fin"}
        </p>
      </div>

      {pausas.length > 0 && (
        <div className="rounded-lg border border-n-200 bg-n-50 p-4">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-n-600">Pausas registradas</p>
          <ul className="flex flex-col gap-2">
            {pausas.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-n-700">
                  {formatearFechaCalendario(p.desde)} – {formatearFechaCalendario(p.hasta)}
                  {p.motivo ? ` · ${p.motivo}` : ""}
                </span>
                <Button type="button" variante="secundario" disabled={cargando} onClick={() => accionQuitarPausa(p.id)}>
                  Quitar pausa
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!serieCancelada && (
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={cargando} onClick={accionRenovar}>
            {cargando ? "Renovando…" : "Renovar horizonte (8 semanas)"}
          </Button>
          <Button type="button" variante="secundario" onClick={() => setEditando((v) => !v)}>
            {editando ? "Cancelar edición" : "Editar patrón"}
          </Button>
          <Button type="button" variante="secundario" onClick={() => setPausando((v) => !v)}>
            {pausando ? "Cancelar pausa" : "Pausar (vacaciones)"}
          </Button>
          <Button type="button" variante="peligro" onClick={() => setConfirmandoCancelarSerie(true)}>
            Cancelar serie completa
          </Button>
        </div>
      )}

      {resultadosRenovar && (
        <div className="rounded-lg border border-n-200 bg-white p-4">
          <p className="mb-2 font-semibold text-n-900">Resultado de renovar horizonte</p>
          <ResumenGeneracion resultados={resultadosRenovar} />
        </div>
      )}

      {resultadosEditar && (
        <div className="rounded-lg border border-n-200 bg-white p-4">
          <p className="mb-2 font-semibold text-n-900">
            Patrón actualizado — se cancelaron {resultadosEditar.canceladas} estancia
            {resultadosEditar.canceladas === 1 ? "" : "s"} futura{resultadosEditar.canceladas === 1 ? "" : "s"} sin
            iniciar y se regeneraron con el patrón nuevo:
          </p>
          <ResumenGeneracion resultados={resultadosEditar.resultados} />
        </div>
      )}

      {confirmandoCancelarSerie && (
        <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-naranja bg-naranja-suave p-4">
          <p className="font-semibold text-naranja-oscuro">
            ¿Cancelar toda la serie? Se cancelarán {afectadasPorEdicion} estancia
            {afectadasPorEdicion === 1 ? "" : "s"} futura{afectadasPorEdicion === 1 ? "" : "s"} sin iniciar. Las que
            ya tienen check-in o ya pasaron no se tocan.
          </p>
          <div className="flex gap-2">
            <Button type="button" variante="peligro" disabled={cargando} onClick={accionCancelarSerie}>
              {cargando ? "Cancelando…" : "Sí, cancelar la serie"}
            </Button>
            <Button type="button" variante="secundario" onClick={() => setConfirmandoCancelarSerie(false)}>
              No
            </Button>
          </div>
        </div>
      )}

      {editando && (
        <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-n-50 p-4">
          <p className="font-semibold text-n-900">Editar patrón</p>
          <p className="text-sm text-n-600">
            El perro y la fecha de inicio no se pueden cambiar — para eso, cancela esta serie y crea una nueva.
          </p>

          <Select label="Servicio" value={servicioEdit} onChange={(e) => setServicioEdit(e.target.value)}>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-n-800">Días de la semana</p>
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((d) => (
                <button
                  key={d.valor}
                  type="button"
                  onClick={() => alternarDiaEdit(d.valor)}
                  className={`rounded-full border-[1.5px] px-3 py-1.5 text-sm font-semibold transition-colors ${
                    diasEdit.includes(d.valor)
                      ? "border-azul bg-azul-suave text-azul"
                      : "border-n-200 bg-white text-n-600 hover:border-n-300"
                  }`}
                >
                  {d.corta}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm font-semibold text-n-800">
              <input type="checkbox" checked={tieneFinEdit} onChange={(e) => setTieneFinEdit(e.target.checked)} />
              Tiene fecha de fin
            </label>
            {tieneFinEdit && (
              <Field
                label="Fecha de fin"
                type="date"
                value={fechaFinEdit}
                min={fechaInicio}
                onChange={(e) => setFechaFinEdit(e.target.value)}
              />
            )}
          </div>

          {!confirmandoEditar ? (
            <Button
              type="button"
              disabled={diasEdit.length === 0}
              onClick={() => setConfirmandoEditar(true)}
              className="self-start"
            >
              Guardar cambios
            </Button>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-naranja bg-naranja-suave p-3">
              <p className="text-sm font-semibold text-naranja-oscuro">
                Esto va a cancelar {afectadasPorEdicion} estancia{afectadasPorEdicion === 1 ? "" : "s"} futura
                {afectadasPorEdicion === 1 ? "" : "s"} que todavía no inicia y las va a regenerar con el patrón
                nuevo. Las que ya tienen check-in o ya pasaron no se tocan. ¿Continuar?
              </p>
              <div className="flex gap-2">
                <Button type="button" disabled={cargando} onClick={accionGuardarEdicion}>
                  {cargando ? "Guardando…" : "Sí, guardar y regenerar"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setConfirmandoEditar(false)}>
                  No
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {pausando && (
        <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-n-50 p-4">
          <p className="font-semibold text-n-900">Pausar por vacaciones</p>
          <p className="text-sm text-n-600">
            Libera el cupo de ese rango y la serie sigue normal después — no hace falta cancelar día por día.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Desde" type="date" value={pausaDesde} min={hoy} onChange={(e) => setPausaDesde(e.target.value)} />
            <Field
              label="Hasta"
              type="date"
              value={pausaHasta}
              min={pausaDesde}
              onChange={(e) => setPausaHasta(e.target.value)}
            />
          </div>
          <Textarea label="Motivo (opcional)" value={pausaMotivo} onChange={(e) => setPausaMotivo(e.target.value)} />
          <Button type="button" disabled={cargando} onClick={accionPausar} className="self-start">
            {cargando ? "Guardando…" : "Registrar pausa"}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Próximas fechas</h2>
        {proximas.length === 0 ? (
          <p className="text-sm text-n-500">No hay fechas próximas generadas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {proximas.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-white px-3 py-2"
              >
                <span className="font-semibold text-n-900">{formatearFechaCalendario(e.fechaEntrada)}</span>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_ESTADO[e.estado] ?? "bg-n-100"}`}>
                    {ETIQUETA_ESTADO[e.estado] ?? e.estado}
                  </span>
                  {(e.estado === "reservada" || e.estado === "confirmada") && (
                    <Button
                      type="button"
                      variante="secundario"
                      disabled={cancelandoDia === e.id}
                      onClick={() => accionCancelarDia(e.id)}
                    >
                      {cancelandoDia === e.id ? "Cancelando…" : "Cancelar este día"}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pasadas.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-n-200 pt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">Historial</h2>
          <ul className="flex flex-col gap-2">
            {pasadas.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-n-50 px-3 py-2 text-sm"
              >
                <span className="text-n-700">{formatearFechaCalendario(e.fechaEntrada)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_ESTADO[e.estado] ?? "bg-n-100"}`}>
                  {ETIQUETA_ESTADO[e.estado] ?? e.estado}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
