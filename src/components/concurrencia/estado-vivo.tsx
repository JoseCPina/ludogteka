"use client";

import type { ReactNode } from "react";
import { useRegistroVivo } from "./registro-vivo";

/**
 * QA S41 (N140): el estado de un registro como lo muestra una página del servidor (la insignia «Borrador» / «Firmada»
 * de una consulta, el estado de una cita o de una estancia), pintado con lo que devolvió la última acción de esta
 * pestaña (`registros`, publicado por useEspera, FormularioAccion, BotonAccion y useControlVersion) en cuanto llega la
 * respuesta, sin esperar a que la página se vuelva a pedir. Mientras nadie guarde, es el que trajo la página.
 */
export function EstadoVivo({
  t,
  i,
  version,
  estado,
  etiquetas,
  clases = {},
  claseBase = "",
}: {
  t: string;
  i: string;
  version: string | null | undefined;
  estado: string;
  etiquetas: Record<string, string>;
  clases?: Record<string, string>;
  claseBase?: string;
}) {
  const vivo = useRegistroVivo(t, i, { estado }, version);
  const e = String(vivo.estado ?? estado);
  return (
    <span className={`${claseBase} ${clases[e] ?? clases._ ?? ""}`.trim()} data-estado-vivo={e}>
      {etiquetas[e] ?? e}
    </span>
  );
}

/** Lo de adentro solo mientras el registro esté en uno de `en` (p. ej. el editor de una consulta en borrador). */
export function SiEstadoVivo({
  t,
  i,
  version,
  estado,
  en,
  children,
  si_no = null,
}: {
  t: string;
  i: string;
  version: string | null | undefined;
  estado: string;
  en: string[];
  children: ReactNode;
  si_no?: ReactNode;
}) {
  const vivo = useRegistroVivo(t, i, { estado }, version);
  return <>{en.includes(String(vivo.estado ?? estado)) ? children : si_no}</>;
}
