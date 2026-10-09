"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { guardarTarifaGuarderia, type ResultadoTarifaGuarderia } from "./actions";

export function TarifaGuarderiaForm({
  activa: activaInicial,
  servicioTarifaId,
  incluidos: incluidosIniciales,
  dias: diasIniciales,
  servicios,
}: {
  activa: boolean;
  servicioTarifaId: string;
  incluidos: string[];
  dias: number;
  servicios: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const envio = useEspera();
  const [activa, setActiva] = useState(activaInicial);
  const [servicio, setServicio] = useState(servicioTarifaId);
  const [incluidos, setIncluidos] = useState<string[]>(incluidosIniciales);
  const [dias, setDias] = useState(String(diasIniciales));
  const [res, setRes] = useState<ResultadoTarifaGuarderia | null>(null);

  function alternar(id: string) {
    setIncluidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <form
      data-tarifa-guarderia-form
      className="flex flex-col gap-5 rounded-lg border border-n-200 bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await envio.ejecutar(() => guardarTarifaGuarderia(activa, servicio, incluidos, Number(dias)));
        setRes(r);
        if (!r.error) router.refresh();
      }}
    >
      <label className="flex items-start gap-3 text-n-900">
        <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="mt-1 h-5 w-5" />
        <span>
          <span className="font-semibold">Ofrecer la tarifa de cliente de guardería</span>
          <span className="block text-sm text-n-600">Apagada: todos pagan el precio normal de su baño.</span>
        </span>
      </label>

      <Select label="Se cobra con el precio de…" value={servicio} onChange={(e) => setServicio(e.target.value)} ayuda="El servicio equivalente (normalmente el exprés). Su precio sale de su propia tabla, por talla, pelaje y grupo de raza.">
        <option value="">Elige un servicio</option>
        {servicios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </Select>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-n-900">Se aplica cuando agendan…</legend>
        <p className="text-sm text-n-600">Los servicios que, para un cliente de guardería, se cobran al precio de arriba.</p>
        {servicios
          .filter((s) => s.id !== servicio)
          .map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-n-900">
              <input type="checkbox" checked={incluidos.includes(s.id)} onChange={() => alternar(s.id)} className="h-4 w-4" />
              {s.nombre}
            </label>
          ))}
      </fieldset>

      <div className="w-56">
        <Field
          label="Días de actividad"
          type="number"
          min="1"
          max="365"
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          ayuda="Es cliente de guardería quien tiene un pase vigente o una estancia de guardería en los últimos días que pongas (o agendada en los próximos 30)."
        />
      </div>

      <AccionesFormulario error={res?.error} exito={res && !res.error ? res.exito ?? true : null}>
        <Button type="submit" cargando={envio.cargando}>
          Guardar
        </Button>
      </AccionesFormulario>
    </form>
  );
}
