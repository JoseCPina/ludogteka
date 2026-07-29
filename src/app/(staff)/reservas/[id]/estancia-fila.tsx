"use client";

import { useState } from "react";
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
  confirmada: "bg-azul-suave text-azul",
  en_curso: "bg-verde-suave text-verde-oscuro",
  finalizada: "bg-n-100 text-n-600",
  cancelada: "bg-naranja-suave text-naranja-oscuro",
  no_llego: "bg-naranja-suave text-naranja-oscuro",
};

export function EstanciaFila({
  fila,
  cargosIniciales,
  serviciosCargo,
}: {
  fila: FilaEstancia;
  cargosIniciales: Cargo[];
  serviciosCargo: ServicioCargo[];
}) {
  const [estado, setEstado] = useState(fila.estado);
  const [fechaEntrada, setFechaEntrada] = useState(fila.fechaEntrada);
  const [fechaSalida, setFechaSalida] = useState(fila.fechaSalida);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [confirmandoNoLlego, setConfirmandoNoLlego] = useState(false);
  const [moviendoFechas, setMoviendoFechas] = useState(false);
  const [nuevaEntrada, setNuevaEntrada] = useState(fila.fechaEntrada);
  const [nuevaSalida, setNuevaSalida] = useState(fila.fechaSalida);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esGuarderia = fila.categoria === "guarderia";
  const editable = estado === "reservada" || estado === "confirmada";

  async function accionCancelar() {
    setCargando(true);
    setError(null);
    const res = await cancelarEstancia(fila.id);
    setCargando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("cancelada");
    setConfirmandoCancelar(false);
  }

  async function accionNoLlego() {
    setCargando(true);
    setError(null);
    const res = await marcarNoLlego(fila.id);
    setCargando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("no_llego");
    setConfirmandoNoLlego(false);
  }

  async function accionMoverFechas() {
    setCargando(true);
    setError(null);
    const salidaFinal = esGuarderia ? sumarDiasFecha(nuevaEntrada, 1) : nuevaSalida;
    const res = await moverFechas(fila.id, nuevaEntrada, salidaFinal);
    setCargando(false);
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
          Precio: <span className="font-semibold text-n-900">${fila.precioUnitario.toFixed(2)}</span>
        </span>
      </div>

      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
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
              <Button type="button" disabled={cargando} onClick={accionMoverFechas}>
                {cargando ? "Guardando…" : "Guardar fechas"}
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
            <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-naranja bg-naranja-suave p-3">
              <p className="text-sm font-semibold text-naranja-oscuro">
                ¿Cancelar la estancia de {fila.perroNombre}?
              </p>
              <div className="flex gap-2">
                <Button type="button" variante="peligro" disabled={cargando} onClick={accionCancelar}>
                  {cargando ? "Cancelando…" : "Sí, cancelar"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setConfirmandoCancelar(false)}>
                  No
                </Button>
              </div>
            </div>
          ) : confirmandoNoLlego ? (
            <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-naranja bg-naranja-suave p-3">
              <p className="text-sm font-semibold text-naranja-oscuro">
                ¿Marcar que {fila.perroNombre} no llegó?
              </p>
              <div className="flex gap-2">
                <Button type="button" variante="peligro" disabled={cargando} onClick={accionNoLlego}>
                  {cargando ? "Guardando…" : "Sí, no llegó"}
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
          precioBase={fila.precioUnitario}
        />
      </div>
    </div>
  );
}
