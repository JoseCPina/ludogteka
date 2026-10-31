"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearFechaCalendario } from "@/lib/formato";
import { darPorRevisadasHasta } from "./actions";

/**
 * El admin da por revisadas, en un paso, todas las diferencias abiertas cuyo
 * pago o cobro ocurrió antes de una fecha (hora del negocio), con una nota.
 * `fechas` son los días (AAAA-MM-DD, zona del negocio) de cada diferencia
 * abierta: con eso se le dice cuántas va a cerrar antes de apretar.
 */
export function RevisarHasta({ fechas, hoy }: { fechas: string[]; hoy: string }) {
  const router = useRouter();
  const envio = useEspera();
  const [abierto, setAbierto] = useState(false);
  const [hasta, setHasta] = useState(hoy);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const cuantas = hasta ? fechas.filter((f) => f < hasta).length : 0;

  if (!abierto) {
    return (
      <div className="flex flex-col gap-2">
        <Button type="button" variante="secundario" onClick={() => setAbierto(true)} data-revisar-hasta>
          Dar por revisadas todas las anteriores a…
        </Button>
        {exito && <p className="text-sm font-semibold text-verde-oscuro" data-revisar-hasta-exito>{exito}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-n-50 p-4" data-revisar-hasta-formulario>
      <p className="text-sm text-n-700">
        Se dan por revisadas todas las diferencias cuyo pago o cobro ocurrió <strong>antes</strong> de la fecha que escojas (las de esa fecha en adelante se quedan). Queda tu nota en cada una.
      </p>
      <Field label="Anteriores a" type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} />
      <Field label="¿Qué revisaste?" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Revisadas contra el panel de Mercado Pago" />
      <p className="text-sm text-n-700" data-revisar-hasta-conteo>
        {!hasta
          ? "Escoge una fecha."
          : cuantas === 0
            ? `No hay diferencias anteriores al ${formatearFechaCalendario(hasta)}.`
            : cuantas === 1
              ? `Se dará por revisada 1 diferencia anterior al ${formatearFechaCalendario(hasta)}.`
              : `Se darán por revisadas ${cuantas} diferencias anteriores al ${formatearFechaCalendario(hasta)}.`}
      </p>
      <AccionesFormulario error={error}>
        <Button
          type="button"
          cargando={envio.cargando}
          disabled={!hasta || cuantas === 0}
          onClick={async () => {
            setError(null);
            const r = await envio.ejecutar(() => darPorRevisadasHasta(hasta, nota));
            if (r.error) return setError(r.error);
            setExito(r.cerradas === 1 ? "Listo: 1 diferencia quedó revisada." : `Listo: ${r.cerradas} diferencias quedaron revisadas.`);
            setAbierto(false);
            setNota("");
            router.refresh();
          }}
        >
          Dar por revisadas {cuantas > 0 ? `(${cuantas})` : ""}
        </Button>
        <Button type="button" variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Button>
      </AccionesFormulario>
    </div>
  );
}
