"use client";

import { avisosDeHorario, type HorarioSemana } from "@/lib/estetica/aviso-horario";

/**
 * Aviso, sin bloquear, de que la cita se sale del horario del negocio ese día. Se recalcula solo al cambiar
 * fecha, hora, duración o servicio (el padre le pasa los valores actuales).
 */
export function AvisoFueraDeHorario({
  fecha,
  hora,
  duracionMin,
  horario,
}: {
  fecha: string;
  hora: string;
  duracionMin: number;
  horario: HorarioSemana | null;
}) {
  const avisos = avisosDeHorario(fecha, hora, duracionMin, horario);
  if (avisos.length === 0) return null;
  return (
    <div role="status" data-aviso-horario className="rounded-md border-[1.5px] border-ambar bg-ambar-suave px-3 py-2 text-sm text-ambar-oscuro">
      <p className="font-bold">Fuera de horario</p>
      {avisos.map((a) => (
        <p key={a}>{a}</p>
      ))}
      <p className="mt-1">Puedes agendarla igual.</p>
    </div>
  );
}
