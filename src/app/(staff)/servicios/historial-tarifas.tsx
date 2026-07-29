import { formatearFechaCalendario, formatearFecha } from "@/lib/formato";

export type FilaHistorial = {
  id: string;
  tamano_etiqueta: string;
  pelaje_etiqueta: string;
  cantidad_desde: number;
  cantidad_hasta: number | null;
  precio: number | null;
  no_aplica: boolean;
  vigencia_desde: string;
  created_at: string;
  creado_por: string;
};

// tarifas es insert-only: cada fila YA es su propia entrada de auditoría
// (quién, qué precio, desde cuándo) — este historial sale directo de la
// tabla, sin bitácora aparte.
export function HistorialTarifas({ filas }: { filas: FilaHistorial[] }) {
  if (filas.length === 0) {
    return <p className="text-n-600">Todavía no se ha capturado ninguna tarifa.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Celda
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Precio
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Vigente desde
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Capturado por
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Capturado el
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td className="border-b border-n-200 px-4 py-3 text-n-900">
                {[
                  f.tamano_etiqueta,
                  f.pelaje_etiqueta,
                  f.cantidad_hasta ? `${f.cantidad_desde}–${f.cantidad_hasta}` : `${f.cantidad_desde}+`,
                ]
                  .filter((v) => v && v !== "—")
                  .join(" · ") || "Precio único"}
              </td>
              <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-900">
                {f.no_aplica ? "No aplica" : `$${Number(f.precio).toFixed(2)}`}
              </td>
              <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-900">
                {formatearFechaCalendario(f.vigencia_desde)}
              </td>
              <td className="border-b border-n-200 px-4 py-3 text-n-600">{f.creado_por}</td>
              <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-600">
                {formatearFecha(f.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
