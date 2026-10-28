"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DesgloseEstancia } from "@/components/cuentas/desglose-estancia";
import type { CuentaEstancia } from "@/lib/cuentas/cuenta-estancia";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { aplicarCargo, cancelarCargo } from "./cargo-actions";
import { AvisoConflicto } from "@/components/concurrencia/aviso-conflicto";
import type { Conflicto } from "@/lib/concurrencia/tipos";

export type Cargo = {
  id: string;
  servicioNombre: string;
  cantidad: number;
  precio: number;
  cancelado: boolean;
  motivoCancelacion: string | null;
  // Qué se le dio, en cargos de monto libre (comida especial).
  descripcion?: string | null;
  /** updated_at del cargo al cargar (QA N43). */
  version?: string | null;
  /** QA S41: una línea de la cuenta que no es un cargo de cargos_aplicados (una cita de estética) no se cancela aquí. */
  cancelable?: boolean;
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
  cuenta,
  eraSiCancelada,
  distanciaClienteKm,
  cancelada = false,
  cuentaCobrado = 0,
  cuentaDevuelto = 0,
  sinCargosNuevos = null,
}: {
  estanciaId: string;
  cargosIniciales: Cargo[];
  serviciosCargo: ServicioCargo[];
  // QA R50 (N136): la cuenta de la estancia leída de la base (cuenta_lineas_estancia); su total es el mismo que suman el
  // encabezado de la reserva y Caja. Sin ella no se enseña total (nunca se calcula aquí).
  cuenta?: CuentaEstancia | null;
  // Cancelada: lo que costaba, solo como referencia («no se cobra; era …»).
  eraSiCancelada?: number;
  distanciaClienteKm?: number | null;
  // N115: estancia cancelada o «no llegó»: su base ya no suma a la cuenta (cuenta_lineas_reserva la excluye);
  // los cargos vivos sí. Lo cobrado y lo devuelto son de la cuenta de la reserva.
  cancelada?: boolean;
  cuentaCobrado?: number;
  cuentaDevuelto?: number;
  // Estancia finalizada con la cuenta pagada (admiteCargosNuevos): no se ofrece «Aplicar cargo» y se dice por qué.
  sinCargosNuevos?: string | null;
}) {
  const [cargos, setCargos] = useState(cargosIniciales);
  // QA S41 (N144): la cuenta que se enseña es la de la base; aplicar o cancelar un cargo devuelve la nueva y se pinta con
  // la respuesta. Cuando la página se recarga, manda la de la página.
  const [cuentaViva, setCuentaViva] = useState(cuenta);
  const [cuentaDePagina, setCuentaDePagina] = useState(cuenta);
  if (cuenta !== cuentaDePagina) {
    setCuentaDePagina(cuenta);
    setCuentaViva(cuenta);
  }
  const [cargosDePagina, setCargosDePagina] = useState(cargosIniciales);
  if (cargosIniciales !== cargosDePagina) {
    setCargosDePagina(cargosIniciales);
    setCargos(cargosIniciales);
  }
  // Después de aplicar o cancelar un cargo, el total vuelve a leerse de la base.
  const router = useRouter();
  const [actualizando, iniciarActualizacion] = useTransition();
  const releerCuenta = () => iniciarActualizacion(() => router.refresh());

  const [servicioId, setServicioId] = useState(serviciosCargo[0]?.id ?? "");
  const [cantidad, setCantidad] = useState("1");
  const [notas, setNotas] = useState("");
  const [importe, setImporte] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const aplicando = useEspera();
  const [error, setError] = useState<string | null>(null);

  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<{ c: Conflicto; cargoId: string } | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const cancelando = useEspera();

  // QA S41 (N144): los cargos que se listan son los de la cuenta de la estancia (cuenta_lineas_estancia, la misma fuente
  // del detalle de la estancia y de Caja): todo lo que no es la base ni una corrección, más los cancelados (que ya no
  // suman). Sin cuenta (quien no la pasa), los de cargos_aplicados como antes.
  const filasCargos: Cargo[] =
    cuentaViva === undefined
      ? cargos
      : [
          ...(cuentaViva?.lineas ?? [])
            .filter((l) => l.tipo !== "estancia" && l.tipo !== "ajuste")
            .map((l) => {
              const propio = cargos.find((c) => c.id === l.origenId);
              return {
                id: l.origenId,
                servicioNombre: propio?.servicioNombre ?? l.descripcion,
                cantidad: 1,
                precio: l.total,
                cancelado: false,
                motivoCancelacion: null,
                descripcion: propio?.descripcion ?? null,
                version: propio?.version ?? null,
                // Solo un cargo de cargos_aplicados se cancela desde aquí (una cita de estética se cancela en su cita).
                cancelable: Boolean(propio && !propio.cancelado),
              };
            }),
          ...cargos.filter((c) => c.cancelado),
        ];

  const servicioSeleccionado = serviciosCargo.find((s) => s.id === servicioId);
  const esRecoleccion = servicioSeleccionado?.clave === "recoleccion";
  const esMontoLibre = Boolean(servicioSeleccionado?.montoLibre);


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
    if (res.cuenta !== undefined) setCuentaViva(res.cuenta);
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
    releerCuenta();
    setNotas("");
    setCantidad("1");
    setImporte("");
    setDescripcion("");
  }

  async function confirmarCancelar(cargoId: string, forzar = false) {
    if (!motivoCancelar.trim()) {
      setError("Escribe el motivo de la cancelación.");
      return;
    }
    setError(null);
    const version = cargos.find((c) => c.id === cargoId)?.version ?? null;
    const res = await cancelando.ejecutar(() => cancelarCargo(cargoId, motivoCancelar, { versiones: version ? [{ t: "cargos_aplicados", i: cargoId, v: version }] : [], forzar }));
    if (res.conflicto) return setConflicto({ c: res.conflicto, cargoId });
    setConflicto(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.cuenta !== undefined) setCuentaViva(res.cuenta);
    const motivo = motivoCancelar.trim();
    setCargos((prev) =>
      prev.map((c) => (c.id === cargoId ? { ...c, cancelado: true, motivoCancelacion: motivo } : c))
    );
    setCancelandoId(null);
    setMotivoCancelar("");
    releerCuenta();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold uppercase tracking-wide text-n-600">Cargos aplicados</p>
        {filasCargos.length === 0 ? (
          <p className="text-sm text-n-500" data-sin-cargos>Ninguno todavía.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-cargos-aplicados={filasCargos.length}>
            {filasCargos.map((c) => (
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
                    {!c.cancelado && c.cancelable !== false && cancelandoId !== c.id && (
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
                    {conflicto?.cargoId === c.id && (
                      <AvisoConflicto
                        conflicto={conflicto.c}
                        registro="este cargo"
                        cargando={cancelando.cargando}
                        onRecargar={() => {
                          setConflicto(null);
                          setCancelandoId(null);
                        }}
                        onGuardarEncima={() => confirmarCancelar(c.id, true)}
                      />
                    )}
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

        <div className="flex flex-col gap-2 border-t border-n-200 pt-2 text-sm" data-desglose-estancia={cancelada ? "cancelada" : "vigente"}>
          {cancelada && eraSiCancelada !== undefined && (
            <span className="text-n-600">
              Base: <span className="font-semibold text-n-900">{formatoDinero(0)}</span>
              <span className="text-n-500"> (no se cobra; era {formatoDinero(eraSiCancelada)})</span>
            </span>
          )}
          {cuenta !== undefined && <DesgloseEstancia cuenta={cuentaViva ?? null} actualizando={actualizando} />}
          {cancelada && cuentaCobrado > 0 && (
            <span className="text-n-600" data-desglose-cobrado>
              Cobrado en la cuenta: <span className="font-semibold text-n-900">{formatoDinero(cuentaCobrado)}</span>
            </span>
          )}
          {cancelada && cuentaDevuelto > 0 && (
            <span className="text-n-600" data-desglose-devuelto>
              Devuelto: <span className="font-semibold text-n-900">{formatoDinero(cuentaDevuelto)}</span>
            </span>
          )}
        </div>
      </div>

      {error && (
        <Alert variante="error" titulo="No se pudo completar">
          {error}
        </Alert>
      )}

      {sinCargosNuevos && (
        <p className="text-sm text-n-600" data-cargos-cerrados>
          {sinCargosNuevos}
        </p>
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
          {/* N113: en el celular, Notas ocupa toda la fila y «Aplicar» va debajo. */}
          <div className="w-full sm:w-auto sm:min-w-[200px] sm:flex-1">
            <Field
              label="Notas (opcional)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="ej. Se dejó comida especial 3 días"
            />
          </div>
          <Button type="button" className="w-full sm:w-auto" cargando={aplicando.cargando} onClick={enviarAplicar} data-aplicar-cargo>
            {aplicando.cargando ? "Aplicando…" : "Aplicar"}
          </Button>
        </div>
      )}
    </div>
  );
}
