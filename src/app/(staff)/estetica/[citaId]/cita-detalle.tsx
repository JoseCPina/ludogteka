"use client";

import { useState, useRef } from "react";
import { useEspera } from "@/hooks/use-espera";
import { esEnterParaConfirmar, valorDelCampo } from "@/lib/ui/campo-vivo";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { describirCita, horaLocalParaInput, instanteDeHoraLocal } from "@/lib/formato";
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
import { AvisoVersion, useControlVersion } from "@/components/concurrencia/use-control-version";

export type RecetaItem = {
  insumo_id: string;
  insumo_nombre: string;
  unidad_etiqueta: string;
  cantidad_sugerida: number;
};

export function CitaDetalle({
  citaId,
  perroNombre,
  servicioNombre = null,
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
  version = null,
}: {
  citaId: string;
  perroNombre: string;
  servicioNombre?: string | null;
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
  /** updated_at de la cita al cargar la pantalla (QA N43). */
  version?: string | null;
}) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const [estado, setEstado] = useState(estadoInicial);
  // Quién recogió: lo que devuelve el servidor al cerrar la cita, al momento (QA S27).
  const [recogido, setRecogido] = useState({ nombre: recogidoPorNombre, esDueno: recogidoPorEsDueno });
  const [error, setError] = useState<string | null>(null);
  const cargando = useEspera();
  const ctl = useControlVersion("citas_estetica", citaId, version);
  // Check-in de una cita que no es de hoy: se pregunta antes (QA S14).
  const [otroDia, setOtroDia] = useState<string | null>(null);

  const [reagendando, setReagendando] = useState(abrirReprogramar);
  const [motivoReprogramar, setMotivoReprogramar] = useState("");
  // Después de un cambio: el aviso al cliente (la app deja listo el WhatsApp, no lo manda sola).
  const [aviso, setAviso] = useState<{ texto: string; url?: string } | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const [motivoNoLlego, setMotivoNoLlego] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [motivoEliminar, setMotivoEliminar] = useState("");
  const campoCancelar = useRef<HTMLInputElement>(null);
  const campoNoLlego = useRef<HTMLInputElement>(null);
  const campoEliminar = useRef<HTMLInputElement>(null);
  const [quitandoTarifa, setQuitandoTarifa] = useState(false);
  const [motivoTarifa, setMotivoTarifa] = useState("");
  // El datetime-local no trae huso horario: lo que se precarga y lo que se
  // teclea es la hora EN EL NEGOCIO (su zona), no la del navegador.
  const [nuevoInicio, setNuevoInicio] = useState(horaLocalParaInput(inicio, zona));

  const [editandoRecargo, setEditandoRecargo] = useState(false);
  const [recargoTexto, setRecargoTexto] = useState(recargo > 0 ? String(recargo) : "");
  const [recargoMotivoTexto, setRecargoMotivoTexto] = useState(recargoMotivo ?? "");

  async function guardarRecargo(forzar = false) {
    setError(null);
    const monto = recargoTexto.trim() ? Number(recargoTexto.replace(",", ".")) : 0;
    if (!Number.isFinite(monto) || monto < 0) return setError("El recargo tiene que ser un número de cero para arriba.");
    if (monto > 0 && !recargoMotivoTexto.trim()) return setError("El recargo necesita un motivo.");
    const res = await cargando.ejecutar(() => aplicarRecargoCita(citaId, monto, recargoMotivoTexto, ctl.control(forzar)));
    if (ctl.huboConflicto(res, () => guardarRecargo(true))) return;
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
  // Lo que falta en el formulario de entrega o recogida: se marca el campo y se dice qué es.
  const [falta, setFalta] = useState<{ campo: "entrega" | "recoge" | "dueno"; texto: string } | null>(null);
  function marcarFalta(campo: "entrega" | "recoge" | "dueno", texto: string, idCampo: string) {
    setError(null);
    setFalta({ campo, texto });
    document.getElementById(idCampo)?.focus();
  }
  const [cantidadesConsumo, setCantidadesConsumo] = useState<Record<string, string>>(() =>
    Object.fromEntries(recetaItems.map((r) => [r.insumo_id, String(r.cantidad_sugerida)]))
  );

  async function accionReagendar(forzar = false) {
    setError(null);
    const res = await cargando.ejecutar(() => reprogramarCita(citaId, instanteDeHoraLocal(nuevoInicio, zona), motivoReprogramar, ctl.control(forzar)));
    if (ctl.huboConflicto(res, () => accionReagendar(true))) return;
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

  async function accionCancelar(forzar = false) {
    setError(null);
    const motivoFinal = valorDelCampo(campoCancelar, motivoCancelar);
    setMotivoCancelar(motivoFinal);
    if (motivoFinal.trim().length < 3) {
      setError("Escribe el motivo de la cancelación.");
      return;
    }
    const res = await cargando.ejecutar(() => cancelarCita(citaId, motivoFinal, false, ctl.control(forzar)));
    if (ctl.huboConflicto(res, () => accionCancelar(true))) return;
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("cancelada");
    setAviso({ texto: "Cita cancelada. El horario quedó libre y el motivo en el historial.", url: res.urlWhatsApp });
    router.refresh();
  }

  async function accionNoLlego(forzar = false) {
    setError(null);
    const notaFinal = valorDelCampo(campoNoLlego, motivoNoLlego);
    setMotivoNoLlego(notaFinal);
    const res = await cargando.ejecutar(() => cancelarCita(citaId, notaFinal, true, ctl.control(forzar)));
    if (ctl.huboConflicto(res, () => accionNoLlego(true))) return;
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("no_llego");
    router.refresh();
  }

  async function accionEliminar(forzar = false) {
    setError(null);
    const motivoFinal = valorDelCampo(campoEliminar, motivoEliminar);
    setMotivoEliminar(motivoFinal);
    const res = await cargando.ejecutar(() => eliminarCita(citaId, motivoFinal, ctl.control(forzar)));
    if (ctl.huboConflicto(res, () => accionEliminar(true))) return;
    if (res.error) {
      setError(res.error);
      return;
    }
    router.push("/estetica");
  }

  async function accionTarifa(modo: "auto" | "si" | "no", forzar = false) {
    setError(null);
    if (modo === "no" && motivoTarifa.trim().length < 3) {
      setError("Quitar la tarifa necesita un motivo.");
      return;
    }
    const res = await cargando.ejecutar(() => cambiarTarifaGuarderia(citaId, modo, motivoTarifa, ctl.control(forzar)));
    if (ctl.huboConflicto(res, () => accionTarifa(modo, true))) return;
    if (res.error) {
      setError(res.error);
      return;
    }
    setQuitandoTarifa(false);
    setMotivoTarifa("");
    setAviso({ texto: `Tarifa ${modo === "no" ? "quitada" : "aplicada"}: la cita ahora cuesta $${(res.precio ?? 0).toFixed(2)}.` });
    router.refresh();
  }

  async function accionIniciar(opciones: { confirmarOtroDia?: boolean; forzar?: boolean } = {}) {
    if (esStandalone && !entregadoNombre.trim()) {
      marcarFalta("entrega", "Escribe quién entrega al perro.", "cita-entrega-nombre");
      return;
    }
    setFalta(null);
    setError(null);
    const res = await cargando.ejecutar(() => iniciarCita(
      citaId,
      esStandalone ? entregadoNombre : null,
      esStandalone ? entregadoTelefono || null : null,
      { confirmarOtroDia: opciones.confirmarOtroDia ?? !!otroDia, control: ctl.control(opciones.forzar) }
    ));
    if (ctl.huboConflicto(res, () => accionIniciar({ confirmarOtroDia: true, forzar: true }))) return;
    if (res.otroDia) {
      setOtroDia(res.otroDia);
      return;
    }
    setOtroDia(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEstado("en_curso");
    setIniciando(false);
  }

  // QA S16 (N69): lo obligatorio se marca antes del clic y el botón dice qué falta.
  const motivoIniciar = esStandalone && !entregadoNombre.trim() ? "Falta: quién entrega al perro." : null;
  const faltanCierre = esStandalone ? [!recogidoNombre.trim() && "quién recoge al perro", esDueno === null && "si es el dueño registrado"].filter(Boolean) : [];
  const motivoFinalizar = faltanCierre.length ? `Falta: ${faltanCierre.join(" y ")}.` : null;

  async function accionFinalizar() {
    if (esStandalone && !recogidoNombre.trim()) {
      marcarFalta("recoge", "Escribe quién recoge al perro.", "cita-recoge-nombre");
      return;
    }
    if (esStandalone && esDueno === null) {
      marcarFalta("dueno", "Indica si quien recoge es el dueño registrado o una persona autorizada.", "cita-recoge-dueno");
      return;
    }
    setFalta(null);
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
    if (res.recogido) setRecogido(res.recogido);
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
              <Button type="button" cargando={cargando.cargando} onClick={() => guardarRecargo()}>Guardar recargo</Button>
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
          version={version}
          citaId={citaId}
          estado={estado}
          perroNombre={perroNombre}
          empleadoId={estilista.empleadoId}
          nombreActual={estilista.nombreActual}
          estilistas={estilista.estilistas}
          puedeCorregir={estilista.puedeCorregir}
        />
      )}

      <AvisoVersion ctl={ctl} registro="esta cita" cargando={cargando.cargando} />
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
            ? `Recogió: ${recogido.nombre ?? "—"}${recogido.esDueno === false ? " (persona autorizada, no el dueño)" : ""}`
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
                <Button type="button" cargando={cargando.cargando} onClick={() => accionReagendar()}>
                  {cargando.cargando ? "Guardando…" : "Guardar la nueva hora"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setReagendando(false)}>
                  Dejarla como estaba
                </Button>
              </div>
            </div>
          ) : confirmandoCancelar ? (
            <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3">
              <p className="text-sm font-semibold text-coral-oscuro">¿Cancelar {describirCita(servicioNombre, perroNombre, inicio, zona)}? Avisaste que no viene o ya no la quiere: el horario queda libre.</p>
              <Field ref={campoCancelar} onKeyDown={(e) => { if (esEnterParaConfirmar(e)) { e.preventDefault(); void accionCancelar(); } }} label="Motivo de la cancelación" value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} placeholder="ej. La clienta se enfermó" />
              <div className="flex gap-2">
                <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={() => accionCancelar()}>
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
              <Field ref={campoNoLlego} onKeyDown={(e) => { if (esEnterParaConfirmar(e)) { e.preventDefault(); void accionNoLlego(); } }} label="Nota (opcional)" value={motivoNoLlego} onChange={(e) => setMotivoNoLlego(e.target.value)} />
              <div className="flex gap-2">
                <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={() => accionNoLlego()}>
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
                    id="cita-entrega-nombre"
                    label="Quién entrega al perro * (obligatorio)"
                    value={entregadoNombre}
                    onChange={(e) => {
                      setEntregadoNombre(e.target.value);
                      setFalta(null);
                    }}
                    error={falta?.campo === "entrega" ? falta.texto : undefined}
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
              {otroDia && (
                <div role="alert" data-checkin-otro-dia className="rounded-md border-[1.5px] border-ambar bg-ambar-suave p-3 text-sm font-semibold text-n-900">
                  {otroDia}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" cargando={cargando.cargando} disabled={Boolean(motivoIniciar)} onClick={() => accionIniciar({ confirmarOtroDia: !!otroDia })} data-confirmar-inicio>
                  {cargando.cargando ? "Guardando…" : otroDia ? "Sí, recibirla de todos modos" : "Confirmar inicio"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => { setIniciando(false); setOtroDia(null); }}>
                  Cancelar
                </Button>
                {motivoIniciar && <span className="text-sm text-n-600" data-motivo-confirmar>{motivoIniciar}</span>}
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
              <Field ref={campoEliminar} onKeyDown={(e) => { if (esEnterParaConfirmar(e)) { e.preventDefault(); void accionEliminar(); } }} label="Motivo (obligatorio)" value={motivoEliminar} onChange={(e) => setMotivoEliminar(e.target.value)} placeholder="ej. Se capturó dos veces" />
              <div className="flex gap-2">
                <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={() => accionEliminar()}>
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
                      id="cita-recoge-nombre"
                      label="Quién recoge al perro * (obligatorio)"
                      value={recogidoNombre}
                      onChange={(e) => {
                        setRecogidoNombre(e.target.value);
                        setFalta(null);
                      }}
                      error={falta?.campo === "recoge" ? falta.texto : undefined}
                      autoFocus
                    />
                    <Field
                      label="Teléfono (opcional)"
                      value={recogidoTelefono}
                      onChange={(e) => setRecogidoTelefono(e.target.value)}
                    />
                  </div>
                  <div
                    id="cita-recoge-dueno"
                    tabIndex={-1}
                    className={falta?.campo === "dueno" ? "rounded-md border-[1.5px] border-coral-oscuro bg-coral-suave p-2" : undefined}
                  >
                    <p className="mb-1.5 text-sm font-semibold text-n-800">¿Es el dueño registrado? * (obligatorio)</p>
                    {falta?.campo === "dueno" && <p className="mb-1.5 text-sm font-semibold text-coral-oscuro">{falta.texto}</p>}
                    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3" data-quien-recoge>
                      <Button
                        type="button"
                        variante={esDueno === true ? "exito" : "secundario"}
            className="w-full sm:w-auto"
                        onClick={() => {
                          setEsDueno(true);
                          setFalta(null);
                        }}
                      >
                        Sí, es el dueño
                      </Button>
                      <Button
                        type="button"
                        variante={esDueno === false ? "peligro" : "secundario"}
            className="w-full sm:w-auto"
                        onClick={() => {
                          setEsDueno(false);
                          setFalta(null);
                        }}
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

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" cargando={cargando.cargando} disabled={Boolean(motivoFinalizar)} onClick={accionFinalizar} data-confirmar-cierre>
                  {cargando.cargando ? "Guardando…" : "Confirmar cierre"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setFinalizando(false)}>
                  Cancelar
                </Button>
                {motivoFinalizar && <span className="text-sm text-n-600" data-motivo-confirmar>{motivoFinalizar}</span>}
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
