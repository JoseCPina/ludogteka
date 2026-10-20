"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { guardarUbicacion } from "./ubicacion-actions";

/**
 * Con qué se cotiza la recolección: la dirección del negocio (la de Perfil, aquí solo se ubica en el mapa), el
 * punto de salida de las rutas (opcional: vacío = sale del negocio) y cuánto lleva el negocio de su tope
 * mensual de Google Maps. QA R23 (N61/N88): la dirección del negocio se edita SOLO en Perfil.
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
  const [bas, setBas] = useState(base);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const envio = useEspera();

  async function ubicar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(() => guardarUbicacion({ base: bas }));
    if (r.error) return setError(r.error);
    setExito(r.aviso ?? "Ubicado en el mapa.");
    router.refresh();
  }

  const porcentaje = consumo && consumo.tope > 0 ? Math.min(100, Math.round((consumo.usadas / consumo.tope) * 100)) : 0;

  return (
    <form method="post" onSubmit={ubicar} className="flex flex-col gap-4">
      <p className="text-sm text-n-600">
        La ruta de cada recolección sale del punto de salida (o del negocio), va al domicilio del cliente y regresa al negocio.
        La ciudad de tu negocio se agrega sola.
      </p>
      <div className="flex flex-col gap-1" data-direccion-negocio-lectura="">
        <span className="text-sm font-semibold text-n-800">Dirección del negocio</span>
        <p className="rounded-md border-[1.5px] border-n-200 bg-n-50 px-3 py-2.5 text-n-900">
          {direccion || <span className="text-n-500">Todavía no la escribes.</span>}
        </p>
        <p className="text-xs text-n-600">
          {direccion ? (conCoordenadas.negocio ? "Ubicada en el mapa. " : "Todavía sin ubicar en el mapa. ") : ""}
          Es la misma de tu perfil y tu página web.{" "}
          <Link href="/admin/perfil" className="font-semibold text-morado underline" data-cambiar-en-perfil="">
            Cambiar en Perfil
          </Link>
        </p>
      </div>
      <Field
        label="Punto de salida de recolección (solo si es distinto a la dirección del negocio)"
        name="base"
        value={bas}
        onChange={(e) => setBas(e.target.value)}
        placeholder="Vacío: las rutas salen de la dirección del negocio"
        ayuda={bas.trim() ? (conCoordenadas.base ? "Ubicado en el mapa." : "Todavía sin ubicar.") : "Por ejemplo, donde se guarda la camioneta. Déjalo vacío si sale del negocio."}
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
        <Button type="submit" cargando={envio.cargando} disabled={!direccion}>
          Ubicar en el mapa
        </Button>
      </AccionesFormulario>
    </form>
  );
}
