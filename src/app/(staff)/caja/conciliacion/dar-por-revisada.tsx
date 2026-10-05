"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { darPorRevisada } from "./actions";

/** Un admin da por revisada una diferencia que ya verificó por su lado (queda su nota). */
export function DarPorRevisada({ id }: { id: string }) {
  const router = useRouter();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!abierto) return <Button type="button" variante="secundario" onClick={() => setAbierto(true)}>Dar por revisada</Button>;
  return (
    <div className="flex flex-col gap-2">
      <Field label="¿Qué revisaste?" value={nota} onChange={(e) => setNota(e.target.value)} />
      <AccionesFormulario error={error}>
        <Button type="button" cargando={envio.cargando} onClick={async () => {
          setError(null);
          const r = await envio.ejecutar(() => darPorRevisada(id, nota));
          if (r.error) return setError(r.error);
          router.refresh();
        }}>Guardar</Button>
        <Button type="button" variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Button>
      </AccionesFormulario>
    </div>
  );
}
