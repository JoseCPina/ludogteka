import { formatearFechaCalendario } from "@/lib/formato";

export type RecetaDelDueno = {
  numero: number;
  fecha: string;
  estado: "emitida" | "anulada";
  medico: string | null;
  lineas: { producto: string; dosis: string; via: string; frecuencia: string; duracion_dias: number; tiempo_retiro: string | null; indicaciones: string | null }[];
};

/** Las recetas que el médico emitió a la mascota, en el portal del dueño. Sin lotes, folios del SITPV ni notas internas. */
export function RecetasCliente({ recetas }: { recetas: RecetaDelDueno[] }) {
  if (recetas.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" data-recetas-cliente>
      <h2 className="text-lg font-bold text-n-900">Recetas</h2>
      <ul className="flex flex-col gap-3">
        {recetas.map((r) => (
          <li key={r.numero} className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-n-900">Receta {r.numero}{r.estado === "anulada" ? " · anulada" : ""}</span>
              <span className="text-sm text-n-600">{formatearFechaCalendario(r.fecha)}{r.medico ? ` · ${r.medico}` : ""}</span>
            </div>
            {r.lineas.map((l, i) => (
              <p key={i} className={`text-n-800 ${r.estado === "anulada" ? "line-through opacity-60" : ""}`}>
                <span className="font-semibold">{l.producto}</span> — {l.dosis}, vía {l.via.toLowerCase()}, {l.frecuencia.toLowerCase()}, por {l.duracion_dias} {l.duracion_dias === 1 ? "día" : "días"}
                {l.tiempo_retiro ? `. Tiempo de retiro: ${l.tiempo_retiro}` : ""}{l.indicaciones ? `. ${l.indicaciones}` : ""}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
