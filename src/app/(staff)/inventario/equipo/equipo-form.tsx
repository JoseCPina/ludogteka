"use client";

import { useActionState } from "react";
import { useAccionConTope } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import type { EstadoEquipo } from "./equipo-actions";

const ESTADO_INICIAL: EstadoEquipo = { error: null };

// Equipo: lo que no se gasta. Al darlo de alta se captura cuántos hay y en
// qué estado; después, la cantidad y el estado se cambian desde el detalle
// (queda en la bitácora). Aquí también se dice cada cuánto toca
// mantenimiento, para que la app avise.
export function EquipoForm({
  action,
  areas,
  valoresIniciales,
  textoBoton,
  esAlta,
  soloLectura = false,
}: {
  action: (prev: EstadoEquipo, formData: FormData) => Promise<EstadoEquipo>;
  areas: { id: string; nombre: string }[];
  valoresIniciales?: {
    nombre: string;
    area_id: string;
    frecuencia_mantenimiento_dias: number | null;
    que_mantenimiento: string | null;
    ultimo_mantenimiento: string | null;
    notas: string | null;
  };
  textoBoton: string;
  esAlta: boolean;
  soloLectura?: boolean;
}) {
  const [estado, formAction, enviandoForm] = useActionState(useAccionConTope(action), ESTADO_INICIAL);
  const enviando = enviandoForm || soloLectura;

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {estado.error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {estado.error}
        </Alert>
      )}
      <Field label="Nombre" name="nombre" required disabled={enviando} defaultValue={valoresIniciales?.nombre} />
      <Select label="Área" name="area_id" required disabled={enviando} defaultValue={valoresIniciales?.area_id ?? ""}>
        <option value="">Elige el área</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nombre}
          </option>
        ))}
      </Select>

      {esAlta && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cuántos hay" name="cantidad" type="number" min="0" step="1" defaultValue={1} disabled={enviando} />
          <Select label="Estado" name="estado" defaultValue="bueno" disabled={enviando}>
            <option value="bueno">Bueno</option>
            <option value="mantenimiento">Necesita mantenimiento</option>
            <option value="descompuesto">Descompuesto</option>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-md border-[1.5px] border-n-200 bg-white p-3">
        <p className="text-sm font-semibold text-n-800">Mantenimiento (opcional)</p>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Cada cuántos días"
            name="frecuencia_mantenimiento_dias"
            type="number"
            min="1"
            step="1"
            disabled={enviando}
            defaultValue={valoresIniciales?.frecuencia_mantenimiento_dias ?? ""}
            ayuda="Vacío si no lleva."
          />
          <Field
            label="Qué se le hace"
            name="que_mantenimiento"
            disabled={enviando}
            defaultValue={valoresIniciales?.que_mantenimiento ?? ""}
            placeholder="Afilado, cambio de cuchillas…"
          />
        </div>
        <Field
          label="Último mantenimiento"
          name="ultimo_mantenimiento"
          type="date"
          disabled={enviando}
          defaultValue={valoresIniciales?.ultimo_mantenimiento ?? ""}
        />
      </div>

      <Textarea label="Notas (opcional)" name="notas" disabled={enviando} defaultValue={valoresIniciales?.notas ?? ""} />

      {!soloLectura && (
        <AccionesFormulario error={estado.error} exito={estado.ok && "Cambios guardados"}>
          <Button type="submit" cargando={enviandoForm}>
            {enviandoForm ? "Guardando…" : textoBoton}
          </Button>
        </AccionesFormulario>
      )}
    </form>
  );
}
