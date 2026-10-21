import { formatearFechaCalendario } from "@/lib/formato";
import { sinEtiquetasDePlantilla } from "@/lib/veterinaria/portal-texto";
import { TIPOS_CITA } from "@/lib/veterinaria/expediente";

export type ExpedienteDelDueno = {
  habilitado: boolean;
  // Las etiquetas de las plantillas de consulta del negocio: nunca se le enseñan al dueño (N110).
  etiquetas?: string[];
  consultas: { fecha: string; tipo: string; motivo: string; diagnostico: string; indicaciones: string }[];
};

/** Las consultas firmadas de la mascota, en el portal del dueño, como resumen: fecha, motivo, diagnóstico e indicaciones. Sin notas internas ni datos del personal. */
export function ExpedienteCliente({ expediente }: { expediente: ExpedienteDelDueno }) {
  if (!expediente.habilitado) return null;
  return (
    <div className="flex flex-col gap-3" data-expediente-cliente>
      <h2 className="text-lg font-bold text-n-900">Consultas veterinarias</h2>
      {expediente.consultas.length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">Todavía no hay consultas registradas.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {expediente.consultas.map((consulta, i) => {
            const limpio = (t: string) => sinEtiquetasDePlantilla(t, expediente.etiquetas ?? []);
            const c = { ...consulta, motivo: limpio(consulta.motivo), diagnostico: limpio(consulta.diagnostico), indicaciones: limpio(consulta.indicaciones) };
            return (
            <li key={i} className="flex flex-col gap-1 rounded-lg border border-n-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-n-900">{TIPOS_CITA[c.tipo] ?? c.tipo}</span>
                <span className="text-sm text-n-600">{formatearFechaCalendario(c.fecha)}</span>
              </div>
              {c.motivo && <p className="whitespace-pre-wrap text-n-800"><span className="font-semibold">Motivo:</span> {c.motivo}</p>}
              {c.diagnostico && <p className="text-n-800"><span className="font-semibold">Diagnóstico:</span> {c.diagnostico}</p>}
              {c.indicaciones && <p className="whitespace-pre-wrap text-n-800"><span className="font-semibold">Indicaciones:</span> {c.indicaciones}</p>}
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
