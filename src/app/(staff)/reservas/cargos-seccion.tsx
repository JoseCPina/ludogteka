"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
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
  // Qué se le dio, en cargos de monto libre (comida especial).
  descripcion?: string | null;
};

// montoLibre: sin celda en la matriz; recepción captura importe y
// descripción al aplicarlo (comida especial).
export type ServicioCargo = { id: string; nombre: string; clave?: string; montoLibre?: boolean };

function formatoDinero(valor: number): string {
  return `$${valor.toFixed(2)}`;
}

// La "recogida tardía" que antes se sugería aquí ya no existe como cargo:
// un perro de guardería que sigue después del cierre pasa a noche de
// hotel (ver convertir-hotel.tsx en el check-out).
export function CargosSeccion({
  estanciaId,
  cargosIniciales,
  serviciosCargo,
  precioBase,
  distanciaClienteKm,
}: {
  estanciaId: string;
  cargosIniciales: Cargo[];
  serviciosCargo: ServicioCargo[];
  precioBase?: number;
  distanciaClienteKm?: number | null;
}) {
  const [cargos, setCargos] = useState(cargosIniciales);

  const [servicioId, setServicioId] = useState(serviciosCargo[0]?.id ?? "");
  const [cantidad, setCantidad] = useState("1");
  const [notas, setNotas] = useState("");
  const [importe, setImporte] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const aplicando = useEspera();
  const [error, setError] = useState<string | null>(null);

  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const cancelando = useEspera();

  const servicioSeleccionado = serviciosCargo.find((s) => s.id === servicioId);
  const esRecoleccion = servicioSeleccionado?.clave === "recoleccion";
  const esMontoLibre = Boolean(servicioSeleccionado?.montoLibre);

  const acumuladoCargos = cargos
    .filter((c) => !c.cancelado)
    .reduce((sum, c) => sum + c.precio * c.cantidad, 0);

  async function enviarAplicar() {
    const cant = esMontoLibre ? 1 : Number(cantidad);
    const servicio = serviciosCargo.find((s) => s.id === servicioId);
    setError(null);
    const res = await aplicando.ejecutar(() => aplicarCargo(
      estanciaId,
      servicioId,
      cant,
      notas,
      esMontoLibre ? { importe: Number(importe), descripcion } : undefined
    ));
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
        descripcion: esMontoLibre ? descripcion.trim() : null,
      },
    ]);
    setNotas("");
    setCantidad("1");
    setImporte("");
    setDescripcion("");
  }

  async function confirmarCancelar(cargoId: string) {
    if (!motivoCancelar.trim()) {
      setError("Escribe el motivo de la cancelación.");
      return;
    }
    setError(null);
    const res = await cancelando.ejecutar(() => cancelarCargo(cargoId, motivoCancelar));
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
                {c.descripcion && (
                  <p className={`mt-1 text-xs ${c.cancelado ? "text-n-500" : "text-n-600"}`}>{c.descripcion}</p>
                )}
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
                        cargando={cancelando.cargando}
                        onClick={() => confirmarCancelar(c.id)}
                      >
                        {cancelando.cargando ? "Cancelando…" : "Confirmar cancelación"}
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
          {esMontoLibre ? (
            <>
              <div className="w-32">
                <Field
                  label="Importe"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={importe}
                  onChange={(e) => setImporte(e.target.value)}
                  ayuda="Según lo que se le dio"
                />
              </div>
              <div className="min-w-[220px] flex-1">
                <Field
                  label="Qué se le dio"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="ej. Pollo hervido con arroz, 3 días"
                />
              </div>
            </>
          ) : (
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
          )}
          {esRecoleccion && distanciaClienteKm != null && (
            <button
              type="button"
              onClick={() => setCantidad(String(Math.round(distanciaClienteKm)))}
              className="mb-[1px] text-sm font-semibold text-morado hover:underline"
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
          <Button type="button" cargando={aplicando.cargando} onClick={enviarAplicar}>
            {aplicando.cargando ? "Aplicando…" : "Aplicar"}
          </Button>
        </div>
      )}
    </div>
  );
}
