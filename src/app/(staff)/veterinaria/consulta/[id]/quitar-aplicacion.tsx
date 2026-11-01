"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useEspera } from "@/hooks/use-espera";
import { quitarAplicacionConsulta } from "../../expediente/actions";

/** QA S19: «Quitar» una vacuna o desparasitación aplicada en esta consulta mientras es borrador (la anula en el carnet y quita su cargo). */
export function QuitarAplicacion({ consultaId, perroId, tipo, id, nombre, delCarnet = false }: { consultaId: string; perroId: string; tipo: "vacuna" | "desparasitacion"; id: string; nombre: string; delCarnet?: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const que = tipo === "vacuna" ? "la vacuna" : "la desparasitación";
  return (
    <span className="inline-flex flex-col gap-1" data-quitar-aplicacion={tipo}>
      {!confirmando ? (
        <Button type="button" variante="secundario" className="px-3 text-sm" tamano="compacto" onClick={() => { setError(null); setConfirmando(true); }} data-quitar-boton>
          Quitar
        </Button>
      ) : (
        <span className="flex flex-wrap items-center gap-2 rounded-md bg-coral-suave p-2 text-xs text-coral-oscuro" data-quitar-confirmar>
          <span>¿Quitar {que} {nombre}? Se anula en el carnet{delCarnet ? " (se registró desde el carnet)" : ""} y se quita su cargo.</span>
          <Button
            type="button"
            variante="peligro"
            className="px-3 text-sm" tamano="compacto"
            cargando={envio.cargando}
            onClick={async () => {
              const r = await envio.ejecutar(() => quitarAplicacionConsulta(consultaId, tipo, id, perroId));
              if (r.error) { setError(r.error); setConfirmando(false); return; }
              setConfirmando(false);
              router.refresh();
            }}
            data-quitar-si
          >
            Sí, quitar
          </Button>
          <Button type="button" variante="secundario" className="px-3 text-sm" tamano="compacto" disabled={envio.cargando} onClick={() => setConfirmando(false)}>
            No
          </Button>
        </span>
      )}
      {error && <span className="text-xs text-coral-oscuro" role="alert">{error}</span>}
    </span>
  );
}
