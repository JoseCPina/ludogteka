"use client";

import { useEffect, useState } from "react";
import { formatearFechaCalendario } from "@/lib/formato";
import { EVENTO_APLICACION_CONSULTA, type AplicacionConsulta } from "@/lib/veterinaria/aplicacion-consulta";
import type { RegistroDesparasitacion, RegistroVacuna } from "@/lib/veterinaria/carnet";
import { QuitarAplicacion } from "./quitar-aplicacion";
import { Enlace } from "@/components/ui/enlace";

type Vacuna = Pick<RegistroVacuna, "id" | "biologico" | "lote" | "proxima_dosis">;
type Desparasitacion = Pick<RegistroDesparasitacion, "id" | "tipo" | "producto" | "proxima_dosis">;

/**
 * «Vacunas y desparasitación» de la consulta. Lo que se registra desde los formularios de la consulta entra al
 * momento con la respuesta del servidor (QA S27: tardaba 3 a 4 s en aparecer, lo que tardaba en repintarse la página).
 * `deEsta`: lo ligado a esta consulta (se puede quitar); `nacidas`: lo que nació en ella (lo demás vino del carnet).
 */
export function AplicacionesConsulta({
  consultaId,
  perroId,
  vacunas,
  desparasitaciones,
  puedeQuitar,
  deEsta,
  nacidas,
}: {
  consultaId: string;
  perroId: string;
  vacunas: Vacuna[];
  desparasitaciones: Desparasitacion[];
  puedeQuitar: boolean;
  deEsta: string[];
  nacidas: string[];
}) {
  const [listas, setListas] = useState({ vacunas, desparasitaciones, deEsta, nacidas });
  // Cuando la página se repinta (router.refresh), manda lo que diga el servidor.
  const [previas, setPrevias] = useState({ vacunas, desparasitaciones });
  if (previas.vacunas !== vacunas || previas.desparasitaciones !== desparasitaciones) {
    setPrevias({ vacunas, desparasitaciones });
    setListas({ vacunas, desparasitaciones, deEsta, nacidas });
  }

  useEffect(() => {
    function alAplicar(e: Event) {
      const d = (e as CustomEvent<AplicacionConsulta>).detail;
      if (d.consultaId !== consultaId) return;
      setListas((l) => {
        const nueva = d.vacuna ?? d.desparasitacion;
        if (!nueva || l.deEsta.includes(nueva.id)) return l;
        return {
          vacunas: d.vacuna ? [...l.vacunas, d.vacuna] : l.vacunas,
          desparasitaciones: d.desparasitacion ? [...l.desparasitaciones, d.desparasitacion] : l.desparasitaciones,
          deEsta: [...l.deEsta, nueva.id],
          nacidas: [...l.nacidas, nueva.id],
        };
      });
    }
    window.addEventListener(EVENTO_APLICACION_CONSULTA, alAplicar);
    return () => window.removeEventListener(EVENTO_APLICACION_CONSULTA, alAplicar);
  }, [consultaId]);

  return (
    <>
      {listas.vacunas.length + listas.desparasitaciones.length === 0 ? (
        <p className="mt-1 text-sm text-n-600">En esta consulta no se aplicó ninguna vacuna ni desparasitación.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-n-800">
          {listas.vacunas.map((v) => (
            <li key={v.id} data-vacuna-consulta>
              <b>Vacuna:</b> {v.biologico}
              {v.lote ? ` · lote ${v.lote}` : ""}
              {v.proxima_dosis ? ` · próxima ${formatearFechaCalendario(v.proxima_dosis)}` : ""}
              {puedeQuitar && listas.deEsta.includes(v.id) && <> <QuitarAplicacion consultaId={consultaId} perroId={perroId} tipo="vacuna" id={v.id} nombre={v.biologico} delCarnet={!listas.nacidas.includes(v.id)} /></>}
            </li>
          ))}
          {listas.desparasitaciones.map((d2) => (
            <li key={d2.id} data-desparasitacion-consulta>
              <b>Desparasitación {d2.tipo === "ambas" ? "interna y externa" : d2.tipo}:</b> {d2.producto}
              {d2.proxima_dosis ? ` · próxima ${formatearFechaCalendario(d2.proxima_dosis)}` : ""}
              {puedeQuitar && listas.deEsta.includes(d2.id) && <> <QuitarAplicacion consultaId={consultaId} perroId={perroId} tipo="desparasitacion" id={d2.id} nombre={d2.producto} delCarnet={!listas.nacidas.includes(d2.id)} /></>}
            </li>
          ))}
        </ul>
      )}
      <Enlace href={`/veterinaria/carnet/${perroId}`} className="mt-2 text-sm">Ver el carnet completo</Enlace>
    </>
  );
}
