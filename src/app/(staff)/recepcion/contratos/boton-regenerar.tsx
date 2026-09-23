"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { regenerarContrato } from "./contratos-actions";

export function BotonRegenerar({ contratoId }: { contratoId: string }) {
  const router = useRouter();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  async function regenerar() {
    setError(null);
    const res = await envio.ejecutar(() => regenerarContrato(contratoId));
    if (res.error) {
      setError(res.error);
      return;
    }
    setListo(true);
    router.refresh();
  }

  return (
    <AccionesFormulario error={error} exito={listo && "Contrato nuevo generado: ya aparece arriba, por firmar"}>
      <Button type="button" cargando={envio.cargando} onClick={regenerar}>
        Generar de nuevo
      </Button>
    </AccionesFormulario>
  );
}
