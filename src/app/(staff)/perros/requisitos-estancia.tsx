"use client";

import { useActionState, useState } from "react";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario } from "@/lib/formato";
import {
  marcarEvaluacionComportamiento,
  quitarEvaluacionComportamiento,
  marcarEstadoReproductivo,
  type EstadoRequisitoEstancia,
} from "./requisitos-estancia-actions";

export type RequisitosEstanciaPerro = {
  sexo: string | null;
  en_celo: boolean;
  gestante: boolean;
  evaluacion_comportamiento_fecha: string | null;
  evaluacion_comportamiento_notas: string | null;
  evaluadoPorNombre: string | null;
  // Nombres de las alertas activas que bloquean guardería y hotel, ya
  // resueltas contra el catálogo. Se gestionan en "Alertas de manejo";
  // aquí solo se avisa que están bloqueando.
  alertasBloqueantes: string[];
};

const ESTADO_INICIAL: EstadoRequisitoEstancia = { error: null };

/**
 * Los requisitos de guardería y hotel que viven en el expediente, en un
 * solo lugar: la evaluación previa de comportamiento (una vez por perro,
 * con fecha y quién), y las marcas de celo/gestante para hembras. Los
 * sanitarios tienen su propia sección; las alertas también. Aquí se
 * enseña qué está bloqueando una reserva y por qué, antes de que
 * recepción se entere en el mostrador.
 */
export function RequisitosEstancia({
  perroId,
  clienteId,
  hoy,
  datos,
  soloLectura,
  esAdmin,
}: {
  perroId: string;
  clienteId: string | null;
  hoy: string;
  datos: RequisitosEstanciaPerro;
  soloLectura: boolean;
  esAdmin: boolean;
}) {
  const marcarConIds = marcarEvaluacionComportamiento.bind(null, perroId, clienteId);
  const [estadoEval, accionEval, enviandoEval] = useActionState(marcarConIds, ESTADO_INICIAL);
  const [capturando, setCapturando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enCelo, setEnCelo] = useState(datos.en_celo);
  const [gestante, setGestante] = useState(datos.gestante);

  const evaluada = Boolean(datos.evaluacion_comportamiento_fecha);
  const esHembra = datos.sexo === "hembra";
  const bloqueos: string[] = [];
  if (!evaluada) bloqueos.push("falta la evaluación previa de comportamiento (admin puede autorizar excepción)");
  if (enCelo) bloqueos.push("está marcada en celo");
  if (gestante) bloqueos.push("está marcada como gestante");
  for (const a of datos.alertasBloqueantes) bloqueos.push(`tiene activa la alerta "${a}"`);

  async function cambiarReproductivo(cambios: { en_celo?: boolean; gestante?: boolean }) {
    setCargando(true);
    setError(null);
    const res = await marcarEstadoReproductivo(perroId, clienteId, cambios);
    setCargando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (cambios.en_celo !== undefined) setEnCelo(cambios.en_celo);
    if (cambios.gestante !== undefined) setGestante(cambios.gestante);
  }

  async function quitarEvaluacion() {
    setCargando(true);
    setError(null);
    const res = await quitarEvaluacionComportamiento(perroId, clienteId);
    setCargando(false);
    if (res.error) setError(res.error);
  }

  return (
    <div className="flex flex-col gap-4">
      {bloqueos.length === 0 ? (
        <p className="rounded-md border-[1.5px] border-verde bg-verde-suave px-3 py-2 text-sm font-semibold text-verde-oscuro">
          Nada bloquea una reserva de guardería u hotel por estos requisitos.
        </p>
      ) : (
        <div className="rounded-md border-[1.5px] border-naranja bg-naranja-suave px-3 py-2 text-sm text-naranja-oscuro">
          <p className="font-semibold">Hoy no se le puede reservar guardería ni hotel:</p>
          <ul className="mt-1 list-inside list-disc">
            {bloqueos.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-n-200 bg-white p-4">
        <p className="font-semibold text-n-900">Evaluación previa de comportamiento</p>
        {evaluada ? (
          <>
            <p className="mt-1 text-sm text-n-700">
              Hecha el {formatearFechaCalendario(datos.evaluacion_comportamiento_fecha as string)}
              {datos.evaluadoPorNombre ? ` · registró ${datos.evaluadoPorNombre}` : ""}
            </p>
            {datos.evaluacion_comportamiento_notas && (
              <p className="mt-1 text-sm text-n-600">{datos.evaluacion_comportamiento_notas}</p>
            )}
            {esAdmin && (
              <Button
                type="button"
                variante="secundario"
                className="mt-3"
                disabled={cargando}
                onClick={quitarEvaluacion}
              >
                Quitar evaluación (solo admin)
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-n-600">
              Se hace una vez por perro antes de su primera estancia. Sin ella, la reserva avisa y solo
              un admin puede pasar por encima con motivo.
            </p>
            {!soloLectura && !capturando && (
              <Button type="button" className="mt-3" onClick={() => setCapturando(true)}>
                Marcar evaluación hecha
              </Button>
            )}
            {!soloLectura && capturando && (
              <form action={accionEval} className="mt-3 flex flex-col gap-3">
                {estadoEval.error && (
                  <Alert variante="error" titulo="No se pudo guardar">
                    {estadoEval.error}
                  </Alert>
                )}
                <div className="max-w-xs">
                  <Field label="Fecha de la evaluación" name="fecha" type="date" defaultValue={hoy} max={hoy} required />
                </div>
                <Textarea label="Notas (opcional)" name="notas" placeholder="Cómo se comportó, con quién se evaluó" />
                <div className="flex gap-2">
                  <Button type="submit" disabled={enviandoEval}>
                    {enviandoEval ? "Guardando…" : "Guardar evaluación"}
                  </Button>
                  <Button type="button" variante="secundario" onClick={() => setCapturando(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      {esHembra && (
        <div className="rounded-lg border border-n-200 bg-white p-4">
          <p className="font-semibold text-n-900">Estado reproductivo</p>
          <p className="mt-1 text-sm text-n-600">
            Una perra en celo o gestante no se queda en guardería ni hotel mientras dure. Quita la marca
            cuando pase.
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-n-900">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={enCelo}
                disabled={soloLectura || cargando}
                onChange={(e) => cambiarReproductivo({ en_celo: e.target.checked })}
              />
              En celo
            </label>
            <label className="flex items-center gap-2 text-n-900">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={gestante}
                disabled={soloLectura || cargando}
                onChange={(e) => cambiarReproductivo({ gestante: e.target.checked })}
              />
              Gestante
            </label>
          </div>
        </div>
      )}

      {error && (
        <Alert variante="error" titulo="No se pudo guardar el cambio">
          {error}
        </Alert>
      )}
    </div>
  );
}
