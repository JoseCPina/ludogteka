"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { horaLocalParaInput, instanteDeHoraLocal } from "@/lib/formato";
import { useZonaNegocio } from "@/components/zona-negocio";
import {
  reagendarCita,
  cancelarCita,
  marcarCitaNoLlego,
  iniciarCita,
  finalizarCita,
  type AjusteConsumo,
} from "../agenda-actions";

export type RecetaItem = {
  insumo_id: string;
  insumo_nombre: string;
  unidad_etiqueta: string;
  cantidad_sugerida: number;
};

export function CitaDetalle({
  citaId,
  perroNombre,
  estado: estadoInicial,
  inicio,
  precio,
  esStandalone,
  entregadoPorNombre,
  recogidoPorNombre,
  recogidoPorEsDueno,
  recetaItems,
}: {
  citaId: string;
  perroNombre: string;
  estado: string;
  inicio: string;
  precio: number;
  esStandalone: boolean;
  entregadoPorNombre: string | null;
  recogidoPorNombre: string | null;
  recogidoPorEsDueno: boolean | null;
  recetaItems: RecetaItem[];
}) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const [estado, setEstado] = useState(estadoInicial);
  const [error, setError] = useState<string | null>(null);
  const cargando = useEspera();

  const [reagendando, setReagendando] = useState(false);
  // El datetime-local no trae huso horario: lo que se precarga y lo que se
  // teclea es la hora EN EL NEGOCIO (su zona), no la del navegador.
  const [nuevoInicio, setNuevoInicio] = useState(horaLocalParaInput(inicio, zona));

  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [confirmandoNoLlego, setConfirmandoNoLlego] = useState(false);

  const [iniciando, setIniciando] = useState(false);
  const [entregadoNombre, setEntregadoNombre] = useState("");
  const [entregadoTelefono, setEntregadoTelefono] = useState("");

  const [finalizando, setFinalizando] = useState(false);
  const [recogidoNombre, setRecogidoNombre] = useState("");
  const [recogidoTelefono, setRecogidoTelefono] = useState("");
  const [esDueno, setEsDueno] = useState<boolean | null>(null);
  const [cantidadesConsumo, setCantidadesConsumo] = useState<Record<string, string>>(() =>
    Object.fromEntries(recetaItems.map((r) => [r.insumo_id, String(r.cantidad_sugerida)]))
  );

  async function accionReagendar() {
    setError(null);
    const res = await cargando.ejecutar(() => reagendarCita(citaId, instanteDeHoraLocal(nuevoInicio, zona)));
    if (res.error) {
      setError(res.error);
      return;
    }
    setReagendando(false);
    router.refresh();
  }

  async function accionCancelar() {
    setError(null);
    const res = await cargando.ejecutar(() => cancelarCita(citaId));
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("cancelada");
  }

  async function accionNoLlego() {
    setError(null);
    const res = await cargando.ejecutar(() => marcarCitaNoLlego(citaId));
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("no_llego");
  }

  async function accionIniciar() {
    if (esStandalone && !entregadoNombre.trim()) {
      setError("Registra quién entrega al perro.");
      return;
    }
    setError(null);
    const res = await cargando.ejecutar(() => iniciarCita(
      citaId,
      esStandalone ? entregadoNombre : null,
      esStandalone ? entregadoTelefono || null : null
    ));
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("en_curso");
    setIniciando(false);
  }

  async function accionFinalizar() {
    if (esStandalone && (!recogidoNombre.trim() || esDueno === null)) {
      setError("Registra quién recoge al perro e indica si es el dueño.");
      return;
    }
    setError(null);
    const ajustes: AjusteConsumo[] = recetaItems.map((r) => ({
      insumo_id: r.insumo_id,
      cantidad: Number(cantidadesConsumo[r.insumo_id] ?? r.cantidad_sugerida),
    }));
    const res = await cargando.ejecutar(() => finalizarCita(
      citaId,
      esStandalone ? recogidoNombre : null,
      esStandalone ? recogidoTelefono || null : null,
      esStandalone ? esDueno : null,
      ajustes
    ));
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("finalizada");
    setFinalizando(false);
  }

  const editable = estado === "reservada" || estado === "confirmada";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-n-700">
        Precio: <span className="font-semibold text-n-900">${precio.toFixed(2)}</span>
      </p>

      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
        </Alert>
      )}

      {esStandalone && entregadoPorNombre && (estado === "en_curso" || estado === "finalizada") && (
        <p className="text-sm text-n-600">Entregó: {entregadoPorNombre}</p>
      )}

      {estado === "finalizada" && (
        <p className="text-sm text-n-600">
          {esStandalone
            ? `Recogió: ${recogidoPorNombre ?? "—"}${recogidoPorEsDueno === false ? " (persona autorizada, no el dueño)" : ""}`
            : "Cerrada junto con la estancia ligada."}
        </p>
      )}
      {(estado === "cancelada" || estado === "no_llego") && (
        <p className="text-sm text-n-600">Esta cita ya está cerrada ({estado === "cancelada" ? "cancelada" : "no llegó"}).</p>
      )}

      {editable && (
        <div className="flex flex-col gap-3 border-t border-n-200 pt-3">
          {reagendando ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field
                label="Nueva fecha y hora"
                type="datetime-local"
                value={nuevoInicio}
                onChange={(e) => setNuevoInicio(e.target.value)}
              />
              <Button type="button" cargando={cargando.cargando} onClick={accionReagendar}>
                {cargando.cargando ? "Guardando…" : "Guardar"}
              </Button>
              <Button type="button" variante="secundario" onClick={() => setReagendando(false)}>
                Cancelar
              </Button>
            </div>
          ) : confirmandoCancelar ? (
            <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3">
              <p className="text-sm font-semibold text-coral-oscuro">¿Cancelar esta cita?</p>
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
                ¿Marcar que {perroNombre} no llegó?
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
          ) : iniciando ? (
            <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-3">
              {esStandalone ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="Quién entrega al perro"
                    value={entregadoNombre}
                    onChange={(e) => setEntregadoNombre(e.target.value)}
                    autoFocus
                  />
                  <Field
                    label="Teléfono (opcional)"
                    value={entregadoTelefono}
                    onChange={(e) => setEntregadoTelefono(e.target.value)}
                  />
                </div>
              ) : (
                <p className="text-sm text-n-600">El perro ya está adentro (estancia ligada).</p>
              )}
              <div className="flex gap-2">
                <Button type="button" cargando={cargando.cargando} onClick={accionIniciar}>
                  {cargando.cargando ? "Guardando…" : "Confirmar inicio"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setIniciando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button type="button" variante="secundario" onClick={() => setReagendando(true)}>
                Reagendar
              </Button>
              <Button type="button" onClick={() => setIniciando(true)}>
                Iniciar cita
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

      {estado === "en_curso" && (
        <div className="flex flex-col gap-3 border-t border-n-200 pt-3">
          {finalizando ? (
            <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-3">
              {esStandalone ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field
                      label="Quién recoge al perro"
                      value={recogidoNombre}
                      onChange={(e) => setRecogidoNombre(e.target.value)}
                      autoFocus
                    />
                    <Field
                      label="Teléfono (opcional)"
                      value={recogidoTelefono}
                      onChange={(e) => setRecogidoTelefono(e.target.value)}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-sm font-semibold text-n-800">¿Es el dueño registrado?</p>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variante={esDueno === true ? "exito" : "secundario"}
                        onClick={() => setEsDueno(true)}
                      >
                        Sí, es el dueño
                      </Button>
                      <Button
                        type="button"
                        variante={esDueno === false ? "peligro" : "secundario"}
                        onClick={() => setEsDueno(false)}
                      >
                        No, persona autorizada
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-n-600">El perro sigue adentro (estancia ligada) — el cierre no requiere estos datos.</p>
              )}

              {recetaItems.length > 0 && (
                <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3">
                  <p className="text-sm font-semibold text-n-800">
                    Consumo de inventario — ajusta si se usó más o menos
                  </p>
                  {recetaItems.map((r) => (
                    <div key={r.insumo_id} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-n-700">{r.insumo_nombre}</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={cantidadesConsumo[r.insumo_id] ?? ""}
                          onChange={(e) =>
                            setCantidadesConsumo((prev) => ({ ...prev, [r.insumo_id]: e.target.value }))
                          }
                          className="min-h-10 w-24 rounded-md border-[1.5px] border-n-400 px-2 text-right text-sm focus:border-morado focus:outline-none focus:ring-[3px] focus:ring-morado-suave"
                        />
                        <span className="text-sm text-n-600">{r.unidad_etiqueta}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" cargando={cargando.cargando} onClick={accionFinalizar}>
                  {cargando.cargando ? "Guardando…" : "Confirmar cierre"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setFinalizando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" onClick={() => setFinalizando(true)}>
              Finalizar cita
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
