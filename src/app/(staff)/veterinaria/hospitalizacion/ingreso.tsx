"use client";

import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormularioAccion } from "@/components/formulario-accion";
import type { MedicoOpcion } from "@/lib/veterinaria/lotes";
import { ingresarMascota } from "./actions";

export function FormularioIngreso({ perroId, medicos, medicoPropio, precioDia }: { perroId: string; medicos: MedicoOpcion[]; medicoPropio: string | null; precioDia: number | null }) {
  return (
    <FormularioAccion accion={(fd) => ingresarMascota(perroId, fd)} textoBoton="Ingresar a hospitalización" className="rounded-lg border border-n-200 bg-white p-5">
      <Textarea label="Motivo del ingreso" name="motivo" rows={3} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Médico responsable" name="medico_id" defaultValue={medicoPropio ?? ""} required>
          <option value="">— Elige —</option>
          {medicos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
        <Field label="Ubicación (opcional)" name="ubicacion" placeholder="Jaula 3" />
        <Field label="Depósito inicial (opcional)" name="deposito" type="number" min={0} step="0.01" defaultValue={0} ayuda="Se agrega a la cuenta para cobrarlo en Caja; al dar el alta se aplica a lo que se debe." />
        <Field label="Precio del día" name="precio_dia" type="number" min={0} step="0.01" defaultValue={precioDia ?? ""} ayuda="Se cobra un día por cada fecha. Vacío = no se cobra el día solo." />
      </div>
    </FormularioAccion>
  );
}
