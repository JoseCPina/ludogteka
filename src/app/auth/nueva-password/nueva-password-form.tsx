"use client";

import { useActionState } from "react";
import { definirPassword, type EstadoNuevaPassword } from "./actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const estadoInicial: EstadoNuevaPassword = { error: null };

export function NuevaPasswordForm() {
  const [estado, formAction, enviando] = useActionState(definirPassword, estadoInicial);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {estado.error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {estado.error}
        </Alert>
      )}
      <Field
        label="Contraseña nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        autoFocus
        required
        ayuda="Mínimo 6 caracteres."
      />
      <Field
        label="Confirmar contraseña"
        name="confirmacion"
        type="password"
        autoComplete="new-password"
        required
      />
      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Guardando…" : "Guardar y entrar"}
      </Button>
    </form>
  );
}
