"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { variablesDesconocidas } from "@/lib/contratos/plantilla";
import { publicarContratoGeneral } from "../acciones";

export function EditorContrato({ tituloInicial, cuerpoInicial, publicado }: { tituloInicial: string; cuerpoInicial: string; publicado: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [titulo, setTitulo] = useState(tituloInicial);
  const [cuerpo, setCuerpo] = useState(cuerpoInicial);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const desconocidas = variablesDesconocidas(`${titulo}\n${cuerpo}`);
  const sinCambios = publicado && titulo === tituloInicial && cuerpo === cuerpoInicial;
  const motivo = !titulo.trim() ? "Falta el título." : !cuerpo.trim() ? "Falta el texto del contrato." : desconocidas.length ? `Estas variables no se pueden llenar: ${desconocidas.join(", ")}.` : sinCambios ? "Ya está publicado así." : null;

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(() => publicarContratoGeneral(titulo, cuerpo));
    if (r.error) return setError(r.error);
    setExito(r.exito ?? "Publicado.");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={publicar} data-editor-contrato className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-4">
      <Field label="Título *" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <Textarea label="Texto del contrato *" rows={22} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} />
      <AccionesFormulario error={error} exito={exito}>
        <Button type="submit" cargando={envio.cargando} disabled={Boolean(motivo)}>
          {publicado ? "Publicar versión nueva" : "Publicar contrato"}
        </Button>
        {motivo && <span className="text-sm text-n-600" data-motivo-contrato>{motivo}</span>}
      </AccionesFormulario>
    </form>
  );
}
