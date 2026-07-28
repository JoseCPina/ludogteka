"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { registrarPeso, type EstadoPesoForm } from "./peso-actions";

const ESTADO_INICIAL: EstadoPesoForm = { error: null };

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PesoForm({ perroId }: { perroId: string }) {
  const registrarConId = registrarPeso.bind(null, perroId);
  const [estado, formAction, enviando] = useActionState(registrarConId, ESTADO_INICIAL);

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
          max={hoyISO()}
          defaultValue={hoyISO()}
          required
          disabled={enviando}
        />
      </div>
      <Textarea label="Notas (opcional)" name="notas" disabled={enviando} rows={2} />

      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? "Guardando…" : "Registrar peso"}
      </Button>
    </form>
  );
}
