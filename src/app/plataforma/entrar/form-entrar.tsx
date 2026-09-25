"use client";

import { useActionState } from "react";
import { useAccionConTope } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { entrarPlataforma } from "../acciones";

export function FormEntrar() {
  const [estado, accion, enviando] = useActionState(useAccionConTope(entrarPlataforma), { error: null });
  return (
    <form action={accion} className="flex flex-col gap-4">
      <Field label="Correo" name="email" type="email" autoComplete="email" required />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
      <AccionesFormulario error={estado.error}>
        <Button type="submit" cargando={enviando}>Entrar</Button>
      </AccionesFormulario>
    </form>
  );
}
