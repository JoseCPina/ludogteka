"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { reasignarEstilista } from "../estetica/agenda-actions";

export type CitaPorReasignar = { citaId: string; cuando: string; perro: string; servicio: string };
export type OpcionEstilista = { id: string; nombre: string };

function FilaCita({ cita, estilistas, nombreAusente }: { cita: CitaPorReasignar; estilistas: OpcionEstilista[]; nombreAusente: string }) {
  const router = useRouter();
  const envio = useEspera();
  const [elegida, setElegida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  return (
    <li data-cita-por-reasignar className="flex flex-col gap-2 rounded-md border border-ambar bg-white p-3">
      <p className="text-sm font-semibold text-n-900">
        {cita.cuando} · {cita.perro} <span className="font-normal text-n-600">· {cita.servicio}</span>
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Select label={`Pasarla a (ahora: ${nombreAusente})`} value={elegida} onChange={(e) => setElegida(e.target.value)} disabled={envio.cargando}>
          <option value="">Elige a quién</option>
          {estilistas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </Select>
        <AccionesFormulario error={error} exito={exito}>
          <Button
            type="button"
            disabled={!elegida || envio.cargando}
            cargando={envio.cargando}
            onClick={async () => {
              setError(null);
              setExito(null);
              const res = await envio.ejecutar(() => reasignarEstilista(cita.citaId, elegida, "Ausencia aprobada de la estilista"));
              if (res.error) {
                setError(res.error);
                return;
              }
              setExito(`Quedó con ${res.a ?? "la persona elegida"}`);
              router.refresh();
            }}
          >
            Reasignar
          </Button>
        </AccionesFormulario>
      </div>
    </li>
  );
}

/** Citas de estética que siguen con una persona que ya tiene una ausencia aprobada. */
export function CitasPorReasignar({ citas, estilistas, nombreAusente }: { citas: CitaPorReasignar[]; estilistas: OpcionEstilista[]; nombreAusente: string }) {
  if (citas.length === 0) return null;
  return (
    <div data-citas-por-reasignar className="flex flex-col gap-2 rounded-md border-l-4 border-ambar bg-ambar-suave p-3">
      <p className="text-sm font-bold text-ambar-oscuro">
        {nombreAusente} tiene {citas.length} {citas.length === 1 ? "cita" : "citas"} de estética en este periodo
      </p>
      <p className="text-sm text-n-700">La ausencia ya está aprobada; pásalas a otra estilista para que no se queden sin atender.</p>
      <ul className="flex flex-col gap-2">
        {citas.map((c) => (
          <FilaCita key={c.citaId} cita={c} estilistas={estilistas.filter((e) => e.nombre !== nombreAusente)} nombreAusente={nombreAusente} />
        ))}
      </ul>
    </div>
  );
}
