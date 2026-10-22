"use client";

import { useActionState } from "react";
import { useAccionConTope } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { cambiarMiContrasena, type EstadoCambioContrasena } from "./actions";

const ESTADO_INICIAL: EstadoCambioContrasena = { error: null };

export function CambiarContrasenaForm({ obligatorio }: { obligatorio: boolean }) {
  const [estado, formAction, enviando] = useActionState(useAccionConTope(cambiarMiContrasena), ESTADO_INICIAL);

  return (
    <div className="max-w-lg rounded-lg border border-n-200 bg-white p-5">
      <form action={formAction} className="flex flex-col gap-4" data-modo-cambio={obligatorio ? "obligatorio" : "voluntario"}>
        {estado.error && (
          <Alert variante="error" titulo="No se pudo cambiar">
            {estado.error}
          </Alert>
        )}
        <Field
          label="Contraseña nueva"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          disabled={enviando}
          ayuda="Al menos 6 caracteres."
        />
        <Field
          label="Repite la contraseña nueva"
          name="confirmacion"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          disabled={enviando}
        />
        <AccionesFormulario error={estado.error}>
          <Button type="submit" cargando={enviando}>
            {enviando ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </AccionesFormulario>
      </form>
    </div>
  );
}
