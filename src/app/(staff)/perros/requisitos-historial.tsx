import { formatearFechaCalendario } from "@/lib/formato";

export type RequisitoAplicadoFila = {
  id: string;
  fecha_aplicacion: string;
  fecha_vencimiento: string;
  detalle: string | null;
  notas: string | null;
  tipo_etiqueta: string;
  comprobante_url: string | null;
};

export function RequisitosHistorial({ filas }: { filas: RequisitoAplicadoFila[] }) {
  if (filas.length === 0) {
    return (
      <p className="text-n-600">Todavía no hay aplicaciones registradas para este perro.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Tipo
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Aplicación
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Vence
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Detalle / notas
            </th>
            <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
              Comprobante
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.id}>
              <td className="border-b border-n-200 px-4 py-3 font-semibold text-n-900">
                {fila.tipo_etiqueta}
              </td>
              <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-900">
                {formatearFechaCalendario(fila.fecha_aplicacion)}
              </td>
              <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-900">
                {formatearFechaCalendario(fila.fecha_vencimiento)}
              </td>
              <td className="border-b border-n-200 px-4 py-3 text-n-600">
                {fila.detalle ?? "—"}
                {fila.notas && <span className="block text-xs italic">{fila.notas}</span>}
              </td>
              <td className="border-b border-n-200 px-4 py-3">
                {fila.comprobante_url ? (
                  <a
                    href={fila.comprobante_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-azul hover:underline"
                  >
                    Ver foto
                  </a>
                ) : (
                  <span className="text-n-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
