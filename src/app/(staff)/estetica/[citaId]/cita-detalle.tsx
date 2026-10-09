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
  reprogramarCita,
  cancelarCita,
  eliminarCita,
  cambiarTarifaGuarderia,
  iniciarCita,
  finalizarCita,
  aplicarRecargoCita,
  type AjusteConsumo,
} from "../agenda-actions";
import { SelectorEstilista, type Estilista } from "../selector-estilista";

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
  recargo,
  recargoMotivo,
  puedeRecargo,
  esStandalone,
  entregadoPorNombre,
  recogidoPorNombre,
  recogidoPorEsDueno,
  recetaItems,
  estilista,
  puedeEliminar = false,
  tarifa = null,
  abrirReprogramar = false,
}: {
  citaId: string;
  perroNombre: string;
  estado: string;
  inicio: string;
  precio: number;
  // El recargo manual que ya trae (si trae) y si quien mira puede ponerlo.
  recargo: number;
  recargoMotivo: string | null;
  puedeRecargo: boolean;
  esStandalone: boolean;
  entregadoPorNombre: string | null;
  recogidoPorNombre: string | null;
  recogidoPorEsDueno: boolean | null;
  recetaItems: RecetaItem[];
  // Solo admin y recepción cambian la estilista; para los demás va null.
  estilista: { empleadoId: string | null; nombreActual: string | null; estilistas: Estilista[]; puedeCorregir: boolean } | null;
  // Permiso «Eliminar citas».
  puedeEliminar?: boolean;
  // Tarifa «cliente de guardería»: lo que tiene la cita y lo que puede hacer quien mira.
  tarifa?: { aplicada: boolean; origen: "auto" | "manual" | null; servicioNombre: string | null; aplicable: boolean; puedeCambiar: boolean } | null;
  // Viene de «Reprogramar» en la agenda: abre el formulario de una vez.
  abrirReprogramar?: boolean;
}) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const [estado, setEstado] = useState(estadoInicial);
  const [error, setError] = useState<string | null>(null);
  const cargando = useEspera();

  const [reagendando, setReagendando] = useState(abrirReprogramar);
  const [motivoReprogramar, setMotivoReprogramar] = useState("");
  // Después de un cambio: el aviso al cliente (la app deja listo el WhatsApp, no lo manda sola).
  const [aviso, setAviso] = useState<{ texto: string; url?: string } | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const [motivoNoLlego, setMotivoNoLlego] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [motivoEliminar, setMotivoEliminar] = useState("");
  const [quitandoTarifa, setQuitandoTarifa] = useState(false);
  const [motivoTarifa, setMotivoTarifa] = useState("");
  // El datetime-local no trae huso horario: lo que se precarga y lo que se
  // teclea es la hora EN EL NEGOCIO (su zona), no la del navegador.
  const [nuevoInicio, setNuevoInicio] = useState(horaLocalParaInput(inicio, zona));

  const [editandoRecargo, setEditandoRecargo] = useState(false);
  const [recargoTexto, setRecargoTexto] = useState(recargo > 0 ? String(recargo) : "");
  const [recargoMotivoTexto, setRecargoMotivoTexto] = useState(recargoMotivo ?? "");

  async function guardarRecargo() {
    setError(null);
    const monto = recargoTexto.trim() ? Number(recargoTexto.replace(",", ".")) : 0;
    if (!Number.isFinite(monto) || monto < 0) return setError("El recargo tiene que ser un número de cero para arriba.");
    if (monto > 0 && !recargoMotivoTexto.trim()) return setError("El recargo necesita un motivo.");
    const res = await cargando.ejecutar(() => aplicarRecargoCita(citaId, monto, recargoMotivoTexto));
    if (res.error) return setError(res.error);
    setEditandoRecargo(false);
    router.refresh();
  }

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
    const res = await cargando.ejecutar(() => reprogramarCita(citaId, instanteDeHoraLocal(nuevoInicio, zona), motivoReprogramar));
    if (res.error) {
      setError(res.error);
      return;
    }
    setReagendando(false);
    setMotivoReprogramar("");
    setAviso({
      texto: res.fueraDeHorario ? "Cita reprogramada. Ojo: termina después del cierre del negocio." : "Cita reprogramada. Quedó en el historial.",
      url: res.urlWhatsApp,
    });
    router.refresh();
  }

  async function accionCancelar() {
    setError(null);
    if (motivoCancelar.trim().length < 3) {
      setError("Escribe el motivo de la cancelación.");
      return;
    }
    const res = await cargando.ejecutar(() => cancelarCita(citaId, motivoCancelar, false));
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("cancelada");
    setAviso({ texto: "Cita cancelada. El horario quedó libre y el motivo en el historial.", url: res.urlWhatsApp });
    router.refresh();
  }

  async function accionNoLlego() {
    setError(null);
    const res = await cargando.ejecutar(() => cancelarCita(citaId, motivoNoLlego, true));
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("no_llego");
    router.refresh();
  }

  async function accionEliminar() {
    setError(null);
    const res = await cargando.ejecutar(() => eliminarCita(citaId, motivoEliminar));
    if (res.error) {
      setError(res.error);
      return;
    }
    router.push("/estetica");
  }

  async function accionTarifa(modo: "auto" | "si" | "no") {
    setError(null);
    if (modo === "no" && motivoTarifa.trim().length < 3) {
      setError("Quitar la tarifa necesita un motivo.");
      return;
    }
    const res = await cargando.ejecutar(() => cambiarTarifaGuarderia(citaId, modo, motivoTarifa));
    if (res.error) {
      setError(res.error);
      return;
    }
    setQuitandoTarifa(false);
    setMotivoTarifa("");
    setAviso({ texto: `Tarifa ${modo === "no" ? "quitada" : "aplicada"}: la cita ahora cuesta $${(res.precio ?? 0).toFixed(2)}.` });
    router.refresh();
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
        {recargo > 0 && (
          <span data-recargo className="block text-sm text-n-600">
            Incluye un recargo de ${recargo.toFixed(2)}{recargoMotivo ? `: ${recargoMotivo}` : ""}.
          </span>
        )}
      </p>
      <p className="-mt-2 text-sm text-n-600">El costo puede aumentar según el tipo de pelo y el cuidado previo.</p>

      {tarifa && (tarifa.aplicada || (tarifa.aplicable && tarifa.puedeCambiar)) && (estado === "reservada" || estado === "confirmada" || estado === "en_curso") && (
        <div data-tarifa-guarderia className={`flex flex-col gap-2 rounded-md border p-3 ${tarifa.aplicada ? "border-menta bg-menta-suave" : "border-n-200 bg-n-50"}`}>
          {tarifa.aplicada ? (
            <p className="text-sm font-semibold text-menta-oscuro">
              Tarifa de cliente de guardería{tarifa.servicioNombre ? ` (precio de «${tarifa.servicioNombre}»)` : ""}
              {tarifa.origen === "manual" ? " · puesta a mano" : " · automática"}. No es un descuento: es el precio de esta cita.
            </p>
          ) : (
            <p className="text-sm text-n-700">Este perro no es cliente de guardería, pero la tarifa se puede poner a mano para esta cita.</p>
          )}
          {tarifa.puedeCambiar && (
            quitandoTarifa ? (
              <div className="flex flex-col gap-2">
                <Field label="Motivo para quitar la tarifa" value={motivoTarifa} onChange={(e) => setMotivoTarifa(e.target.value)} ayuda="Queda en el historial con tu nombre." />
                <div className="flex gap-2">
                  <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={() => accionTarifa("no")}>Quitar la tarifa</Button>
                  <Button type="button" variante="secundario" onClick={() => setQuitandoTarifa(false)}>Dejarla</Button>
                </div>
              </div>
            ) : tarifa.aplicada ? (
              <Button type="button" variante="secundario" className="self-start" onClick={() => setQuitandoTarifa(true)}>Quitar la tarifa de guardería</Button>
            ) : (
              <Button type="button" variante="secundario" className="self-start" cargando={cargando.cargando} onClick={() => accionTarifa("si")}>Poner la tarifa de guardería</Button>
            )
          )}
        </div>
      )}

      {aviso && (
        <Alert variante="exito" titulo={aviso.texto}>
          {aviso.url && (
            <a href={aviso.url} target="_blank" rel="noopener noreferrer" data-avisar-cliente className="font-semibold underline">
              Avisarle al cliente por WhatsApp
            </a>
          )}
        </Alert>
      )}

      {puedeRecargo && (estado === "reservada" || estado === "confirmada" || estado === "en_curso") && (
        editandoRecargo ? (
          <div className="flex flex-col gap-2 rounded-md border border-n-200 p-3">
            <Field label="Recargo manual ($)" inputMode="decimal" value={recargoTexto} onChange={(e) => setRecargoTexto(e.target.value)} ayuda="Cero lo quita. Queda registrado con tu nombre." />
            <Field label="Motivo" value={recargoMotivoTexto} onChange={(e) => setRecargoMotivoTexto(e.target.value)} />
            <div className="flex gap-2">
              <Button type="button" cargando={cargando.cargando} onClick={guardarRecargo}>Guardar recargo</Button>
              <Button type="button" variante="secundario" onClick={() => setEditandoRecargo(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <Button type="button" variante="secundario" className="self-start" onClick={() => setEditandoRecargo(true)}>
            {recargo > 0 ? "Cambiar el recargo" : "Aplicar un recargo"}
          </Button>
        )
      )}

      {estilista && (
        <SelectorEstilista
          citaId={citaId}
          estado={estado}
          perroNombre={perroNombre}
          empleadoId={estilista.empleadoId}
          nombreActual={estilista.nombreActual}
          estilistas={estilista.estilistas}
          puedeCorregir={estilista.puedeCorregir}
        />
      )}

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
            <div data-reprogramar className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-3">
              <p className="text-sm text-n-700">
                La cita se mueve con su precio. Se revisa que la estilista no tenga otra cita a esa hora; queda en el historial y puedes avisarle al cliente por WhatsApp.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <Field
                  label="Nueva fecha y hora"
                  type="datetime-local"
                  value={nuevoInicio}
                  onChange={(e) => setNuevoInicio(e.target.value)}
                />
                <div className="min-w-[220px] flex-1">
                  <Field label="Motivo (opcional)" value={motivoReprogramar} onChange={(e) => setMotivoReprogramar(e.target.value)} placeholder="ej. La clienta pidió otro día" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" cargando={cargando.cargando} onClick={accionReagendar}>
                  {cargando.cargando ? "Guardando…" : "Guardar la nueva hora"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setReagendando(false)}>
                  Dejarla como estaba
                </Button>
              </div>
            </div>
          ) : confirmandoCancelar ? (
            <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3">
              <p className="text-sm font-semibold text-coral-oscuro">¿Cancelar esta cita? Avisaste que no viene o ya no la quiere: el horario queda libre.</p>
              <Field label="Motivo de la cancelación" value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} placeholder="ej. La clienta se enfermó" />
              <div className="flex gap-2">
                <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={accionCancelar}>
                  {cargando.cargando ? "Cancelando…" : "Sí, cancelar la cita"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setConfirmandoCancelar(false)}>
                  No
                </Button>
              </div>
            </div>
          ) : confirmandoNoLlego ? (
            <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3">
              <p className="text-sm font-semibold text-coral-oscuro">
                ¿Marcar que {perroNombre} no se presentó? (Es distinto de cancelar: la persona no avisó o no llegó.)
              </p>
              <Field label="Nota (opcional)" value={motivoNoLlego} onChange={(e) => setMotivoNoLlego(e.target.value)} />
              <div className="flex gap-2">
                <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={accionNoLlego}>
                  {cargando.cargando ? "Guardando…" : "Sí, no se presentó"}
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
                Reprogramar
              </Button>
              <Button type="button" onClick={() => setIniciando(true)}>
                Iniciar cita
              </Button>
              <Button type="button" variante="secundario" onClick={() => setConfirmandoNoLlego(true)}>
                No se presentó
              </Button>
              <Button type="button" variante="peligro" onClick={() => setConfirmandoCancelar(true)}>
                Cancelar cita
              </Button>
            </div>
          )}
        </div>
      )}

      {puedeEliminar && ["reservada", "confirmada", "cancelada", "no_llego"].includes(estado) && (
        <div data-eliminar-cita className="flex flex-col gap-2 border-t border-n-200 pt-3">
          {eliminando ? (
            <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3">
              <p className="text-sm font-semibold text-coral-oscuro">
                ¿Eliminar esta cita? Úsalo para una cita capturada por error o duplicada. Sale de la agenda y libera el horario; no se borra: queda en el historial con su motivo. Para una cita que ya no va, usa «Cancelar cita».
              </p>
              <Field label="Motivo (obligatorio)" value={motivoEliminar} onChange={(e) => setMotivoEliminar(e.target.value)} placeholder="ej. Se capturó dos veces" />
              <div className="flex gap-2">
                <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={accionEliminar}>
                  {cargando.cargando ? "Eliminando…" : "Sí, eliminar la cita"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setEliminando(false)}>
                  No
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variante="secundario" className="self-start" onClick={() => setEliminando(true)}>
              Eliminar cita
            </Button>
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
