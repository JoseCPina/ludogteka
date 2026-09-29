"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { responderTicket } from "../../acciones";

export function ResponderTicket({ ticketId, resuelto }: { ticketId: string; resuelto: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <Textarea label={resuelto ? "¿Sigue pasando? Escríbenos y lo reabrimos" : "Tu mensaje"} value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} />
      <AccionesFormulario error={error} exito={exito}>
        <Button
          type="button"
          cargando={envio.cargando}
          onClick={async () => {
            setError(null);
            setExito(null);
            const r = await envio.ejecutar(() => responderTicket(ticketId, texto));
            if (r.error) return setError(r.error);
            setTexto("");
            setExito("Mandado");
            router.refresh();
          }}
        >
          Mandar
        </Button>
      </AccionesFormulario>
    </div>
  );
}
