"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { useEspera } from "@/hooks/use-espera";
import { guardarMiNombre } from "@/app/(staff)/mi-nombre-actions";

/**
 * N24 (QA del 18 de octubre de 2026): una cuenta del personal sin nombre en su perfil ni en su ficha de empleado
 * lo escribe una sola vez antes de seguir. Así nadie queda como «Sin nombre» en el encabezado, los cobros o Permisos.
 */
export function PedirNombre() {
  const router = useRouter();
  const envio = useEspera();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await envio.ejecutar(() => guardarMiNombre(nombre));
    if (res.error) return setError(res.error);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={guardar} className="mx-auto mt-6 max-w-md space-y-4 rounded-xl border border-n-200 bg-white p-5" data-pedir-nombre>
      <h1 className="text-lg font-semibold text-n-900">Antes de seguir, ¿cómo te llamas?</h1>
      <p className="text-sm text-n-600">
        Tu cuenta todavía no tiene nombre. Se usa en los cobros, la agenda y lo que registras, para que el equipo sepa quién lo hizo. Solo te lo pedimos una vez.
      </p>
      <Field label="Nombre completo" name="nombre_completo" autoComplete="name" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <AccionesFormulario error={error}>
        <Button type="submit" cargando={envio.cargando}>Guardar y seguir</Button>
      </AccionesFormulario>
    </form>
  );
}
