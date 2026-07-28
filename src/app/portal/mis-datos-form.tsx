"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearTelefono } from "@/lib/telefono";
import { actualizarMisDatos, type EstadoMisDatos } from "./actions";

const ESTADO_INICIAL: EstadoMisDatos = { error: null };

export function MisDatosForm({
  nombre,
  telefono,
  email,
}: {
  nombre: string;
  telefono: string;
  email: string | null;
}) {
  const [estado, formAction, enviando] = useActionState(actualizarMisDatos, ESTADO_INICIAL);

  return (
    <div className="max-w-lg rounded-lg border border-n-200 bg-white p-5">
      <h2 className="mb-1 text-lg font-bold text-n-900">Tus datos</h2>
      <p className="mb-4 text-sm text-n-600">
        Tu nombre lo maneja recepción — si está mal, avísales directamente.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        {estado.error && (
          <Alert variante="error" titulo="No se pudo guardar">
            {estado.error}
          </Alert>
        )}
        {estado.ok && <Alert variante="exito" titulo="Cambios guardados" />}

        <div>
          <p className="mb-1.5 text-sm font-semibold text-n-800">Nombre</p>
          <p className="flex min-h-12 items-center rounded-md border-[1.5px] border-n-200 bg-n-50 px-3.5 text-n-600">
            {nombre}
          </p>
        </div>

        <Field
          label="Teléfono"
          name="telefono"
          required
          disabled={enviando}
          defaultValue={formatearTelefono(telefono)}
          ayuda="10 dígitos. Puedes escribirlo con espacios o guiones."
        />
        <Field
          label="Correo"
          name="email"
          type="email"
          disabled={enviando}
          defaultValue={email ?? ""}
        />

        <Button type="submit" disabled={enviando} className="self-start">
          {enviando ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>
    </div>
  );
}
