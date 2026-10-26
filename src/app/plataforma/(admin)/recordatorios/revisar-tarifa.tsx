"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { revisarTarifaMeta } from "./acciones";

/** Lee en este momento la hoja de tarifas de Meta y guarda el precio si cambió. */
export function RevisarTarifa() {
  const router = useRouter();
  const envio = useEspera({ tope: 60_000 });
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  async function revisar() {
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(() => revisarTarifaMeta());
    if (r.error) return setError(r.error);
    setExito(r.exito ?? "Revisada");
    router.refresh();
  }
  return (
    <AccionesFormulario error={error} exito={exito}>
      <Button type="button" variante="secundario" cargando={envio.cargando} onClick={revisar}>
        Revisar la tarifa de Meta
      </Button>
    </AccionesFormulario>
  );
}
