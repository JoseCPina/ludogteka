"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { EstadoClienteForm } from "./actions";

const ESTADO_INICIAL: EstadoClienteForm = { error: null };

export function ClienteForm({
  action,
  valoresIniciales,
  textoBoton,
}: {
  action: (estadoPrevio: EstadoClienteForm, formData: FormData) => Promise<EstadoClienteForm>;
  valoresIniciales?: { nombre: string; telefono: string; email: string | null };
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

      <Field
        label="Nombre del dueño"
        name="nombre"
        required
        disabled={enviando}
        defaultValue={valoresIniciales?.nombre}
      />
      <Field
        label="Teléfono"
        name="telefono"
        required
        disabled={enviando}
        defaultValue={valoresIniciales?.telefono}
        ayuda="10 dígitos. Puedes escribirlo con espacios, guiones o paréntesis."
      />
      <Field
        label="Correo (opcional)"
        name="email"
        type="email"
        disabled={enviando}
        defaultValue={valoresIniciales?.email ?? ""}
      />

      <Button type="submit" disabled={enviando} className="self-start">
        {enviando ? "Guardando…" : textoBoton}
      </Button>
    </form>
  );
}
