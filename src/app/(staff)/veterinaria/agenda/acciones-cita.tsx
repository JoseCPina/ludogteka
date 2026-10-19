"use client";

import Link from "next/link";
import { BotonAccion, Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { MedicoVet } from "@/lib/veterinaria/expediente";
import { estadoCita, iniciarDesdeCita, reprogramarCita } from "../expediente/actions";

/** Lo que se puede hacer con una cita de la agenda clínica, según su estado y quién mira. */
export function AccionesCita({
  id, estado, consultaId, puedeAtender, puedeLeer, medicos, medicoId, fecha, hora, version = null,
}: {
  id: string;
  estado: string;
  consultaId: string | null;
  puedeAtender: boolean;
  puedeLeer: boolean;
  medicos: MedicoVet[];
  medicoId: string;
  fecha: string;
  hora: string;
  /** updated_at de la cita al cargar la agenda (QA N43). */
  version?: string | null;
}) {
  const versiones = version ? [{ t: "vet_citas", i: id, v: version }] : [];
  const abierta = estado === "programada" || estado === "confirmada";
  return (
    <div className="mt-2 flex flex-wrap items-start gap-2">
      {consultaId && puedeLeer && (
        <Link href={`/veterinaria/consulta/${consultaId}`} className="inline-flex min-h-10 items-center rounded-md border border-n-200 bg-white px-3 text-sm font-semibold text-morado hover:bg-morado-suave">
          {estado === "en_curso" ? "Abrir la consulta" : "Ver la consulta"}
        </Link>
      )}
      {abierta && puedeAtender && <BotonAccion texto="Iniciar consulta" accion={() => iniciarDesdeCita(id)} />}
      {estado === "programada" && <BotonAccion texto="Confirmar" variante="secundario" accion={(c) => estadoCita(id, "confirmada", c)} textoExito="Confirmada" versiones={versiones} registro="esta cita" />}
      {abierta && (
        <>
          <Desplegable texto="Reprogramar">
            <FormularioAccion accion={(fd) => reprogramarCita(id, fd)} textoBoton="Mover la cita" textoExito="Cita movida" versiones={versiones} registro="esta cita">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Fecha" name="fecha" type="date" defaultValue={fecha} required />
                <Field label="Hora" name="hora" type="time" defaultValue={hora} required />
              </div>
              <Select label="Médico" name="medico_id" defaultValue={medicoId}>
                {medicos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </Select>
            </FormularioAccion>
          </Desplegable>
          <Desplegable texto="No llegó" variante="secundario">
            <BotonAccion texto="Marcar «no llegó»" variante="peligro" accion={(c) => estadoCita(id, "no_llego", c)} textoExito="Marcada" versiones={versiones} registro="esta cita" />
          </Desplegable>
          <Desplegable texto="Cancelar" variante="secundario">
            <FormularioAccion accion={(fd) => estadoCita(id, "cancelada", fd)} textoBoton="Cancelar la cita" variante="peligro" textoExito="Cita cancelada" versiones={versiones} registro="esta cita">
              <Field label="¿Por qué se cancela?" name="motivo" required />
            </FormularioAccion>
          </Desplegable>
        </>
      )}
    </div>
  );
}
