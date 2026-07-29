import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const ETIQUETA_CATEGORIA: Record<string, string> = {
  guarderia: "Guardería",
  hotel: "Hotel",
  estetica: "Estética",
  cargo: "Cargo adicional",
  bono: "Bono",
};

export default async function ServiciosPage() {
  const supabase = await createSupabaseServerClient();
  // Sin filtrar deleted_at: esta pantalla ES el histórico del catálogo.
  // Quien arme un selector para cobrar (Fase 4/5) sí debe filtrar
  // deleted_at is null — aquí un servicio inactivo se ve, solo marcado.
  const { data: servicios, error } = await supabase
    .from("servicios")
    .select("id, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad, deleted_at")
    .order("orden");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Servicios</h1>
          <p className="mt-1 text-n-600">
            Catálogo de guardería, hotel, estética, cargos adicionales y bonos.
          </p>
        </div>
        <Link href="/servicios/nuevo">
          <Button type="button">Nuevo servicio</Button>
        </Link>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar los servicios">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !servicios || servicios.length === 0 ? (
        <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-10 text-center">
          <h3 className="text-lg font-bold text-n-900">Todavía no hay servicios</h3>
          <p className="mt-1 text-n-600">En cuanto des de alta el primero, va a aparecer aquí.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                  Nombre
                </th>
                <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                  Categoría
                </th>
                <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                  Dimensiones de precio
                </th>
                <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id} className={s.deleted_at ? "opacity-60" : ""}>
                  <td className="border-b border-n-200 px-4 py-3">
                    <Link
                      href={`/servicios/${s.id}`}
                      className="rounded font-semibold text-azul hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul"
                    >
                      {s.nombre}
                    </Link>
                  </td>
                  <td className="border-b border-n-200 px-4 py-3 text-n-700">
                    {ETIQUETA_CATEGORIA[s.categoria] ?? s.categoria}
                  </td>
                  <td className="border-b border-n-200 px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {s.depende_tamano && (
                        <span className="rounded-full bg-azul-suave px-2 py-0.5 text-xs font-semibold text-azul">
                          Tamaño
                        </span>
                      )}
                      {s.depende_pelaje && (
                        <span className="rounded-full bg-azul-suave px-2 py-0.5 text-xs font-semibold text-azul">
                          Pelaje
                        </span>
                      )}
                      {s.depende_cantidad && (
                        <span className="rounded-full bg-azul-suave px-2 py-0.5 text-xs font-semibold text-azul">
                          Cantidad
                        </span>
                      )}
                      {!s.depende_tamano && !s.depende_pelaje && !s.depende_cantidad && (
                        <span className="text-sm text-n-500">Precio único</span>
                      )}
                    </div>
                  </td>
                  <td className="border-b border-n-200 px-4 py-3">
                    {s.deleted_at ? (
                      <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
                        Inactivo
                      </span>
                    ) : (
                      <span className="rounded-full bg-verde-suave px-2 py-0.5 text-xs font-semibold text-verde-oscuro">
                        Activo
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
