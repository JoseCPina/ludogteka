import { formatearDiaSemana, formatearFechaCalendario } from "@/lib/formato";
import type { ModuloEstancia } from "@/lib/modulos";

export type FilaCalendario = {
  fecha: string;
  cupo_diurno: number | null;
  ocupado_diurno: number;
  disponible_diurno: number | null;
  cupo_nocturno: number | null;
  ocupado_nocturno: number;
  disponible_nocturno: number | null;
  cupo_estado: string;
};

// La ocupación es de TODA la casa en los dos módulos, a propósito. El
// cupo es del mismo espacio físico: si el módulo de guardería mostrara
// solo a los perros de guardería (10/35 cuando además hay 8 de hotel
// adentro), recepción sobrevendería creyendo que le quedan 25 lugares.
//
// El desglose por categoría no necesita ningún dato nuevo: `estancias`
// solo admite guardería y hotel, `ocupado_diurno` las cuenta a las dos y
// `ocupado_nocturno` solo a hotel — así que lo de guardería ese día es la
// resta. Se muestra para que se vea de dónde sale el total y que la parte
// del módulo en el que estás parado es solo un pedazo.
function desglose(fila: FilaCalendario) {
  return {
    hotel: fila.ocupado_nocturno,
    guarderia: Math.max(fila.ocupado_diurno - fila.ocupado_nocturno, 0),
  };
}

function CeldaDisponibilidad({
  ocupado,
  cupo,
  disponible,
}: {
  ocupado: number;
  cupo: number | null;
  disponible: number | null;
}) {
  if (cupo === null || disponible === null) {
    return <span className="text-sm font-semibold text-naranja-oscuro">Sin configurar</span>;
  }
  const lleno = disponible <= 0;
  return (
    <span
      className={`tabular-nums text-sm font-semibold ${lleno ? "text-naranja-oscuro" : "text-n-700"}`}
    >
      {ocupado}/{cupo}
      {lleno && <span className="ml-1 font-bold">· Lleno</span>}
    </span>
  );
}

export function TablaOcupacion({
  filas,
  modulo,
}: {
  filas: FilaCalendario[];
  modulo: ModuloEstancia;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold text-n-900">Ocupación de la casa</h2>
        <p className="text-sm text-n-600">
          Estos números son de <strong>toda la casa</strong>, no solo de {modulo.etiqueta.toLowerCase()}:
          guardería y hotel comparten el mismo espacio. Diurno lo consumen los dos; nocturno solo
          hotel — un día puede tener lugar de día y estar lleno de noche.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Fecha
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Diurno (toda la casa)
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Nocturno (hotel)
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((d) => {
              const { hotel, guarderia } = desglose(d);
              return (
                <tr key={d.fecha}>
                  <td className="border-b border-n-200 px-4 py-3 text-n-900">
                    {formatearFechaCalendario(d.fecha)}{" "}
                    <span className="text-n-500">({formatearDiaSemana(d.fecha)})</span>
                  </td>
                  <td className="border-b border-n-200 px-4 py-3">
                    <CeldaDisponibilidad
                      ocupado={d.ocupado_diurno}
                      cupo={d.cupo_diurno}
                      disponible={d.disponible_diurno}
                    />
                    <p className="mt-0.5 text-xs text-n-500">
                      <span className={modulo.categoria === "guarderia" ? "font-bold text-n-700" : ""}>
                        {guarderia} guardería
                      </span>
                      {" · "}
                      <span className={modulo.categoria === "hotel" ? "font-bold text-n-700" : ""}>
                        {hotel} hotel
                      </span>
                    </p>
                  </td>
                  <td className="border-b border-n-200 px-4 py-3">
                    <CeldaDisponibilidad
                      ocupado={d.ocupado_nocturno}
                      cupo={d.cupo_nocturno}
                      disponible={d.disponible_nocturno}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
