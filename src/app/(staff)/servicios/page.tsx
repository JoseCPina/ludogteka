import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { contarSinTarifa, type CeldaVigente } from "@/lib/tarifas/matriz";
import { contarPerrosSinRazaCatalogo } from "@/lib/razas";
import { AvisoRazasSinCatalogar } from "@/components/aviso-razas-sin-catalogar";

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
  const [
    { data: servicios, error },
    { data: grupos },
    { data: tamanos },
    { data: pelajes },
    { data: vigentes },
    perrosSinRaza,
  ] = await Promise.all([
      supabase
        .from("servicios")
        .select(
          "id, nombre, categoria, unidad, depende_grupo_raza, depende_tamano, depende_pelaje, depende_cantidad, deleted_at"
        )
        .order("orden"),
      supabase.from("grupos_raza").select("id, nombre, depende_tamano").is("deleted_at", null).order("orden"),
      supabase.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
      supabase.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden"),
      supabase
        .from("tarifas_vigentes")
        .select("servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, precio, no_aplica"),
      contarPerrosSinRazaCatalogo(supabase),
    ]);

  // Un servicio a medio capturar no se nota hasta que alguien intenta
  // reservarlo y la app lo rechaza con el cliente enfrente. Contar los
  // huecos aquí es lo que convierte ese tropiezo en un aviso que se ve
  // desde la lista, sin entrar a cada matriz a buscarlos.
  const catalogos = {
    grupos: grupos ?? [],
    tamanos: tamanos ?? [],
    pelajes: pelajes ?? [],
  };
  const vigentesPorServicio = new Map<string, CeldaVigente[]>();
  for (const v of vigentes ?? []) {
    const lista = vigentesPorServicio.get(v.servicio_id) ?? [];
    lista.push(v);
    vigentesPorServicio.set(v.servicio_id, lista);
  }
  const huecos = new Map<string, number>();
  for (const s of servicios ?? []) {
    if (s.deleted_at) continue;
    huecos.set(s.id, contarSinTarifa(s, catalogos, vigentesPorServicio.get(s.id) ?? []));
  }
  const serviciosConHuecos = Array.from(huecos.values()).filter((n) => n > 0).length;

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

      <AvisoRazasSinCatalogar cuantos={perrosSinRaza} />

      {serviciosConHuecos > 0 && (
        <Alert
          variante="advertencia"
          titulo={
            serviciosConHuecos === 1
              ? "Hay un servicio con tarifas sin capturar"
              : `Hay ${serviciosConHuecos} servicios con tarifas sin capturar`
          }
        >
          Están marcados abajo. Mientras falte el precio de una combinación, esa combinación no se
          puede reservar ni cobrar: la app la rechaza en el mostrador. Si es algo que el negocio no
          ofrece, entra a sus tarifas y márcalo como <strong>No aplica</strong>.
        </Alert>
      )}

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
              {servicios.map((s) => {
                const faltan = huecos.get(s.id) ?? 0;
                return (
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
                        {s.depende_grupo_raza && (
                          <span className="rounded-full bg-azul-suave px-2 py-0.5 text-xs font-semibold text-azul">
                            Grupo de raza
                          </span>
                        )}
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
                        {!s.depende_grupo_raza &&
                          !s.depende_tamano &&
                          !s.depende_pelaje &&
                          !s.depende_cantidad && (
                            <span className="text-sm text-n-500">Precio único</span>
                          )}
                      </div>
                    </td>
                    <td className="border-b border-n-200 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {s.deleted_at ? (
                          <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
                            Inactivo
                          </span>
                        ) : (
                          <span className="rounded-full bg-verde-suave px-2 py-0.5 text-xs font-semibold text-verde-oscuro">
                            Activo
                          </span>
                        )}
                        {faltan > 0 && (
                          <Link
                            href={`/servicios/${s.id}/tarifas`}
                            className="rounded-full border-[1.5px] border-naranja-oscuro bg-naranja-suave px-2 py-0.5 text-xs font-bold text-naranja-oscuro hover:underline"
                          >
                            {faltan} sin tarifa
                          </Link>
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
