import { formatearFecha, formatearFechaCalendario } from "@/lib/formato";

export type DosisFilaCliente = { id: string; administrado_at: string; omitida: boolean; notas: string | null };

export type MedicamentoFilaCliente = {
  id: string;
  medicamento: string;
  dosis: string;
  horario: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  activo: boolean;
  dosisRegistradas: DosisFilaCliente[];
};

export function MedicamentosCliente({ medicamentos }: { medicamentos: MedicamentoFilaCliente[] }) {
  if (medicamentos.length === 0) {
    return <p className="text-n-600">Tu perro no tiene medicamentos registrados.</p>;
  }

  const ordenados = [...medicamentos].sort((a, b) => Number(b.activo) - Number(a.activo));

  return (
    <ul className="flex flex-col gap-3">
      {ordenados.map((m) => (
        <li
          key={m.id}
          className={`rounded-lg border-[1.5px] p-4 ${m.activo ? "border-n-200 bg-white" : "border-n-200 bg-n-50 opacity-70"}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-bold text-n-900">{m.medicamento}</span>
              <span className="ml-2 text-n-700">{m.dosis}</span>
              {m.horario && <span className="ml-2 text-sm text-n-500">· {m.horario}</span>}
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                m.activo ? "bg-verde-suave text-verde-oscuro" : "bg-n-100 text-n-600"
              }`}
            >
              {m.activo ? "Activo" : "Inactivo"}
            </span>
          </div>
          <p className="mt-1 text-sm text-n-600">
            Desde {formatearFechaCalendario(m.fecha_inicio)}
            {m.fecha_fin ? ` hasta ${formatearFechaCalendario(m.fecha_fin)}` : ""}
          </p>
          {m.dosisRegistradas.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 border-t border-n-200 pt-2">
              {m.dosisRegistradas.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-n-600">{formatearFecha(d.administrado_at)}</span>
                  {d.omitida && (
                    <span className="rounded-full bg-naranja-suave px-2 py-0.5 text-xs font-semibold text-naranja-oscuro">
                      Omitida
                    </span>
                  )}
                  {d.notas && <span className="text-n-700">{d.notas}</span>}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
