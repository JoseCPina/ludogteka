"use client";

import { useActionState, useState, useTransition } from "react";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { activarAlerta, desactivarAlerta, type EstadoAlertaForm } from "./alertas-actions";

const ESTADO_INICIAL: EstadoAlertaForm = { error: null };

export type CatalogoAlertaOpcion = { id: string; etiqueta: string };
export type AlertaActivaFila = { id: string; alerta_id: string; etiqueta: string; notas: string | null };

export function AlertasManejo({
  perroId,
  catalogo,
  activas,
}: {
  perroId: string;
  catalogo: CatalogoAlertaOpcion[];
  activas: AlertaActivaFila[];
}) {
  const activarConId = activarAlerta.bind(null, perroId);
  const [estado, formAction, enviando] = useActionState(activarConId, ESTADO_INICIAL);

  const idsActivas = new Set(activas.map((a) => a.alerta_id));
  const disponibles = catalogo.filter((c) => !idsActivas.has(c.id));

  return (
    <div className="flex flex-col gap-4">
      {activas.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {activas.map((alerta) => (
            <AlertaFila key={alerta.id} perroId={perroId} alerta={alerta} />
          ))}
        </ul>
      ) : (
        <p className="text-n-600">Este perro no tiene alertas de manejo activas.</p>
      )}

      {disponibles.length > 0 && (
        <form action={formAction} className="flex max-w-md flex-col gap-3 border-t border-n-200 pt-4">
          {estado.error && (
            <Alert variante="error" titulo="No se pudo guardar">
              {estado.error}
            </Alert>
          )}
          {estado.ok && <Alert variante="exito" titulo="Alerta registrada" />}

          <Select label="Registrar alerta" name="alerta_id" required disabled={enviando} defaultValue="">
            <option value="" disabled>
              Elige una alerta
            </option>
            {disponibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
              </option>
            ))}
          </Select>
          <Textarea label="Notas" name="notas" disabled={enviando} rows={2} />
          <Button type="submit" disabled={enviando} className="self-start">
            {enviando ? "Guardando…" : "Registrar alerta"}
          </Button>
        </form>
      )}
    </div>
  );
}

function AlertaFila({
  perroId,
  alerta,
}: {
  perroId: string;
  alerta: AlertaActivaFila;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function desactivar() {
    setError(null);
    startTransition(async () => {
      const resultado = await desactivarAlerta(alerta.id, perroId, motivo);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setConfirmando(false);
      setMotivo("");
    });
  }

  return (
    <li className="rounded-md border-[1.5px] border-naranja bg-naranja-suave p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-bold text-naranja-oscuro">{alerta.etiqueta}</span>
          {alerta.notas && <p className="text-sm text-n-700">{alerta.notas}</p>}
        </div>
        {!confirmando && (
          <Button type="button" variante="secundario" onClick={() => setConfirmando(true)}>
            Desactivar
          </Button>
        )}
      </div>

      {confirmando && (
        <div className="mt-3 flex flex-col gap-2">
          {error && (
            <Alert variante="error" titulo="No se pudo desactivar">
              {error}
            </Alert>
          )}
          <Textarea
            label="Motivo de la baja"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={pendiente}
            rows={2}
            ayuda="Obligatorio — queda registrado en el historial del perro."
          />
          <div className="flex gap-2">
            <Button type="button" variante="peligro" disabled={pendiente} onClick={desactivar}>
              {pendiente ? "Guardando…" : "Confirmar baja"}
            </Button>
            <Button
              type="button"
              variante="secundario"
              disabled={pendiente}
              onClick={() => {
                setConfirmando(false);
                setMotivo("");
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
