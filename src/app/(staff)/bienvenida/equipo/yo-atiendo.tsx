"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { marcarYoAtiendo } from "../acciones";

/** «Yo atiendo la estética»: el dueño cuenta como quien atiende (ya aparece en la agenda como admin). */
export function YoAtiendo({ atiende }: { atiende: boolean }) {
  const envio = useEspera();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function cambiar(valor: boolean) {
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(() => marcarYoAtiendo(valor));
    if (r.error) return setError(r.error);
    setExito(r.exito ?? null);
    router.refresh();
  }

  return (
    <section data-yo-atiendo className="rounded-lg border border-n-200 bg-white p-4">
      <h2 className="font-semibold text-n-900">¿Tú atiendes las citas de estética?</h2>
      <p className="mt-1 text-sm text-n-600">
        Tu cuenta ya aparece en la agenda. Si tú haces los servicios, márcalo y este paso queda listo; si no, invita abajo a tus estilistas.
      </p>
      <AccionesFormulario error={error} exito={exito}>
        {atiende ? (
          <Button type="button" variante="secundario" cargando={envio.cargando} onClick={() => cambiar(false)}>
            Ya no atiendo yo
          </Button>
        ) : (
          <Button type="button" cargando={envio.cargando} onClick={() => cambiar(true)}>
            Yo atiendo las citas
          </Button>
        )}
      </AccionesFormulario>
    </section>
  );
}
