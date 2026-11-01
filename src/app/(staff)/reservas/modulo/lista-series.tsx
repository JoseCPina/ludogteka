import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import type { ModuloEstancia } from "@/lib/modulos";
import { formatearDiasSemana } from "../series/dias-semana";
import { zonaActual } from "@/lib/negocio/actual";
import { leerTodo, leerTodoPorIds } from "@/lib/supabase/paginar";
import { Enlace } from "@/components/ui/enlace";

// Las series se filtran por la categoría del servicio de la propia serie:
// una serie de guardería (el perro que viene todos los martes) no tiene
// nada que hacer en la lista de hotel, aunque las dos vivan en la misma
// tabla.
export async function ListaSeries({ modulo }: { modulo: ModuloEstancia }) {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();

  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);

  const { data: series, error } = await leerTodo<{ id: string; dias_semana: number[]; fecha_inicio: string; fecha_fin: string | null; perros: { nombre: string } | { nombre: string }[] | null; servicios: { nombre: string; categoria: string } | { nombre: string; categoria: string }[] | null }>(() =>
    supabase
      .from("series_recurrentes")
      .select("id, dias_semana, fecha_inicio, fecha_fin, perros(nombre), servicios!inner(nombre, categoria)")
      .eq("servicios.categoria", modulo.categoria)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id")
  );

  const serieIds = (series ?? []).map((s) => s.id as string);
  // Cada serie tiene varias estancias por venir: con muchas series pasan de 1,000 filas.
  const { data: proximas } = await leerTodoPorIds<{ serie_id: string; fecha_entrada: string }, string>(serieIds, (bloque) =>
    supabase
      .from("estancias")
      .select("serie_id, fecha_entrada")
      .in("serie_id", bloque)
      .is("deleted_at", null)
      .in("estado", ["reservada", "confirmada"])
      .gte("fecha_entrada", hoy)
      .order("fecha_entrada")
      .order("id")
  );

  const proximaPorSerie = new Map<string, string>();
  for (const p of proximas ?? []) {
    if (!proximaPorSerie.has(p.serie_id as string)) {
      proximaPorSerie.set(p.serie_id as string, p.fecha_entrada as string);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Enlace href={modulo.base} className="text-sm">
            ← {modulo.etiqueta}
          </Enlace>
          <h1 className="mt-1 text-2xl font-bold text-n-900">
            Series recurrentes — {modulo.etiqueta}
          </h1>
          <p className="mt-1 text-n-600">
            Perros que vienen a {modulo.etiqueta.toLowerCase()} en un patrón fijo.
          </p>
        </div>
        <Enlace href={`${modulo.base}/series/nueva`}>Nueva serie</Enlace>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar las series">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !series || series.length === 0 ? (
        <p className="text-n-600">
          No hay series recurrentes de {modulo.etiqueta.toLowerCase()} activas todavía.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-n-200 bg-white">
          <ul className="divide-y divide-n-200">
            {series.map((s) => {
              const perro = Array.isArray(s.perros) ? s.perros[0] : s.perros;
              const servicio = Array.isArray(s.servicios) ? s.servicios[0] : s.servicios;
              const proxima = proximaPorSerie.get(s.id as string);
              return (
                <li key={s.id}>
                  <Enlace href={`/reservas/series/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-n-50" forma="bloque">
                    <div>
                      <p className="font-semibold text-n-900">
                        {perro?.nombre ?? "—"} · {servicio?.nombre ?? "—"}
                      </p>
                      <p className="text-sm text-n-600">
                        {formatearDiasSemana(s.dias_semana as number[])}
                        {s.fecha_fin ? ` · hasta ${formatearFechaCalendario(s.fecha_fin as string)}` : ""}
                      </p>
                    </div>
                    <p className="text-sm text-n-600">
                      {proxima ? `Próxima: ${formatearFechaCalendario(proxima)}` : "Sin fechas próximas"}
                    </p>
                  </Enlace>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
