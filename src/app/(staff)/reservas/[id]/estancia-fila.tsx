"use client";

import { describirEstancia } from "@/lib/formato";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { esEnterParaConfirmar, valorDelCampo } from "@/lib/ui/campo-vivo";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { formatearFechaCalendario } from "@/lib/formato";
import { cancelarEstancia, marcarNoLlego } from "../reserva-actions";
import { MoverFechas } from "../mover-fechas";
import { AvisoConflicto } from "@/components/concurrencia/aviso-conflicto";
import type { Conflicto } from "@/lib/concurrencia/tipos";
import { CargosSeccion, type Cargo, type ServicioCargo } from "../cargos-seccion";
import { cerrarFrase } from "@/lib/texto/frases";

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
  /** updated_at de la estancia al cargar la pantalla (QA N43). */
  version: string | null;
  /** QA S15: «Cancelada por X el …» y el motivo, si se canceló. */
  cancelacion?: { quien: string; cuando: string; motivo: string | null } | null;
  // Entró con la casa llena (check-in tardío confirmado): en cuánto quedó, por ejemplo «11/10 de día».
  sobrecupo?: string | null;
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
  cuentaCobrado = 0,
  cuentaDevuelto = 0,
}: {
  fila: FilaEstancia;
  cargosIniciales: Cargo[];
  serviciosCargo: ServicioCargo[];
  distanciaClienteKm?: number | null;
  cuentaCobrado?: number;
  cuentaDevuelto?: number;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState(fila.estado);
  const [fechaEntrada, setFechaEntrada] = useState(fila.fechaEntrada);
  const [fechaSalida, setFechaSalida] = useState(fila.fechaSalida);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const campoMotivo = useRef<HTMLTextAreaElement>(null);
  const [confirmandoNoLlego, setConfirmandoNoLlego] = useState(false);
  const [moviendoFechas, setMoviendoFechas] = useState(false);
  const [version, setVersion] = useState(fila.version);
  // Al recargar (otra persona la cambió), la fila toma lo que dice la base.
  const [versionVista, setVersionVista] = useState(fila.version);
  if (fila.version !== versionVista) {
    setVersionVista(fila.version);
    setVersion(fila.version);
    setEstado(fila.estado);
    setFechaEntrada(fila.fechaEntrada);
    setFechaSalida(fila.fechaSalida);
  }
  const [conflicto, setConflicto] = useState<{ c: Conflicto; accion: "cancelar" | "no_llego" } | null>(null);
  const cargando = useEspera();
  const [error, setError] = useState<string | null>(null);
  // Qué pasó con el pase al cancelar (se devolvió, o venció y no).
  const [avisoBono, setAvisoBono] = useState<string | null>(null);

  const esGuarderia = fila.categoria === "guarderia";
  const porHora = fila.unidad === "hora";
  const editable = estado === "reservada" || estado === "confirmada";
  const cancelada = estado === "cancelada" || estado === "no_llego";
  // precioUnitario es tarifa POR NOCHE/DÍA/HORA, no el total de la
  // estancia (ver tarifas: "el total es N × precio del tramo"). Para
  // guardería por día noches siempre da 1; por hora, la cantidad son las
  // horas.
  const noches = Math.round(
    (new Date(fechaSalida).getTime() - new Date(fechaEntrada).getTime()) / 86400000
  );
  const cantidad = porHora ? (fila.horas ?? 1) : noches;

  const control = (forzar: boolean) => ({ versiones: version ? [{ t: "estancias", i: fila.id, v: version }] : [], forzar });

  async function accionCancelar(forzar = false) {
    setError(null);
    const motivoFinal = valorDelCampo(campoMotivo, motivoCancelar);
    setMotivoCancelar(motivoFinal);
    const res = await cargando.ejecutar(() => cancelarEstancia(fila.id, control(forzar), motivoFinal));
    if (res.conflicto) return setConflicto({ c: res.conflicto, accion: "cancelar" });
    if (res.error) {
      setError(res.error);
      return;
    }
    setConflicto(null);
    setEstado("cancelada");
    setAvisoBono(res.aviso ?? null);
    setConfirmandoCancelar(false);
  }

  async function accionNoLlego(forzar = false) {
    setError(null);
    const res = await cargando.ejecutar(() => marcarNoLlego(fila.id, control(forzar)));
    if (res.conflicto) return setConflicto({ c: res.conflicto, accion: "no_llego" });
    if (res.error) {
      setError(res.error);
      return;
    }
    setConflicto(null);
    setEstado("no_llego");
    setConfirmandoNoLlego(false);
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
        {cancelada ? (
          // R35: una estancia cancelada (o que no llegó) no suma a la cuenta —cuenta_lineas_reserva la excluye—,
          // así que su total es $0. El precio que tenía queda tachado como referencia; lo cobrado y lo devuelto
          // de la cuenta salen arriba, junto al saldo.
          <span data-total-estancia-cancelada>
            Total:{" "}
            <span className="font-semibold text-n-900">$0.00</span>{" "}
            <span className="text-n-500">
              (no se cobra; era <s>${(fila.precioUnitario * (porHora || !esGuarderia ? cantidad : 1)).toFixed(2)}</s>)
            </span>
          </span>
        ) : (
          <span>
            {porHora
              ? `Precio por hora × ${cantidad}`
              : esGuarderia
                ? "Precio"
                : `Precio por noche × ${noches}`}
            :{" "}
            <span className="font-semibold text-n-900">
              ${fila.precioUnitario.toFixed(2)}
              {(porHora || !esGuarderia) && ` = ${(fila.precioUnitario * cantidad).toFixed(2)}`}
            </span>
          </span>
        )}
      </div>

      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
        </Alert>
      )}

      {fila.sobrecupo && (
        <p className="text-sm text-ambar-oscuro" data-sobrecupo-estancia>
          Entró con la casa llena: quedó en {fila.sobrecupo}.
        </p>
      )}
      {estado === "cancelada" && fila.cancelacion && (
        <p className="text-sm text-n-700" data-cancelacion-estancia>
          {cerrarFrase(`Cancelada por ${fila.cancelacion.quien} el ${fila.cancelacion.cuando}`)}
          {fila.cancelacion.motivo ? <> Motivo: {fila.cancelacion.motivo}</> : " Sin motivo escrito."}
        </p>
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
          {conflicto && (
            <AvisoConflicto
              conflicto={conflicto.c}
              registro="esta reserva"
              cargando={cargando.cargando}
              onRecargar={() => {
                setConflicto(null);
                setConfirmandoCancelar(false);
                setConfirmandoNoLlego(false);
              }}
              onGuardarEncima={() => (conflicto.accion === "cancelar" ? accionCancelar(true) : accionNoLlego(true))}
            />
          )}
          {moviendoFechas ? (
            <MoverFechas
              estanciaId={fila.id}
              esGuarderia={esGuarderia}
              entrada={fechaEntrada}
              salida={fechaSalida}
              version={version}
              onHecho={(r) => {
                setFechaEntrada(r.entrada);
                setFechaSalida(r.salida);
                if (r.version) setVersion(r.version);
                setMoviendoFechas(false);
                router.refresh();
              }}
              onCancelar={() => setMoviendoFechas(false)}
            />
          ) : confirmandoCancelar ? (
            <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-coral bg-coral-suave p-3">
              <p className="text-sm font-semibold text-coral-oscuro">
                ¿Cancelar {describirEstancia(fila.servicioNombre, fila.perroNombre, fila.fechaEntrada, fila.fechaSalida, fila.categoria)}?
              </p>
              <Textarea
                label="Motivo (opcional)"
                name="motivo_cancelacion"
                rows={2}
                maxLength={500}
                ref={campoMotivo}
                value={motivoCancelar}
                onChange={(e) => setMotivoCancelar(e.target.value)}
                onKeyDown={(e) => { if (esEnterParaConfirmar(e)) { e.preventDefault(); void accionCancelar(); } }}
                ayuda="Queda en la bitácora con tu nombre y la hora."
              />
              <div className="flex gap-2">
                <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={() => accionCancelar()}>
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
                <Button type="button" variante="peligro" cargando={cargando.cargando} onClick={() => accionNoLlego()}>
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
          cancelada={cancelada}
          cuentaCobrado={cuentaCobrado}
          cuentaDevuelto={cuentaDevuelto}
        />
      </div>
    </div>
  );
}
