import { formatearFecha } from "@/lib/formato";

export type EntradaBitacoraCliente = {
  id: string;
  tipo: "actualizacion" | "incidencia";
  nota: string | null;
  foto_url: string | null;
  created_at: string;
};

export function BitacoraCliente({ entradas }: { entradas: EntradaBitacoraCliente[] }) {
  if (entradas.length === 0) {
    return <p className="text-n-600">Todavía no hay entradas en la bitácora de tu perro.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {entradas.map((e) => (
        <li
          key={e.id}
          className={`rounded-lg border-[1.5px] p-4 ${
            e.tipo === "incidencia" ? "border-naranja bg-naranja-suave" : "border-n-200 bg-white"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                e.tipo === "incidencia" ? "bg-naranja-oscuro text-white" : "bg-azul-suave text-azul"
              }`}
            >
              {e.tipo === "incidencia" ? "Incidencia" : "Actualización"}
            </span>
            <span className="text-sm text-n-500">{formatearFecha(e.created_at)}</span>
          </div>
          {e.nota && <p className="mt-2 text-n-800">{e.nota}</p>}
          {e.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.foto_url} alt="" className="mt-3 max-h-64 rounded-md object-cover" />
          )}
        </li>
      ))}
    </ul>
  );
}
