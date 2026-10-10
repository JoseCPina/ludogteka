import { formatearFechaCalendario } from "@/lib/formato";
import { ESTADOS_CARNET, TIPOS_DESPARASITACION } from "@/lib/veterinaria/carnet";

export type CarnetDelDueno = {
  vacunas: { biologico: string; fecha_aplicacion: string; proxima_dosis: string | null; vigente_hasta: string; estado: string }[];
  desparasitaciones: { tipo: string; producto: string; fecha_aplicacion: string; proxima_dosis: string | null; vigente_hasta: string; estado: string }[];
};

const Estado = ({ estado }: { estado: string }) => {
  const e = ESTADOS_CARNET[estado] ?? ESTADOS_CARNET.vigente;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.estilo}`}>{e.etiqueta}</span>;
};

/** El carnet de la mascota en el portal del dueño: solo lectura, sin notas ni datos del personal. */
export function CarnetCliente({ carnet }: { carnet: CarnetDelDueno }) {
  const vacio = carnet.vacunas.length === 0 && carnet.desparasitaciones.length === 0;
  return (
    <div className="flex flex-col gap-3" data-carnet-cliente>
      <h2 className="text-lg font-bold text-n-900">Carnet de vacunación</h2>
      {vacio ? (
        <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">Todavía no hay vacunas ni desparasitaciones registradas en su carnet.</p>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-4">
          {carnet.vacunas.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide text-n-600">Vacunas</h3>
              <ul className="flex flex-col divide-y divide-n-200">
                {carnet.vacunas.map((v, i) => (
                  <li key={i} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-n-900">{v.biologico}</span>
                      <Estado estado={v.estado} />
                    </div>
                    <span className="text-sm text-n-700">
                      Aplicada el {formatearFechaCalendario(v.fecha_aplicacion)} ·{" "}
                      {v.proxima_dosis ? `próxima dosis ${formatearFechaCalendario(v.proxima_dosis)}` : `vigente hasta ${formatearFechaCalendario(v.vigente_hasta)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {carnet.desparasitaciones.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide text-n-600">Desparasitaciones</h3>
              <ul className="flex flex-col divide-y divide-n-200">
                {carnet.desparasitaciones.map((d, i) => (
                  <li key={i} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-n-900">
                        {d.producto} <span className="font-normal text-n-500">· {TIPOS_DESPARASITACION[d.tipo]}</span>
                      </span>
                      <Estado estado={d.estado} />
                    </div>
                    <span className="text-sm text-n-700">
                      Aplicada el {formatearFechaCalendario(d.fecha_aplicacion)} ·{" "}
                      {d.proxima_dosis ? `próxima ${formatearFechaCalendario(d.proxima_dosis)}` : `hasta ${formatearFechaCalendario(d.vigente_hasta)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
