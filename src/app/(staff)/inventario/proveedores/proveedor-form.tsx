"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { EstadoProveedorForm } from "./actions";

const ESTADO_INICIAL: EstadoProveedorForm = { error: null };

export function ProveedorForm({
  action,
  valoresIniciales,
  textoBoton,
}: {
  action: (estadoPrevio: EstadoProveedorForm, formData: FormData) => Promise<EstadoProveedorForm>;
  valoresIniciales?: {
    nombre: string;
    contacto_nombre: string | null;
    telefono: string | null;
    notas: string | null;
  };
  textoBoton: string;
}) {
  const [estado, formAction, enviando] = useActionState(action, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {estado.error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {estado.error}
        </Alert>
      )}
      {estado.ok && <Alert variante="exito" titulo="Cambios guardados" />}

      <Field label="Nombre" name="nombre" required disabled={enviando} defaultValue={valoresIniciales?.nombre} />
      <Field
        label="Persona de contacto (opcional)"
        name="contacto_nombre"
        disabled={enviando}
        defaultValue={valoresIniciales?.contacto_nombre ?? ""}
      />
      <Field
        label="Teléfono (opcional)"
        name="telefono"
        disabled={enviando}
        defaultValue={valoresIniciales?.telefono ?? ""}
      />
      <Textarea
        label="Notas (opcional)"
        name="notas"
        rows={3}
        disabled={enviando}
        defaultValue={valoresIniciales?.notas ?? ""}
      />

      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? "Guardando…" : textoBoton}
      </Button>
    </form>
  );
}
