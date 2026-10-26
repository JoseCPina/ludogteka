"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { guardarPoliticaSalida } from "./actions";

/** La política de salida anticipada del negocio (N132): ajustar la cuenta a lo usado o cobrar la estancia completa. */
export function PoliticaSalidaForm({ completa: inicial }: { completa: boolean }) {
  const [completa, setCompleta] = useState(inicial);
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setExito(null);
    const res = await envio.ejecutar(() => guardarPoliticaSalida(completa));
    if (res.error) setError(res.error);
    else setExito(res.exito ?? "Guardado.");
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
      <h2 className="text-lg font-bold text-n-900">Salida anticipada</h2>
      <p className="text-sm text-n-700">
        Cuando un perro sale antes de su salida prevista, por omisión la cuenta baja a las noches que usó (en guardería, a los días): lo no usado se quita con el motivo
        «Salida anticipada», y el check-out lo dice antes de confirmar («Sale 1 noche antes: la cuenta baja de $450 a $270»).
      </p>
      <label className="flex items-start gap-2 text-sm text-n-900">
        <input type="checkbox" className="mt-0.5 h-5 w-5" checked={completa} onChange={(e) => setCompleta(e.target.checked)} data-cobrar-estancia-completa />
        <span>
          <span className="font-semibold">Cobrar la estancia completa aunque salga antes</span>
          <span className="block text-n-600">El check-out avisa «Se cobra la estancia completa por la política del negocio» y la cuenta no cambia.</span>
        </span>
      </label>
      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" cargando={envio.cargando} onClick={guardar} data-guardar-politica-salida>
          Guardar
        </Button>
      </AccionesFormulario>
    </div>
  );
}
