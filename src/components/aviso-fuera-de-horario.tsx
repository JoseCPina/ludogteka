"use client";

import { useState } from "react";
import { useZonaNegocio } from "@/components/zona-negocio";
import { Button } from "@/components/ui/button";
import { hoyNegocio, horaLocalDeInstante } from "@/lib/formato";
import {
  avisosDeHorario,
  motivoDiaNoDisponible,
  siguienteHorarioAbierto,
  textoPropuesta,
  type HorarioSemana,
  type PropuestaHorario,
} from "@/lib/estetica/aviso-horario";

/**
 * Aviso, sin bloquear, de que la cita o la reserva se sale del horario del negocio ese día. Se recalcula solo al cambiar
 * fecha, hora, duración o servicio (el padre le pasa los valores actuales).
 *
 * N128 (QA S36): si el día está cerrado o ya pasó su cierre, dice «Fuera de horario: el negocio está cerrado ese día» y
 * propone el siguiente horario abierto («Te propongo el lunes 26 a las 09:30»), con un botón para usarlo; el formulario
 * se queda en el día elegido hasta que alguien lo cambie. `propuesta` es la que calculó el servidor para ese día (con las
 * citas de quien atiende); sin ella, o para otro día, la saca del horario. Sin `hora` (hotel y guardería) propone el día.
 */
export function AvisoFueraDeHorario({
  fecha,
  hora,
  duracionMin = 0,
  horario,
  propuesta,
  onUsarPropuesta,
}: {
  fecha: string;
  hora?: string;
  duracionMin?: number;
  horario: HorarioSemana | null;
  propuesta?: PropuestaHorario | null;
  onUsarPropuesta?: (p: PropuestaHorario) => void;
}) {
  const zona = useZonaNegocio();
  const ahoraIso = new Date().toISOString();
  const [h, m] = horaLocalDeInstante(ahoraIso, zona).split(":").map(Number);
  const ahora = { hoy: hoyNegocio(zona), minutos: h * 60 + (m || 0) };
  const conHora = hora !== undefined;
  const motivo = motivoDiaNoDisponible(fecha, horario, ahora);
  // La del servidor vale para el día con el que abrió el formulario; si es otro día, la del horario.
  const delServidor = propuesta && propuesta.para === fecha && propuesta.fecha !== fecha ? propuesta : null;

  if (motivo) {
    const sugerida = delServidor ?? siguienteHorarioAbierto(fecha, horario, ahora, conHora, duracionMin);
    return (
      <div role="status" data-aviso-horario data-dia-no-disponible={motivo} className="rounded-md border-[1.5px] border-ambar bg-ambar-suave px-3 py-2 text-sm text-ambar-oscuro">
        <p className="font-bold">Fuera de horario: el negocio está cerrado ese día.</p>
        {motivo === "ya_cerro" && <p>Ya pasó la hora de cierre de hoy.</p>}
        {sugerida && <PropuestaVisible p={sugerida} conHora={conHora} onUsar={onUsarPropuesta} />}
        <p className="mt-1">Puedes {conHora ? "agendarla" : "registrarla"} igual.</p>
      </div>
    );
  }
  // El día abre pero quien atiende ya no tiene lugar: también se dice, nunca se cambia el día solo.
  if (delServidor) {
    return (
      <div role="status" data-aviso-horario data-dia-no-disponible="sin_lugar" className="rounded-md border-[1.5px] border-ambar bg-ambar-suave px-3 py-2 text-sm text-ambar-oscuro">
        <p className="font-bold">Ese día ya no queda lugar en la agenda.</p>
        <PropuestaVisible p={delServidor} conHora={conHora} onUsar={onUsarPropuesta} />
      </div>
    );
  }
  const avisos = conHora ? avisosDeHorario(fecha, hora, duracionMin, horario) : [];
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

function PropuestaVisible({ p, conHora, onUsar }: { p: PropuestaHorario; conHora: boolean; onUsar?: (p: PropuestaHorario) => void }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2" data-propuesta-horario={`${p.fecha}${p.hora ? `T${p.hora}` : ""}`}>
      <p className="font-semibold">{textoPropuesta(p)}.</p>
      {onUsar && (
        <Button type="button" variante="secundario" className="min-h-9 px-3 py-1 text-sm" onClick={() => onUsar(p)} data-usar-propuesta>
          {conHora ? "Usar esa hora" : "Usar ese día"}
        </Button>
      )}
    </div>
  );
}

/**
 * QA S41 (N142): un formulario que se queda abierto después de guardar (agendar varias citas seguidas) no deja el aviso
 * de horario de antes junto al «Cita agendada»: el éxito lo borra y vuelve a salir en cuanto cambian la fecha, la hora
 * o quien atiende (`clave`). `ocultar(clave)` recibe la clave con la que queda el formulario después de guardar.
 */
export function useAvisoTrasExito(clave: string) {
  const [oculto, setOculto] = useState<string | null>(null);
  return { visible: oculto !== clave, ocultar: (c: string = clave) => setOculto(c) };
}
