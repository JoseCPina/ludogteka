"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { marcarMensajeAtendido } from "@/app/(staff)/admin/recordatorios/actions";

/** «Ya lo atendí»: el mensaje sale de «Por atender». */
export function MarcarAtendido({ id }: { id: string }) {
  const router = useRouter();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  async function marcar() {
    setError(null);
    const res = await envio.ejecutar(() => marcarMensajeAtendido(id));
    if (res.error) return setError(res.error);
    router.refresh();
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variante="secundario" cargando={envio.cargando} onClick={marcar}>
        Ya lo atendí
      </Button>
      {error && <p className="text-xs text-coral-oscuro">{error}</p>}
    </div>
  );
}
