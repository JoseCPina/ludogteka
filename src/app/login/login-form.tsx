"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function LoginForm({ errorInicial = null }: { errorInicial?: string | null }) {
  const estadoInicial: EstadoLogin = { error: errorInicial };
  const [estado, formAction, enviando] = useActionState(iniciarSesion, estadoInicial);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {estado.error && (
        <Alert variante="error" titulo="No se pudo iniciar sesión">
          {estado.error}
        </Alert>
      )}
      <Field
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        autoFocus
        required
      />
      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
