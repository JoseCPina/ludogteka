"use client";

import { describirBono } from "@/lib/bonos/descripcion";
import { formatearFechaCalendario } from "@/lib/formato";
import type { PaseParaFecha } from "@/lib/bonos/pase-para-fecha";

/**
 * El pase del perro, a la vista, al reservar guardería.
 *
 * Antes el pase se aplicaba solo por detrás y recepción se enteraba hasta
 * después de guardar. Ahora, al marcar al perro, se ve qué paquete va a
 * usar (el que vence primero), cuánto le queda y cuándo vence, y se puede
 * escoger pagar el día suelto. Si no tiene saldo, el paquete no cubre esa
 * fecha o la modalidad es por hora, lo dice y el día se cobra suelto.
 *
 * `enSerie`: en una serie cada fecha usa un pase mientras le queden; las
 * que ya no alcancen se cobran sueltas.
 */
export function ElegirPase({
  pase,
  fecha,
  usarPase,
  onCambio,
  enSerie = false,
}: {
  pase: PaseParaFecha;
  fecha: string;
  usarPase: boolean;
  onCambio: (usar: boolean) => void;
  enSerie?: boolean;
}) {
  if (pase.caso === "no_aplica") return null;

  if (pase.caso === "sin_paquetes") {
    return <p className="text-sm text-n-600">No tiene day pass ni mensualidad: se cobra el día suelto.</p>;
  }

  if (pase.caso === "por_hora") {
    return (
      <Aviso tono="info">
        Tiene {pase.paquetes.length === 1 ? "un paquete vigente" : `${pase.paquetes.length} paquetes vigentes`} (
        {pase.paquetes.map((p) => p.servicio_nombre).join(", ")}), pero los pases cubren guardería de día
        completo, no por hora. Este día se cobra por hora.
      </Aviso>
    );
  }

  if (pase.caso === "no_cubre") {
    const p = pase.paquete;
    const porque =
      pase.razon === "vence_antes"
        ? `su vigencia termina el ${formatearFechaCalendario(p.fecha_vencimiento as string)}, antes del ${formatearFechaCalendario(fecha)}`
        : "ya no le quedan pases";
    return (
      <Aviso tono="advertencia">
        Tiene {p.servicio_nombre}, pero no cubre {enSerie ? "estas fechas" : "este día"}: {porque}. Se cobra el día
        suelto.
      </Aviso>
    );
  }

  const p = pase.paquete;
  const nombre = `grupo-pase-${p.id}`;
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border-[1.5px] border-turquesa bg-turquesa-suave px-3 py-3">
      <legend className="px-1 text-sm font-bold text-turquesa-oscuro">Tiene pases disponibles</legend>
      <p className="text-sm text-n-800">
        <strong>{p.servicio_nombre}</strong> · {describirBono(p)}
        {pase.otros > 0 && (
          <span className="text-n-600">
            {" "}
            (tiene {pase.otros === 1 ? "otro paquete" : `otros ${pase.otros} paquetes`}: se usa primero el que vence
            antes)
          </span>
        )}
      </p>
      <label className="flex items-start gap-2 text-sm text-n-900">
        <input type="radio" name={nombre} checked={usarPase} onChange={() => onCambio(true)} className="mt-0.5 h-4 w-4" />
        <span>
          Usar un pase{" "}
          {enSerie
            ? p.ilimitado
              ? "en cada fecha mientras la mensualidad esté activa"
              : "en cada fecha mientras le queden (las que ya no alcancen se cobran sueltas)"
            : "para este día"}
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-n-900">
        <input type="radio" name={nombre} checked={!usarPase} onChange={() => onCambio(false)} className="mt-0.5 h-4 w-4" />
        <span>Pagar {enSerie ? "cada día suelto" : "el día suelto"} (no se descuentan pases)</span>
      </label>
    </fieldset>
  );
}

function Aviso({ tono, children }: { tono: "info" | "advertencia"; children: React.ReactNode }) {
  const clases =
    tono === "info"
      ? "border-azul bg-azul-suave text-n-800"
      : "border-amarillo bg-amarillo-suave text-n-800";
  return <p className={`rounded-md border-l-4 px-3 py-2 text-sm ${clases}`}>{children}</p>;
}
