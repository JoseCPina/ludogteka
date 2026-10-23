"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { AvisoFueraDeHorario } from "@/components/aviso-fuera-de-horario";
import type { HorarioSemana } from "@/lib/estetica/aviso-horario";

type Tipo = { clave: string; nombre: string; duracion_min: number };
type Medico = { id: string; nombre: string };

/**
 * Los campos de la cita clínica (tipo, médico, fecha, hora y duración) con el aviso de «fuera de horario»:
 * se recalcula al cambiar tipo, fecha, hora o duración, con el horario del negocio de ese día de la semana.
 * No bloquea: la cita se puede guardar igual.
 */
export function CamposCitaVet({
  tipos,
  medicos,
  medicoInicial,
  hoy,
  fechaInicial,
  horaInicial,
  propuestaPorMedico,
  horario,
}: {
  tipos: Tipo[];
  medicos: Medico[];
  medicoInicial: string;
  hoy: string;
  fechaInicial: string;
  horaInicial: string;
  /** La siguiente media hora libre de cada médico (QA S27): mientras no se teclee otra, la fecha y hora siguen al médico. */
  propuestaPorMedico?: Record<string, { fecha: string; hora: string }>;
  horario: HorarioSemana | null;
}) {
  const [tipo, setTipo] = useState("consulta");
  const [fecha, setFecha] = useState(fechaInicial);
  const [hora, setHora] = useState(horaInicial);
  const [tocada, setTocada] = useState(false);
  const [duracion, setDuracion] = useState("");
  const duracionDelTipo = tipos.find((t) => t.clave === tipo)?.duracion_min ?? 30;
  const duracionMin = Number(duracion) > 0 ? Number(duracion) : duracionDelTipo;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Tipo de cita" name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} ayuda="La duración sale del tipo; se cambia en Ajustes de Veterinaria.">
          {tipos.map((t) => (
            <option key={t.clave} value={t.clave}>
              {t.nombre} · {t.duracion_min} min
            </option>
          ))}
        </Select>
        <Select
          label="Médico"
          name="medico_id"
          defaultValue={medicoInicial}
          required
          onChange={(e) => {
            const suya = propuestaPorMedico?.[e.target.value];
            if (tocada || !suya) return;
            setFecha(suya.fecha);
            setHora(suya.hora);
          }}
        >
          {medicos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
        <Field label="Fecha" name="fecha" type="date" min={hoy} value={fecha} onChange={(e) => { setFecha(e.target.value); setTocada(true); }} required />
        <Field label="Hora" name="hora" type="time" value={hora} onChange={(e) => { setHora(e.target.value); setTocada(true); }} required />
        <Field label="Duración en minutos (opcional)" name="duracion" type="number" min={5} max={480} value={duracion} onChange={(e) => setDuracion(e.target.value)} ayuda="Vacío: la del tipo de cita." />
      </div>
      <AvisoFueraDeHorario fecha={fecha} hora={hora} duracionMin={duracionMin} horario={horario} />
    </>
  );
}
