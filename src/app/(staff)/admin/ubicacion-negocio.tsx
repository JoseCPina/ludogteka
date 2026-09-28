"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { guardarUbicacion } from "./ubicacion-actions";

/**
 * Las dos direcciones con las que se cotiza la recolección (la del negocio
 * y la de la base de la camioneta) y cuánto lleva el negocio de su tope
 * mensual de Google Maps.
 */
export function UbicacionNegocio({
  direccion,
  base,
  conCoordenadas,
  consumo,
}: {
  direccion: string;
  base: string;
  conCoordenadas: { negocio: boolean; base: boolean };
  consumo: { usadas: number; tope: number } | null;
}) {
  const router = useRouter();
  const [dir, setDir] = useState(direccion);
  const [bas, setBas] = useState(base);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const envio = useEspera();

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(() => guardarUbicacion({ direccion: dir, base: bas }));
    if (r.error) return setError(r.error);
    setExito(r.aviso ?? "Guardado.");
    router.refresh();
  }

  const porcentaje = consumo && consumo.tope > 0 ? Math.min(100, Math.round((consumo.usadas / consumo.tope) * 100)) : 0;

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      <p className="text-sm text-n-600">
        La ruta de cada recolección va de la base al domicilio del cliente y de ahí al negocio. Escribe las direcciones completas
        (calle, número, colonia); la ciudad de tu negocio se agrega sola.
      </p>
      <Field
        label="Dirección del negocio"
        value={dir}
        onChange={(e) => setDir(e.target.value)}
        ayuda={conCoordenadas.negocio ? "Ubicada en el mapa." : "Todavía sin ubicar."}
      />
      <Field
        label="Dirección de la base (donde se guarda la camioneta)"
        value={bas}
        onChange={(e) => setBas(e.target.value)}
        ayuda={conCoordenadas.base ? "Ubicada en el mapa." : "Todavía sin ubicar. Si es la misma que el negocio, escríbela igual."}
      />
      {consumo && (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-n-700">
            Consultas a Google Maps este mes: <strong className="tabular-nums">{consumo.usadas}</strong> de{" "}
            <span className="tabular-nums">{consumo.tope}</span>. Al llegar al tope, la distancia se captura a mano.
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-n-100" aria-hidden>
            <div className={`h-full ${porcentaje >= 90 ? "bg-coral" : "bg-menta-oscuro"}`} style={{ width: `${porcentaje}%` }} />
          </div>
        </div>
      )}
      <AccionesFormulario error={error} exito={exito}>
        <Button type="submit" cargando={envio.cargando}>
          Guardar y ubicar
        </Button>
      </AccionesFormulario>
    </form>
  );
}
