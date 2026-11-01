"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./button";

/**
 * UX (1 de noviembre de 2026): el botón de un `<form action={accionDelServidor}>` sin estado propio (Salir, un
 * formulario de servidor). Toma la espera del formulario (`useFormStatus`): ocupado con su giro desde el toque y,
 * pasados 3 s, «Sigue trabajando…», como cualquier `<Button cargando>`. Un segundo toque no vuelve a enviar.
 */
export function BotonEnviar({ textoCargando, ...props }: Omit<ComponentProps<typeof Button>, "cargando" | "type">) {
  const { pending } = useFormStatus();
  return <Button type="submit" cargando={pending} textoCargando={textoCargando} {...props} />;
}
