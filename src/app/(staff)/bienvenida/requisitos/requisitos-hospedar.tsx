"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { guardarRequisitosHospedar } from "../acciones";

export type TipoRequisito = { id: string; etiqueta: string; categoria: string; obligatoria: boolean; vigencia_meses: number };

/** Interruptores: evaluación de comportamiento y cada vacuna/desparasitación (obligatoria y su vigencia en meses). */
export function RequisitosHospedar({ exigeEvaluacion, revisados, tipos }: { exigeEvaluacion: boolean; revisados: boolean; tipos: TipoRequisito[] }) {
  const router = useRouter();
  const envio = useEspera();
  const [evaluacion, setEvaluacion] = useState(exigeEvaluacion);
  const [obligatorias, setObligatorias] = useState<Set<string>>(new Set(tipos.filter((t) => t.obligatoria).map((t) => t.id)));
  const [meses, setMeses] = useState<Record<string, string>>(Object.fromEntries(tipos.map((t) => [t.id, String(t.vigencia_meses)])));
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  function alternar(id: string) {
    setObligatorias((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    const vigencias: Record<string, number> = {};
    for (const t of tipos) {
      const n = Number(meses[t.id]);
      if (!Number.isInteger(n) || n < 1 || n > 60) return setError(`La vigencia de ${t.etiqueta} va de 1 a 60 meses.`);
      vigencias[t.id] = n;
    }
    const r = await envio.ejecutar(() => guardarRequisitosHospedar(evaluacion, [...obligatorias], vigencias));
    if (r.error) return setError(r.error);
    setExito(r.exito ?? "Guardado.");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={guardar} data-requisitos-hospedar className="flex flex-col gap-4">
      <section className="rounded-lg border border-n-200 bg-white p-4">
        <label className="flex items-start gap-3 text-n-900">
          <input type="checkbox" data-requisito="evaluacion" checked={evaluacion} onChange={(e) => setEvaluacion(e.target.checked)} className="mt-1 h-5 w-5" />
          <span>
            <strong>Evaluación de comportamiento</strong>
            <span className="block text-sm text-n-600">
              Se hace una vez por perro antes de su primera estancia. Apagada, el perro se puede reservar sin ella (la puedes seguir registrando en su expediente).
            </span>
          </span>
        </label>
      </section>
      <section className="rounded-lg border border-n-200 bg-white p-4">
        <h2 className="font-semibold text-n-900">Vacunas y desparasitación</h2>
        <p className="mt-1 text-sm text-n-600">Las prendidas tienen que estar vigentes para reservar. La vigencia es cuánto dura cada aplicación.</p>
        <ul className="mt-3 flex flex-col gap-3">
          {tipos.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-3 text-n-900">
                <input type="checkbox" data-requisito={t.etiqueta} checked={obligatorias.has(t.id)} onChange={() => alternar(t.id)} className="h-5 w-5" />
                {t.etiqueta}
              </label>
              <label className="flex items-center gap-2 text-sm text-n-700">
                Vigencia
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={meses[t.id] ?? ""}
                  onChange={(e) => setMeses({ ...meses, [t.id]: e.target.value })}
                  aria-label={`Vigencia de ${t.etiqueta} en meses`}
                  className="min-h-10 w-20 rounded-md border-[1.5px] border-borde px-2"
                />
                meses
              </label>
            </li>
          ))}
        </ul>
      </section>
      <AccionesFormulario error={error} exito={exito}>
        <Button type="submit" cargando={envio.cargando}>
          {revisados ? "Guardar cambios" : "Confirmar requisitos"}
        </Button>
      </AccionesFormulario>
    </form>
  );
}
