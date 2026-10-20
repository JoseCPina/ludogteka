import { formatearFecha, formatearHoraNegocio } from "@/lib/formato";
import { dinero } from "@/lib/dinero";

export type TurnoCerrado = {
  id: string;
  fondoInicial: number;
  abiertoEn: string;
  cerradoEn: string;
  abiertoPorNombre: string;
  cerradoPorNombre: string;
  explicacionDiferencias: string | null;
  // QA S17 (N81): correcciones de cobros de este turno hechas después de su corte (el corte guardado no cambia).
  ajustes: { metodo: string; monto: number; fecha: string; tipo: string; motivo: string | null; porNombre: string }[];
  metodos: { metodo: string; conteo: number; esperado: number; diferencia: number }[];
};

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  terminal: "Terminal",
  tarjeta_manual: "Tarjeta manual (sin verificar)",
  transferencia: "Transferencia",
};

export function HistorialTurnos({ turnos, zona }: { turnos: TurnoCerrado[]; zona: string }) {
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
                {formatearFecha(t.abiertoEn, zona)} – {formatearFecha(t.cerradoEn, zona)}
              </p>
              {hayDiferencia ? (
                <span className="rounded-full bg-coral-suave px-2 py-0.5 text-xs font-semibold text-coral-oscuro">
                  Con diferencia
                </span>
              ) : (
                <span className="rounded-full bg-menta-suave px-2 py-0.5 text-xs font-semibold text-menta-oscuro">
                  Cuadró
                </span>
              )}
            </div>
            <p className="text-sm text-n-600">
              Abrió {t.abiertoPorNombre} · Cerró {t.cerradoPorNombre} · Fondo inicial {dinero(t.fondoInicial)}
            </p>

            <div className="mt-2 overflow-x-auto">
              <table className="tabla-tarjetas w-full min-w-[420px] border-collapse text-sm">
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
                      <td data-label="" className="border-b border-n-100 py-1 text-n-800">{ETIQUETA_METODO[m.metodo] ?? m.metodo}</td>
                      <td data-label="Contado" className="border-b border-n-100 py-1 text-right tabular-nums text-n-700">
                        {dinero(m.conteo)}
                      </td>
                      <td data-label="Esperado" className="border-b border-n-100 py-1 text-right tabular-nums text-n-700">
                        {dinero(m.esperado)}
                      </td>
                      <td data-label="Diferencia"
                        className={`border-b border-n-100 py-1 text-right tabular-nums font-semibold ${
                          m.diferencia === 0
                            ? "text-n-700"
                            : m.diferencia > 0
                              ? "text-morado"
                              : "text-coral-oscuro"
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

            {t.ajustes.length > 0 && (
              <div className="mt-3 rounded-md border border-ambar bg-ambar-suave/50 p-3" data-ajustes-posteriores>
                <p className="text-sm font-semibold text-ambar-oscuro">Ajustes posteriores al corte</p>
                <p className="text-xs text-n-600">Correcciones de cobros de este turno hechas después de cerrarlo. El corte de arriba no cambia; el turno de hoy tampoco.</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-sm">
                  {t.ajustes.map((a, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 text-n-800">
                      <span>
                        {a.tipo === "anulacion" ? "Anulación" : "Corrección de monto"} · {ETIQUETA_METODO[a.metodo] ?? a.metodo} · {a.porNombre}, {formatearFecha(a.fecha, zona)} a las {formatearHoraNegocio(a.fecha, zona)}
                        {a.motivo ? <span className="text-n-600"> · {a.motivo}</span> : null}
                      </span>
                      <span className="tabular-nums font-semibold">{dinero(a.monto)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
