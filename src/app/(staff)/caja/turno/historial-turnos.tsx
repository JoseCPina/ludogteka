import { formatearFecha } from "@/lib/formato";

export type TurnoCerrado = {
  id: string;
  fondoInicial: number;
  abiertoEn: string;
  cerradoEn: string;
  abiertoPorNombre: string;
  cerradoPorNombre: string;
  explicacionDiferencias: string | null;
  metodos: { metodo: string; conteo: number; esperado: number; diferencia: number }[];
};

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  terminal: "Terminal",
  transferencia: "Transferencia",
};

function dinero(v: number): string {
  return `$${v.toFixed(2)}`;
}

export function HistorialTurnos({ turnos }: { turnos: TurnoCerrado[] }) {
  if (turnos.length === 0) {
    return <p className="text-n-600">Todavía no hay turnos cerrados.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {turnos.map((t) => {
        const hayDiferencia = t.metodos.some((m) => m.diferencia !== 0);
        return (
          <li key={t.id} className="rounded-lg border border-n-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-n-900">
                {formatearFecha(t.abiertoEn)} – {formatearFecha(t.cerradoEn)}
              </p>
              {hayDiferencia ? (
                <span className="rounded-full bg-naranja-suave px-2 py-0.5 text-xs font-semibold text-naranja-oscuro">
                  Con diferencia
                </span>
              ) : (
                <span className="rounded-full bg-verde-suave px-2 py-0.5 text-xs font-semibold text-verde-oscuro">
                  Cuadró
                </span>
              )}
            </div>
            <p className="text-sm text-n-600">
              Abrió {t.abiertoPorNombre} · Cerró {t.cerradoPorNombre} · Fondo inicial {dinero(t.fondoInicial)}
            </p>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-n-200 py-1 text-left text-xs font-bold uppercase tracking-wide text-n-500">
                      Método
                    </th>
                    <th className="border-b border-n-200 py-1 text-right text-xs font-bold uppercase tracking-wide text-n-500">
                      Contado
                    </th>
                    <th className="border-b border-n-200 py-1 text-right text-xs font-bold uppercase tracking-wide text-n-500">
                      Esperado
                    </th>
                    <th className="border-b border-n-200 py-1 text-right text-xs font-bold uppercase tracking-wide text-n-500">
                      Diferencia
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {t.metodos.map((m) => (
                    <tr key={m.metodo}>
                      <td className="border-b border-n-100 py-1 text-n-800">{ETIQUETA_METODO[m.metodo] ?? m.metodo}</td>
                      <td className="border-b border-n-100 py-1 text-right tabular-nums text-n-700">
                        {dinero(m.conteo)}
                      </td>
                      <td className="border-b border-n-100 py-1 text-right tabular-nums text-n-700">
                        {dinero(m.esperado)}
                      </td>
                      <td
                        className={`border-b border-n-100 py-1 text-right tabular-nums font-semibold ${
                          m.diferencia === 0
                            ? "text-n-700"
                            : m.diferencia > 0
                              ? "text-azul"
                              : "text-naranja-oscuro"
                        }`}
                      >
                        {m.diferencia > 0 ? "+" : ""}
                        {dinero(m.diferencia)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {t.explicacionDiferencias && (
              <p className="mt-2 text-sm text-n-600">
                <span className="font-semibold text-n-800">Explicación:</span> {t.explicacionDiferencias}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
