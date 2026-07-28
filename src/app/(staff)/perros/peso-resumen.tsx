import { formatearFechaCalendario } from "@/lib/formato";

export type PesoFila = {
  id: string;
  peso_kg: number;
  fecha: string;
  notas: string | null;
};

// "Notable" exige DOS condiciones a la vez, no una sola:
// - Relativo (10%): un chihuahua y un mastín no se comparan en kg planos.
// - Absoluto (0.4 kg): sin este piso, 200 g en un perro de 2 kg (vejiga
//   llena, báscula distinta) ya dispara el 10% relativo sin que pase nada.
const UMBRAL_RELATIVO = 0.1;
const UMBRAL_ABSOLUTO_KG = 0.4;
// Menos de un mes entre lecturas con baja notable = más urgente que la
// misma baja repartida en medio año (dieta, edad).
const DIAS_URGENTE = 30;

function diasEntre(fechaAnterior: string, fechaActual: string): number {
  const [a1, m1, d1] = fechaAnterior.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = fechaActual.slice(0, 10).split("-").map(Number);
  const ms1 = Date.UTC(a1, m1 - 1, d1);
  const ms2 = Date.UTC(a2, m2 - 1, d2);
  return Math.round((ms2 - ms1) / (1000 * 60 * 60 * 24));
}

function formatearDuracion(dias: number): string {
  if (dias <= 0) return "el mismo día";
  if (dias === 1) return "1 día";
  if (dias < 60) return `${dias} días`;
  const meses = Math.round(dias / 30);
  return meses <= 1 ? "1 mes" : `${meses} meses`;
}

export function PesoResumen({ historial }: { historial: PesoFila[] }) {
  if (historial.length === 0) {
    return <p className="text-n-600">Todavía no hay lecturas de peso para este perro.</p>;
  }

  const actual = Number(historial[0].peso_kg);
  const anterior = historial[1] ? Number(historial[1].peso_kg) : null;
  const variacionKg = anterior !== null ? actual - anterior : null;

  const esNotable =
    variacionKg !== null &&
    anterior !== null &&
    Math.abs(variacionKg) / anterior >= UMBRAL_RELATIVO &&
    Math.abs(variacionKg) >= UMBRAL_ABSOLUTO_KG;
  const esBaja = (variacionKg ?? 0) < 0;
  const dias = historial[1] ? diasEntre(historial[1].fecha, historial[0].fecha) : null;
  const esUrgente = esNotable && esBaja && dias !== null && dias < DIAS_URGENTE;

  let estiloCaja = "border-n-200 bg-white";
  let estiloTexto = "text-n-700";
  if (esNotable) {
    if (esBaja) {
      estiloCaja = esUrgente
        ? "border-2 border-naranja-oscuro bg-naranja-suave"
        : "border-naranja bg-naranja-suave";
      estiloTexto = "text-naranja-oscuro";
    } else {
      // Alza notable: dato útil para estética, no una alarma — tono
      // informativo (azul), no el naranja/amarillo reservado para riesgo.
      estiloCaja = "border-azul bg-azul-suave";
      estiloTexto = "text-azul-oscuro";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`flex flex-wrap items-center gap-4 rounded-lg p-4 ${estiloCaja}`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-n-600">Peso actual</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{actual.toFixed(1)} kg</p>
          <p className="text-xs text-n-500">{formatearFechaCalendario(historial[0].fecha)}</p>
        </div>

        {variacionKg !== null && dias !== null && (
          <div className={estiloTexto}>
            <p className="text-sm font-bold tabular-nums">
              {variacionKg > 0 ? "+" : ""}
              {variacionKg.toFixed(1)} kg desde {formatearFechaCalendario(historial[1].fecha)}
              {" · "}
              hace {formatearDuracion(dias)}
            </p>
            {esNotable && esBaja && (
              <p className="text-sm font-bold">
                {esUrgente
                  ? "¡Baja notable y reciente! Vale la pena revisar su salud pronto."
                  : "Baja notable — vale la pena revisar su salud."}
              </p>
            )}
            {esNotable && !esBaja && (
              <p className="text-sm font-semibold">Alza notable respecto a la lectura anterior.</p>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
        <table className="w-full min-w-[420px] border-collapse">
          <thead>
            <tr>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Fecha
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Peso
              </th>
              <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                Notas
              </th>
            </tr>
          </thead>
          <tbody>
            {historial.map((fila) => (
              <tr key={fila.id}>
                <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-900">
                  {formatearFechaCalendario(fila.fecha)}
                </td>
                <td className="border-b border-n-200 px-4 py-3 tabular-nums text-n-900">
                  {Number(fila.peso_kg).toFixed(1)} kg
                </td>
                <td className="border-b border-n-200 px-4 py-3 text-n-600">{fila.notas ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
