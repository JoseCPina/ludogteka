"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { urlAudioGuardado } from "./dictado-actions";

/** Escuchar un dictado que la clínica decidió conservar 30 días. */
export function EscucharDictado({ dictadoId }: { dictadoId: string }) {
  const envio = useEspera();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {url ? (
        <audio controls src={url} className="h-8" />
      ) : (
        <Button
          type="button"
          variante="secundario"
          cargando={envio.cargando}
          onClick={async () => {
            setError(null);
            const r = await envio.ejecutar(() => urlAudioGuardado(dictadoId));
            if (r.error || !r.url) return setError(r.error ?? "No pudimos abrir el audio.");
            setUrl(r.url);
          }}
        >
          Escuchar
        </Button>
      )}
      {error && <span className="text-sm text-coral-oscuro">{error}</span>}
    </span>
  );
}
