"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { registrarAlergia, type EstadoAlertaForm } from "./alertas-actions";

const ESTADO_INICIAL: EstadoAlertaForm = { error: null };

export type AlergiaFila = {
  id: string;
  alergeno: string;
  gravedad: "leve" | "moderada" | "grave" | null;
  notas: string | null;
};

const ESTILO_GRAVEDAD: Record<string, string> = {
  grave: "border-naranja bg-naranja-suave text-naranja-oscuro",
  moderada: "border-amarillo bg-amarillo-suave text-amarillo-oscuro",
  leve: "border-n-300 bg-n-100 text-n-700",
};

export function AlergiasSeccion({
  perroId,
  alergias,
}: {
  perroId: string;
  alergias: AlergiaFila[];
}) {
  const registrarConId = registrarAlergia.bind(null, perroId);
  const [estado, formAction, enviando] = useActionState(registrarConId, ESTADO_INICIAL);

  return (
    <div className="flex flex-col gap-4">
      {alergias.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {alergias.map((a) => (
            <li
              key={a.id}
              className={`rounded-md border-[1.5px] p-3 ${
                ESTILO_GRAVEDAD[a.gravedad ?? "leve"] ?? ESTILO_GRAVEDAD.leve
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{a.alergeno}</span>
                {a.gravedad && (
                  <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold uppercase tracking-wide">
                    {a.gravedad}
                  </span>
                )}
              </div>
              {a.notas && <p className="mt-1 text-sm">{a.notas}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-n-600">Este perro no tiene alergias registradas.</p>
      )}

      <form action={formAction} className="flex max-w-md flex-col gap-3 border-t border-n-200 pt-4">
        {estado.error && (
          <Alert variante="error" titulo="No se pudo guardar">
            {estado.error}
          </Alert>
        )}
        {estado.ok && <Alert variante="exito" titulo="Alergia registrada" />}

        <Field label="Alérgeno" name="alergeno" required disabled={enviando} placeholder="ej. Pollo" />
        <Select label="Gravedad" name="gravedad" disabled={enviando} defaultValue="leve">
          <option value="leve">Leve</option>
          <option value="moderada">Moderada</option>
          <option value="grave">Grave</option>
        </Select>
        <Textarea label="Notas" name="notas" disabled={enviando} rows={2} />

        <Button type="submit" disabled={enviando} className="self-start">
          {enviando ? "Guardando…" : "Registrar alergia"}
        </Button>
      </form>
    </div>
  );
}
