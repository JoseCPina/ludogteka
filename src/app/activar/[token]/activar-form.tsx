"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useEspera } from "@/hooks/use-espera";
import { activarCuentaPortal } from "./acciones";

export function ActivarForm({ token }: { token: string }) {
  const router = useRouter();
  const envio = useEspera();
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirmar) return setError("Las contraseñas no coinciden.");
    const res = await envio.ejecutar(() => activarCuentaPortal(token, password));
    if (res.error) return setError(res.error);
    router.replace("/portal");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Field label="Escoge tu contraseña" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} ayuda="Mínimo 8 caracteres." />
      <Field label="Repítela" type="password" autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
      <AccionesFormulario error={error}>
        <Button type="submit" cargando={envio.cargando}>Abrir mi cuenta</Button>
      </AccionesFormulario>
    </form>
  );
}
