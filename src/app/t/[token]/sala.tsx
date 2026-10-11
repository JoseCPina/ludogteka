"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { VideoSala } from "@/components/telemedicina/video-sala";
import { entrarSalaDueno } from "./actions";

/** Abre la videollamada en esta misma pantalla (sin instalar nada). */
export function SalaDueno({ token }: { token: string }) {
  const envio = useEspera();
  const [sala, setSala] = useState<{ url: string; simulada: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (sala) return <VideoSala url={sala.url} simulada={sala.simulada} titulo="Teleconsulta" />;
  return (
    <AccionesFormulario error={error} exito={null}>
      <Button
        type="button"
        cargando={envio.cargando}
        onClick={async () => {
          setError(null);
          const r = await envio.ejecutar(() => entrarSalaDueno(token));
          if (r.error || !r.url) return setError(r.error ?? "No pudimos abrir la sala.");
          setSala({ url: r.url, simulada: Boolean(r.simulada) });
        }}
      >
        Entrar a la videollamada
      </Button>
    </AccionesFormulario>
  );
}
