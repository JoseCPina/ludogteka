"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { PadFirma } from "@/components/firma-pad";
import { firmarConsentimientoTeleconsulta } from "./actions";

/** El consentimiento, con su texto completo, y la firma con el dedo. */
export function FirmarConsentimiento({ token, titulo, cuerpo, dueno }: { token: string; titulo: string; cuerpo: string; dueno: string }) {
  const router = useRouter();
  const envio = useEspera();
  const [nombre, setNombre] = useState(dueno);
  const [firma, setFirma] = useState<string | null>(null);
  const [leido, setLeido] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <details className="rounded-md border border-n-200 bg-n-50 p-3" open>
        <summary className="cursor-pointer font-semibold text-n-900">{titulo}</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm text-n-800">{cuerpo}</p>
      </details>
      <label className="flex items-start gap-2 text-n-800">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={leido} onChange={(e) => setLeido(e.target.checked)} />
        <span>Leí el consentimiento y estoy de acuerdo.</span>
      </label>
      <Field label="Tu nombre completo" name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
      <PadFirma onFirma={setFirma} etiqueta="Firma con el dedo en el recuadro" />
      <AccionesFormulario error={error} exito={null}>
        <Button
          type="button"
          cargando={envio.cargando}
          disabled={!leido}
          onClick={async () => {
            setError(null);
            const r = await envio.ejecutar(() => firmarConsentimientoTeleconsulta(token, nombre, firma));
            if (r.error) return setError(r.error);
            router.refresh();
          }}
        >
          Firmar el consentimiento
        </Button>
      </AccionesFormulario>
    </div>
  );
}
