"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { cambiarEstadoTicket, proponerArticuloDeTicket, responderComoPeluDesk } from "../acciones";

export function ControlesTicket({ ticketId, estado, propuesta }: { ticketId: string; estado: string; propuesta: string | null }) {
  const router = useRouter();
  const envio = useEspera();
  const cambio = useEspera();
  const prop = useEspera();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const estadoA = async (e: "abierto" | "en_proceso" | "resuelto") => {
    setError(null);
    const r = await cambio.ejecutar(() => cambiarEstadoTicket(ticketId, e));
    if (r.error) return setError(r.error);
    setExito(r.aviso ?? "Listo");
    router.refresh();
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Textarea label="Respuesta de PeluDesk" value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} />
      <AccionesFormulario error={error} exito={exito}>
        <Button
          type="button"
          cargando={envio.cargando}
          onClick={async () => {
            setError(null);
            const r = await envio.ejecutar(() => responderComoPeluDesk(ticketId, texto));
            if (r.error) return setError(r.error);
            setTexto("");
            setExito(r.aviso ?? "Mandado");
            router.refresh();
          }}
        >
          Contestar
        </Button>
        {estado !== "en_proceso" && estado !== "resuelto" && (
          <Button type="button" variante="secundario" cargando={cambio.cargando} onClick={() => estadoA("en_proceso")}>
            En proceso
          </Button>
        )}
        {estado !== "resuelto" ? (
          <Button type="button" variante="secundario" cargando={cambio.cargando} onClick={() => estadoA("resuelto")}>
            Marcar resuelto
          </Button>
        ) : (
          <Button type="button" variante="secundario" cargando={cambio.cargando} onClick={() => estadoA("abierto")}>
            Reabrir
          </Button>
        )}
      </AccionesFormulario>

      <div className="flex flex-col gap-2 border-t border-n-200 pt-4">
        <h2 className="font-bold text-n-900">Artículo propuesto para la documentación</h2>
        {propuesta ? (
          <>
            <p className="text-sm text-n-600">Pégalo en src/lib/ayuda/articulos/ (revísalo: la IA solo usa lo que contestaste en el ticket).</p>
            <textarea readOnly value={propuesta} rows={14} className="w-full rounded-md border border-n-300 bg-n-50 p-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} data-articulo-propuesto />
            <Button
              type="button"
              variante="secundario"
              className="self-start"
              onClick={async () => {
                try {
                  if (!navigator.clipboard?.writeText) throw new Error("sin portapapeles");
                  await navigator.clipboard.writeText(propuesta);
                  setCopiado(true);
                } catch {
                  // Sin portapapeles (http o navegador viejo): se selecciona el texto para copiarlo a mano.
                  const area = document.querySelector<HTMLTextAreaElement>("[data-articulo-propuesto]");
                  area?.select();
                  setCopiado(Boolean(area) && Boolean(document.execCommand?.("copy")));
                }
              }}
            >
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-n-600">Al resolver un ticket que no estaba documentado, aquí sale la propuesta del artículo nuevo.</p>
        )}
        <Button
          type="button"
          variante="secundario"
          className="self-start"
          cargando={prop.cargando}
          onClick={async () => {
            await prop.ejecutar(() => proponerArticuloDeTicket(ticketId));
            router.refresh();
          }}
        >
          {propuesta ? "Volver a proponer" : "Proponer artículo"}
        </Button>
      </div>
    </div>
  );
}
