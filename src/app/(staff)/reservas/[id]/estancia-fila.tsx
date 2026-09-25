"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario, sumarDiasFecha } from "@/lib/formato";
import { cancelarEstancia, marcarNoLlego, moverFechas } from "../reserva-actions";
import { CargosSeccion, type Cargo, type ServicioCargo } from "../cargos-seccion";

export type FilaEstancia = {
  id: string;
  perroNombre: string;
  servicioNombre: string;
  categoria: string;
  fechaEntrada: string;
  fechaSalida: string;
  estado: string;
  precioUnitario: number;
  // Guardería por hora: la unidad es "hora" y `horas` es lo que se
  // cobra (estimado al reservar, real al check-out).
  unidad: string;
  horas: number | null;
};

const ETIQUETA_CATEGORIA: Record<string, string> = { guarderia: "Guardería", hotel: "Hotel" };

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
  confirmada: "bg-morado-suave text-morado",
  en_curso: "bg-menta-suave text-menta-oscuro",
  finalizada: "bg-n-100 text-n-600",
  cancelada: "bg-coral-suave text-coral-oscuro",
  no_llego: "bg-coral-suave text-coral-oscuro",
};

export function EstanciaFila({
  fila,
  cargosIniciales,
  serviciosCargo,
  distanciaClienteKm,
}: {
  fila: FilaEstancia;
  cargosIniciales: Cargo[];
  serviciosCargo: ServicioCargo[];
  distanciaClienteKm?: number | null;
}) {
  const [estado, setEstado] = useState(fila.estado);
  const [fechaEntrada, setFechaEntrada] = useState(fila.fechaEntrada);
  const [fechaSalida, setFechaSalida] = useState(fila.fechaSalida);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [confirmandoNoLlego, setConfirmandoNoLlego] = useState(false);
  const [moviendoFechas, setMoviendoFechas] = useState(false);
  const [nuevaEntrada, setNuevaEntrada] = useState(fila.fechaEntrada);
  const [nuevaSalida, setNuevaSalida] = useState(fila.fechaSalida);
  const cargando = useEspera();
  const [error, setError] = useState<string | null>(null);
  // Qué pasó con el pase al cancelar (se devolvió, o venció y no).
  const [avisoBono, setAvisoBono] = useState<string | null>(null);

  const esGuarderia = fila.categoria === "guarderia";
  const porHora = fila.unidad === "hora";
  const editable = estado === "reservada" || estado === "confirmada";
  // precioUnitario es tarifa POR NOCHE/DÍA/HORA, no el total de la
  // estancia (ver tarifas: "el total es N × precio del tramo"). Para
  // guardería por día noches siempre da 1; por hora, la cantidad son las
  // horas.
  const noches = Math.round(
    (new Date(fechaSalida).getTime() - new Date(fechaEntrada).getTime()) / 86400000
  );
  const cantidad = porHora ? (fila.horas ?? 1) : noches;

  async function accionCancelar() {
    setError(null);
    const res = await cargando.ejecutar(() => cancelarEstancia(fila.id));
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("cancelada");
    setAvisoBono(res.aviso ?? null);
    setConfirmandoCancelar(false);
  }

  async function accionNoLlego() {
    setError(null);
    const res = await cargando.ejecutar(() => marcarNoLlego(fila.id));
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("no_llego");
    setConfirmandoNoLlego(false);
  }

  async function accionMoverFechas() {
    setError(null);
    const salidaFinal = esGuarderia ? sumarDiasFecha(nuevaEntrada, 1) : nuevaSalida;
    const res = await cargando.ejecutar(() => moverFechas(fila.id, nuevaEntrada, salidaFinal));
    if (res.error) {
      setError(res.error);
      return;
    }
    setFechaEntrada(nuevaEntrada);
    setFechaSalida(salidaFinal);
    setMoviendoFechas(false);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-n-900">{fila.perroNombre}</p>
          <p className="text-sm text-n-600">
            {ETIQUETA_CATEGORIA[fila.categoria] ?? fila.categoria} · {fila.servicioNombre}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ESTILO_ESTADO[estado] ?? "bg-n-100 text-n-700"}`}>
          {ETIQUETA_ESTADO[estado] ?? estado}
        </span>
      </div>

      <div className="flex flex-wrap gap-6 text-sm text-n-700">
        <span>
          {esGuarderia ? "Fecha" : "Entrada"}:{" "}
          <span className="font-semibold text-n-900">{formatearFechaCalendario(fechaEntrada)}</span>
        </span>
        {!esGuarderia && (
          <span>
            Salida:{" "}
            <span className="font-semibold text-n-900">{formatearFechaCalendario(fechaSalida)}</span>
          </span>
        )}
        <span>
          {porHora
            ? `Precio por hora × ${cantidad}`
            : esGuarderia
              ? "Precio"
              : `Precio por noche × ${noches}`}
          :{" "}
          <span className="font-semibold text-n-900">
            ${fila.precioUnitario.toFixed(2)}
            {(porHora || !esGuarderia) && ` = $${(fila.precioUnitario * cantidad).toFixed(2)}`}
          </span>
        </span>
      </div>

      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
        </Alert>
      )}

      {avisoBono && (
        <Alert variante="advertencia" titulo="Pase de esta estancia">
          {avisoBono}
        </Alert>
      )}

      {!editable && estado === "en_curso" && (
        <p className="text-sm text-n-500">Ya hizo check-in — el check-out se hace desde esa pantalla.</p>
      )}

      {editable && (
        <div className="flex flex-col gap-3 border-t border-n-200 pt-3">
          {moviendoFechas ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field
                label={esGuarderia ? "Nueva fecha" : "Nueva entrada"}
                type="date"
                value={nuevaEntrada}
                onChange={(e) => setNuevaEntrada(e.target.value)}
              />
              {!esGuarderia && (
                <Field
                  label="Nueva salida"
                  type="date"
                  value={nuevaSalida}
                  min={nuevaEntrada}
                  onChange={(e) => setNuevaSalida(e.target.value)}
                />
              )}
              <Button type="button" cargando={cargando.cargando} onClick={accionMoverFechas}>
                {cargando.cargando ? "Guardando…" : "Guardar fechas"}
              </Button>
              <Button
                type="button"
                variante="secundario"
                onClick={() => {
                  setMoviendoFechas(false);
                  setNuevaEntrada(fechaEntrada);
                  setNuevaSalida(fechaSalida);
                }}
              >
                Cancelar
              </Button>
            </div>
          ) : confirmandoCancelar ? (
            <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3">
              <p className="text-sm font-semibold text-coral-oscuro">
                ¿Cancelar la estancia de {fila.perroNombre}?
              </p>
              <div className="flex gap-2">
                <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={accionCancelar}>
                  {cargando.cargando ? "Cancelando…" : "Sí, cancelar"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setConfirmandoCancelar(false)}>
                  No
                </Button>
              </div>
            </div>
          ) : confirmandoNoLlego ? (
            <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3">
              <p className="text-sm font-semibold text-coral-oscuro">
                ¿Marcar que {fila.perroNombre} no llegó?
              </p>
              <div className="flex gap-2">
                <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={accionNoLlego}>
                  {cargando.cargando ? "Guardando…" : "Sí, no llegó"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setConfirmandoNoLlego(false)}>
                  No
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button type="button" variante="secundario" onClick={() => setMoviendoFechas(true)}>
                Mover fechas
              </Button>
              <Button type="button" variante="secundario" onClick={() => setConfirmandoNoLlego(true)}>
                Marcar no llegó
              </Button>
              <Button type="button" variante="peligro" onClick={() => setConfirmandoCancelar(true)}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-n-200 pt-3">
        <CargosSeccion
          estanciaId={fila.id}
          cargosIniciales={cargosIniciales}
          serviciosCargo={estado === "cancelada" || estado === "no_llego" ? [] : serviciosCargo}
          precioBase={fila.precioUnitario * cantidad}
          distanciaClienteKm={distanciaClienteKm}
        />
      </div>
    </div>
  );
}
