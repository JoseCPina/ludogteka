"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useZonaNegocio } from "@/components/zona-negocio";
import { textoConflicto, type Conflicto } from "@/lib/concurrencia/tipos";

/**
 * Otra persona cambió el registro mientras esta pantalla lo tenía abierto (QA N43). Nada se guardó: la persona
 * escoge recargar (ver lo de la otra persona) o guardar lo suyo encima, que pide una segunda confirmación y queda
 * en la bitácora.
 */
export function AvisoConflicto({
  conflicto,
  registro,
  onRecargar,
  onGuardarEncima,
  cargando = false,
}: {
  conflicto: Conflicto;
  /** «esta reserva», «esta cita», «este cliente»… */
  registro: string;
  onRecargar?: () => void;
  onGuardarEncima: () => void;
  cargando?: boolean;
}) {
  const router = useRouter();
  const zona = useZonaNegocio();
  const [seguro, setSeguro] = useState(false);
  return (
    <div role="alert" data-conflicto-version className="flex flex-col gap-3 rounded-md border-[1.5px] border-ambar bg-ambar-suave p-3 text-sm text-n-900">
      <p className="font-semibold">{conflicto.mismaPersona ? `No se guardó: cambiaste ${registro} desde otra pestaña` : `No se guardó: alguien más cambió ${registro}`}</p>
      <p data-conflicto-texto>{textoConflicto(conflicto, registro, zona)}</p>
      {seguro ? (
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-coral-oscuro">
            Si guardas los tuyos encima, se pierden los cambios {conflicto.mismaPersona ? "que hiciste en la otra pestaña" : `de ${conflicto.quien?.trim() || "la otra persona"}`}. Queda anotado quién lo hizo.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variante="peligro" cargando={cargando} onClick={onGuardarEncima} data-guardar-encima-confirmar>
              Sí, guardar los míos encima
            </Button>
            <Button type="button" variante="secundario" onClick={() => setSeguro(false)}>
              No
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            data-recargar-conflicto
            onClick={() => {
              router.refresh();
              onRecargar?.();
            }}
          >
            Recargar con sus cambios
          </Button>
          <Button type="button" variante="secundario" data-guardar-encima onClick={() => setSeguro(true)}>
            Guardar los míos encima
          </Button>
        </div>
      )}
    </div>
  );
}
