import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { formatearDiasSemana } from "./dias-semana";

export default async function SeriesPage() {
  const supabase = await createSupabaseServerClient();

  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio();

  const { data: series, error } = await supabase
    .from("series_recurrentes")
    .select("id, dias_semana, fecha_inicio, fecha_fin, perros(nombre), servicios(nombre)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const serieIds = (series ?? []).map((s) => s.id as string);
  const { data: proximas } = serieIds.length
    ? await supabase
        .from("estancias")
        .select("serie_id, fecha_entrada")
        .in("serie_id", serieIds)
        .is("deleted_at", null)
        .in("estado", ["reservada", "confirmada"])
        .gte("fecha_entrada", hoy)
        .order("fecha_entrada")
    : { data: [] as { serie_id: string; fecha_entrada: string }[] };

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
          <h1 className="text-2xl font-bold text-n-900">Series recurrentes</h1>
          <p className="mt-1 text-n-600">Perros que vienen en un patrón fijo — guardería u hotel.</p>
        </div>
        <Link href="/reservas/series/nueva">
          <Button type="button">Nueva serie</Button>
        </Link>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar las series">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !series || series.length === 0 ? (
        <p className="text-n-600">No hay series recurrentes activas todavía.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-n-200 bg-white">
          <ul className="divide-y divide-n-200">
            {series.map((s) => {
              const perro = Array.isArray(s.perros) ? s.perros[0] : s.perros;
              const servicio = Array.isArray(s.servicios) ? s.servicios[0] : s.servicios;
              const proxima = proximaPorSerie.get(s.id as string);
              return (
                <li key={s.id}>
                  <Link
                    href={`/reservas/series/${s.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-n-50"
                  >
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
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
