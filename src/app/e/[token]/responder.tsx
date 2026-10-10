"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { PadFirma } from "@/components/firma-pad";
import { aceptarEstimadoPublico, rechazarEstimadoPublico } from "./actions";

/** Aceptar con nombre y firma, o decir que no. */
export function ResponderEstimado({ token, dueno }: { token: string; dueno: string }) {
  const router = useRouter();
  const aceptar = useEspera();
  const rechazar = useEspera();
  const [nombre, setNombre] = useState(dueno);
  const [firma, setFirma] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-n-200 bg-white p-5">
      <h2 className="text-lg font-bold text-n-900">¿Aceptas este estimado?</h2>
      <p className="text-sm text-n-700">Al aceptar, el costo mínimo de cada concepto se agrega a la cuenta de tu mascota y lo pagas en la clínica. Lo demás se cobra solo si hace falta, sin pasar del máximo.</p>
      <Field label="Tu nombre completo" name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
      <PadFirma onFirma={setFirma} etiqueta="Firma con el dedo en el recuadro" />
      <AccionesFormulario error={error} exito={null}>
        <Button
          type="button"
          cargando={aceptar.cargando}
          onClick={async () => {
            setError(null);
            const r = await aceptar.ejecutar(() => aceptarEstimadoPublico(token, nombre, firma));
            if (r.error) return setError(r.error);
            router.refresh();
          }}
        >
          Aceptar el estimado
        </Button>
        {!rechazando && (
          <Button type="button" variante="secundario" onClick={() => setRechazando(true)}>
            No lo acepto
          </Button>
        )}
      </AccionesFormulario>
      {rechazando && (
        <div className="flex flex-col gap-2 rounded-md border border-n-200 bg-n-50 p-3">
          <Field label="¿Quieres decirnos por qué? (opcional)" name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div>
            <Button
              type="button"
              variante="peligro"
              cargando={rechazar.cargando}
              onClick={async () => {
                setError(null);
                const r = await rechazar.ejecutar(() => rechazarEstimadoPublico(token, motivo));
                if (r.error) return setError(r.error);
                router.refresh();
              }}
            >
              Confirmar que no lo acepto
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
