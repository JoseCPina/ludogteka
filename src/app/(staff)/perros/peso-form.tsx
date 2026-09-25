"use client";

import { useActionState } from "react";
import { useAccionConTope } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { hoyNegocio } from "@/lib/formato";
import { registrarPeso, type EstadoPesoForm } from "./peso-actions";
import { useZonaNegocio } from "@/components/zona-negocio";

const ESTADO_INICIAL: EstadoPesoForm = { error: null };

export function PesoForm({ perroId }: { perroId: string }) {
  const zona = useZonaNegocio();
  const registrarConId = registrarPeso.bind(null, perroId);
  const [estado, formAction, enviando] = useActionState(useAccionConTope(registrarConId), ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      {estado.error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {estado.error}
        </Alert>
      )}
      {estado.ok && <Alert variante="exito" titulo="Peso registrado" />}

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Peso (kg)"
          name="peso_kg"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0.1"
          required
          disabled={enviando}
        />
        <Field
          label="Fecha"
          name="fecha"
          type="date"
          max={hoyNegocio(zona)}
          defaultValue={hoyNegocio(zona)}
          required
          disabled={enviando}
        />
      </div>
      <Textarea label="Notas (opcional)" name="notas" disabled={enviando} rows={2} />

      <AccionesFormulario error={estado.error} exito={estado.ok && "Peso registrado"}>
        <Button type="submit" cargando={enviando}>
          {enviando ? "Guardando…" : "Registrar peso"}
        </Button>
      </AccionesFormulario>
    </form>
  );
}
