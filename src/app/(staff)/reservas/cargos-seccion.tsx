"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { aplicarCargo, cancelarCargo } from "./cargo-actions";

export type Cargo = {
  id: string;
  servicioNombre: string;
  cantidad: number;
  precio: number;
  cancelado: boolean;
  motivoCancelacion: string | null;
};

export type ServicioCargo = { id: string; nombre: string; clave?: string };

export type SugerenciaRetraso = {
  servicioId: string;
  servicioNombre: string;
  minutos: number;
  horaCierre: string;
};

function formatoDinero(valor: number): string {
  return `$${valor.toFixed(2)}`;
}

export function CargosSeccion({
  estanciaId,
  cargosIniciales,
  serviciosCargo,
  sugerenciaRetraso,
  precioBase,
  distanciaClienteKm,
}: {
  estanciaId: string;
  cargosIniciales: Cargo[];
  serviciosCargo: ServicioCargo[];
  sugerenciaRetraso?: SugerenciaRetraso | null;
  precioBase?: number;
  distanciaClienteKm?: number | null;
}) {
  const [cargos, setCargos] = useState(cargosIniciales);
  const [sugerenciaOmitida, setSugerenciaOmitida] = useState(false);

  const [servicioId, setServicioId] = useState(serviciosCargo[0]?.id ?? "");
  const [cantidad, setCantidad] = useState("1");
  const [notas, setNotas] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const servicioSeleccionado = serviciosCargo.find((s) => s.id === servicioId);
  const esRecoleccion = servicioSeleccionado?.clave === "recoleccion";

  const acumuladoCargos = cargos
    .filter((c) => !c.cancelado)
    .reduce((sum, c) => sum + c.precio * c.cantidad, 0);

  async function enviarAplicar() {
    const cant = Number(cantidad);
    const servicio = serviciosCargo.find((s) => s.id === servicioId);
    setAplicando(true);
    setError(null);
    const res = await aplicarCargo(estanciaId, servicioId, cant, notas);
    setAplicando(false);
    if (res.error || !res.cargo) {
      setError(res.error);
      return;
    }
    setCargos((prev) => [
      ...prev,
      {
        id: res.cargo!.id,
        servicioNombre: servicio?.nombre ?? "Cargo",
        cantidad: cant,
        precio: res.cargo!.precio,
        cancelado: false,
        motivoCancelacion: null,
      },
    ]);
    setNotas("");
    setCantidad("1");
  }

  async function aplicarSugerencia() {
    if (!sugerenciaRetraso) return;
    setAplicando(true);
    setError(null);
    const res = await aplicarCargo(estanciaId, sugerenciaRetraso.servicioId, 1, "");
    setAplicando(false);
    if (res.error || !res.cargo) {
      setError(res.error);
      return;
    }
    setCargos((prev) => [
      ...prev,
      {
        id: res.cargo!.id,
        servicioNombre: sugerenciaRetraso.servicioNombre,
        cantidad: 1,
        precio: res.cargo!.precio,
        cancelado: false,
        motivoCancelacion: null,
      },
    ]);
    setSugerenciaOmitida(true);
  }

  async function confirmarCancelar(cargoId: string) {
    if (!motivoCancelar.trim()) {
      setError("Escribe el motivo de la cancelación.");
      return;
    }
    setCancelando(true);
    setError(null);
    const res = await cancelarCargo(cargoId, motivoCancelar);
    setCancelando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const motivo = motivoCancelar.trim();
    setCargos((prev) =>
      prev.map((c) => (c.id === cargoId ? { ...c, cancelado: true, motivoCancelacion: motivo } : c))
    );
    setCancelandoId(null);
    setMotivoCancelar("");
  }

  return (
    <div className="flex flex-col gap-4">
      {sugerenciaRetraso && sugerenciaRetraso.minutos > 0 && !sugerenciaOmitida && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-amarillo bg-amarillo-suave p-4">
          <div>
            <p className="font-bold text-amarillo-oscuro">
              Recogida tardía: {sugerenciaRetraso.minutos} minuto{sugerenciaRetraso.minutos === 1 ? "" : "s"} después
              del cierre ({sugerenciaRetraso.horaCierre})
            </p>
            <p className="text-sm text-amarillo-oscuro">
              Tú decides si se cobra o se perdona — no se aplica solo.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={aplicando} onClick={aplicarSugerencia}>
              {aplicando ? "Aplicando…" : `Aplicar ${sugerenciaRetraso.servicioNombre}`}
            </Button>
            <Button type="button" variante="secundario" onClick={() => setSugerenciaOmitida(true)}>
              Omitir
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold uppercase tracking-wide text-n-600">Cargos aplicados</p>
        {cargos.length === 0 ? (
          <p className="text-sm text-n-500">Ninguno todavía.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cargos.map((c) => (
              <li
                key={c.id}
                className={`rounded-md border px-3 py-2 ${
                  c.cancelado ? "border-n-200 bg-n-50" : "border-n-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={c.cancelado ? "text-n-500 line-through" : "font-semibold text-n-900"}>
                    {c.servicioNombre} {c.cantidad > 1 ? `× ${c.cantidad}` : ""}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className={`tabular-nums font-semibold ${c.cancelado ? "text-n-500 line-through" : "text-n-900"}`}>
                      {formatoDinero(c.precio * c.cantidad)}
                    </span>
                    {!c.cancelado && cancelandoId !== c.id && (
                      <Button type="button" variante="peligro" onClick={() => setCancelandoId(c.id)}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </div>
                {c.cancelado && c.motivoCancelacion && (
                  <p className="mt-1 text-xs text-n-500">Cancelado: {c.motivoCancelacion}</p>
                )}
                {cancelandoId === c.id && (
                  <div className="mt-2 flex flex-col gap-2 border-t border-n-200 pt-2">
                    <Field
                      label="Motivo de la cancelación"
                      value={motivoCancelar}
                      onChange={(e) => setMotivoCancelar(e.target.value)}
                      placeholder="ej. Se capturó por error"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variante="peligro"
                        disabled={cancelando}
                        onClick={() => confirmarCancelar(c.id)}
                      >
                        {cancelando ? "Cancelando…" : "Confirmar cancelación"}
                      </Button>
                      <Button
                        type="button"
                        variante="secundario"
                        onClick={() => {
                          setCancelandoId(null);
                          setMotivoCancelar("");
                        }}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-6 border-t border-n-200 pt-2 text-sm">
          {precioBase !== undefined && (
            <span className="text-n-600">
              Base: <span className="font-semibold text-n-900">{formatoDinero(precioBase)}</span>
            </span>
          )}
          <span className="text-n-600">
            Cargos: <span className="font-semibold text-n-900">{formatoDinero(acumuladoCargos)}</span>
          </span>
          {precioBase !== undefined && (
            <span className="font-bold text-n-900">
              Total: {formatoDinero(precioBase + acumuladoCargos)}
            </span>
          )}
        </div>
      </div>

      {error && (
        <Alert variante="error" titulo="No se pudo completar">
          {error}
        </Alert>
      )}

      {serviciosCargo.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-n-200 bg-n-50 p-3">
          <div className="min-w-[200px]">
            <Select label="Aplicar cargo" value={servicioId} onChange={(e) => setServicioId(e.target.value)}>
              {serviciosCargo.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-24">
            <Field
              label="Cantidad"
              type="number"
              min="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              ayuda={esRecoleccion ? "km" : undefined}
            />
          </div>
          {esRecoleccion && distanciaClienteKm != null && (
            <button
              type="button"
              onClick={() => setCantidad(String(Math.round(distanciaClienteKm)))}
              className="mb-[1px] text-sm font-semibold text-azul hover:underline"
            >
              Usar distancia guardada ({distanciaClienteKm} km)
            </button>
          )}
          <div className="min-w-[200px] flex-1">
            <Field
              label="Notas (opcional)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="ej. Se dejó comida especial 3 días"
            />
          </div>
          <Button type="button" disabled={aplicando} onClick={enviarAplicar}>
            {aplicando ? "Aplicando…" : "Aplicar"}
          </Button>
        </div>
      )}
    </div>
  );
}
