"use client";

import { useRegistroVivo } from "@/components/concurrencia/registro-vivo";
import { Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { Select } from "@/components/ui/select";
import { cambiarMedicoConsulta } from "../../expediente/actions";

type Medico = { id: string; nombre: string; cedula: string | null };

/**
 * QA S63 (UX): «A cargo de …» de una consulta, y en borrador «Cambiar médico» ahí mismo. El nombre se lee del registro
 * final de la consulta (useRegistroVivo): cambia en cuanto se guarda, sin esperar a que la página se recargue.
 */
export function MedicoConsulta({
  consultaId,
  version,
  medicoId,
  medicos,
  cpa,
  puedeCambiar,
}: {
  consultaId: string;
  version: string | null;
  medicoId: string;
  medicos: Medico[];
  cpa: string | null;
  puedeCambiar: boolean;
}) {
  const vivo = useRegistroVivo("vet_consultas", consultaId, { medico_id: medicoId }, version);
  const actual = medicos.find((m) => m.id === vivo.medico_id) ?? medicos.find((m) => m.id === medicoId);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-sm text-n-600" data-medico-consulta={String(vivo.medico_id ?? medicoId)}>
        A cargo de {actual?.nombre ?? "—"}
        {actual?.cedula ? ` · cédula ${actual.cedula}` : ""}
        {vivo.medico_id === medicoId && cpa ? ` · CPA ${cpa}` : ""}
      </p>
      {puedeCambiar && medicos.length > 1 && (
        <Desplegable texto="Cambiar médico" variante="secundario">
          <FormularioAccion
            accion={(fd) => cambiarMedicoConsulta(consultaId, fd)}
            textoBoton="Guardar médico"
            textoExito="Médico cambiado"
            versiones={version ? [{ t: "vet_consultas", i: consultaId, v: version }] : []}
            registro="esta consulta"
          >
            <Select label="Médico veterinario" name="medico_id" defaultValue={String(vivo.medico_id ?? medicoId)} data-cambiar-medico-consulta>
              {medicos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </Select>
          </FormularioAccion>
        </Desplegable>
      )}
    </div>
  );
}
