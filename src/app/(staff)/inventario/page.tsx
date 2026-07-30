import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ creado?: string }>;
}) {
  const { creado } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const esAdmin = sesion?.rol === "admin";

  const [{ data: insumos, error }, { data: existencias }, { data: caducidades }] = await Promise.all([
    supabase
      .from("insumos")
      .select(
        "id, nombre, deleted_at, categorias_insumo(etiqueta), unidades_medida!unidad_consumo_id(etiqueta, equivalencia_en_base)"
      )
      .order("nombre"),
    supabase.from("insumos_existencia_actual").select("insumo_id, existencia_actual, stock_minimo, bajo_minimo"),
    supabase.from("insumos_proxima_caducidad").select("insumo_id, estado"),
  ]);

  const existenciaPorInsumo = new Map((existencias ?? []).map((e) => [e.insumo_id, e]));
  const insumosBajoMinimo = (existencias ?? []).filter((e) => e.bajo_minimo);
  const caducidadPorInsumo = new Map((caducidades ?? []).map((c) => [c.insumo_id, c.estado]));
  const insumosPorCaducar = (caducidades ?? []).filter((c) => c.estado === "por_vencer" || c.estado === "vencida");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Inventario</h1>
          <p className="mt-1 text-n-600">Insumos de estética y generales, existencias y proveedores.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/inventario/proveedores">
            <Button type="button" variante="secundario">
              Proveedores
            </Button>
          </Link>
          {esAdmin && (
            <Link href="/inventario/nuevo">
              <Button type="button">Nuevo insumo</Button>
            </Link>
          )}
        </div>
      </div>

      {creado === "1" && <Alert variante="exito" titulo="Insumo creado correctamente" />}

      {insumosBajoMinimo.length > 0 && (
        <Alert variante="advertencia" titulo={`${insumosBajoMinimo.length} insumo(s) por debajo del stock mínimo`}>
          Revisa la columna de existencia abajo — marcados en la tabla.
        </Alert>
      )}

      {insumosPorCaducar.length > 0 && (
        <Alert variante="advertencia" titulo={`${insumosPorCaducar.length} insumo(s) por caducar o ya caducados`}>
          Revisa el detalle de cada insumo para ver la fecha del lote.
        </Alert>
      )}

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar los insumos">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !insumos || insumos.length === 0 ? (
        <div className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-10 text-center">
          <h3 className="text-lg font-bold text-n-900">Todavía no hay insumos</h3>
          <p className="mt-1 text-n-600">En cuanto des de alta el primero, va a aparecer aquí.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                  Nombre
                </th>
                <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                  Categoría
                </th>
                <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                  Existencia
                </th>
                <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {insumos.map((i) => {
                const categoria = i.categorias_insumo as unknown as { etiqueta: string } | null;
                const unidadConsumo = i.unidades_medida as unknown as {
                  etiqueta: string;
                  equivalencia_en_base: number;
                } | null;
                const existencia = existenciaPorInsumo.get(i.id);
                const existenciaMostrada =
                  existencia && unidadConsumo
                    ? existencia.existencia_actual / Number(unidadConsumo.equivalencia_en_base)
                    : null;
                return (
                  <tr key={i.id} className={i.deleted_at ? "opacity-60" : ""}>
                    <td className="border-b border-n-200 px-4 py-3">
                      <Link
                        href={`/inventario/${i.id}`}
                        className="rounded font-semibold text-azul hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul"
                      >
                        {i.nombre}
                      </Link>
                    </td>
                    <td className="border-b border-n-200 px-4 py-3 text-n-700">{categoria?.etiqueta ?? "—"}</td>
                    <td className="border-b border-n-200 px-4 py-3 text-n-700">
                      {existenciaMostrada !== null
                        ? `${existenciaMostrada.toLocaleString("es-MX")} ${unidadConsumo?.etiqueta ?? ""}`
                        : "—"}
                    </td>
                    <td className="border-b border-n-200 px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {i.deleted_at ? (
                          <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
                            Inactivo
                          </span>
                        ) : (
                          <>
                            {existencia?.bajo_minimo ? (
                              <span className="rounded-full bg-amarillo-suave px-2 py-0.5 text-xs font-semibold text-amarillo-oscuro">
                                Bajo mínimo
                              </span>
                            ) : (
                              <span className="rounded-full bg-verde-suave px-2 py-0.5 text-xs font-semibold text-verde-oscuro">
                                OK
                              </span>
                            )}
                            {caducidadPorInsumo.get(i.id) === "por_vencer" && (
                              <span className="rounded-full bg-amarillo-suave px-2 py-0.5 text-xs font-semibold text-amarillo-oscuro">
                                Por caducar
                              </span>
                            )}
                            {caducidadPorInsumo.get(i.id) === "vencida" && (
                              <span className="rounded-full bg-naranja-suave px-2 py-0.5 text-xs font-semibold text-naranja-oscuro">
                                Caducado
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
