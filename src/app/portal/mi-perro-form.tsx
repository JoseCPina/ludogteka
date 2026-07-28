"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearTelefono } from "@/lib/telefono";
import { actualizarMiPerro, type EstadoMiPerroForm } from "./perro-actions";

const ESTADO_INICIAL: EstadoMiPerroForm = { error: null };

export function MiPerroForm({
  perroId,
  valoresIniciales,
}: {
  perroId: string;
  valoresIniciales: {
    contacto_emergencia_nombre: string | null;
    contacto_emergencia_telefono: string | null;
    veterinario_nombre: string | null;
    veterinario_telefono: string | null;
    veterinario_clinica: string | null;
    autorizacion_medica_notas: string | null;
    tope_gasto_autorizado: number | null;
    alimentacion_notas: string | null;
  };
}) {
  const actualizarConId = actualizarMiPerro.bind(null, perroId);
  const [estado, formAction, enviando] = useActionState(actualizarConId, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {estado.error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {estado.error}
        </Alert>
      )}
      {estado.ok && <Alert variante="exito" titulo="Cambios guardados" />}

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Contacto de emergencia"
          name="contacto_emergencia_nombre"
          disabled={enviando}
          defaultValue={valoresIniciales.contacto_emergencia_nombre ?? ""}
        />
        <Field
          label="Teléfono de emergencia"
          name="contacto_emergencia_telefono"
          disabled={enviando}
          defaultValue={
            valoresIniciales.contacto_emergencia_telefono
              ? formatearTelefono(valoresIniciales.contacto_emergencia_telefono)
              : ""
          }
        />
      </div>

      <Field
        label="Veterinario de cabecera"
        name="veterinario_nombre"
        disabled={enviando}
        defaultValue={valoresIniciales.veterinario_nombre ?? ""}
      />
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Teléfono del veterinario"
          name="veterinario_telefono"
          disabled={enviando}
          defaultValue={valoresIniciales.veterinario_telefono ?? ""}
        />
        <Field
          label="Clínica"
          name="veterinario_clinica"
          disabled={enviando}
          defaultValue={valoresIniciales.veterinario_clinica ?? ""}
        />
      </div>

      <Textarea
        label="Autorización médica"
        name="autorizacion_medica_notas"
        disabled={enviando}
        defaultValue={valoresIniciales.autorizacion_medica_notas ?? ""}
        ayuda="Instrucciones para el personal si tu perro necesita atención médica y no te localizamos."
      />
      <Field
        label="Tope de gasto autorizado (opcional)"
        name="tope_gasto_autorizado"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        disabled={enviando}
        defaultValue={valoresIniciales.tope_gasto_autorizado ?? ""}
        ayuda="Lo máximo que autorizas gastar en una emergencia sin localizarte antes."
      />
      <Textarea
        label="Notas de alimentación"
        name="alimentacion_notas"
        disabled={enviando}
        defaultValue={valoresIniciales.alimentacion_notas ?? ""}
      />

      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
