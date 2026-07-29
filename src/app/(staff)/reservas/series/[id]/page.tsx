import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { hoyNegocio } from "@/lib/formato";
import { SerieDetalle } from "./serie-detalle";

export default async function SerieDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio();

  // Sin filtro de deleted_at: una serie cancelada debe poder seguir
  // viéndose (patrón + historial), no dar 404 justo después de cancelarla.
  const { data: serie, error: errorSerie } = await supabase
    .from("series_recurrentes")
    .select(
      "id, perro_id, servicio_id, dias_semana, fecha_inicio, fecha_fin, deleted_at, perros(nombre), servicios(nombre)"
    )
    .eq("id", id)
    .single();

  if (errorSerie || !serie) notFound();

  const perro = Array.isArray(serie.perros) ? serie.perros[0] : serie.perros;

  const [{ data: estancias, error: errorEstancias }, { data: pausas, error: errorPausas }, { data: servicios }] =
    await Promise.all([
      supabase
        .from("estancias")
        .select("id, fecha_entrada, estado")
        .eq("serie_id", id)
        .is("deleted_at", null)
        .order("fecha_entrada"),
      supabase
        .from("series_pausas")
        .select("id, desde, hasta, motivo")
        .eq("serie_id", id)
        .is("deleted_at", null)
        .order("desde"),
      supabase
        .from("servicios")
        .select("id, nombre, categoria")
        .in("categoria", ["guarderia", "hotel"])
        .is("deleted_at", null)
        .order("orden"),
    ]);

  const error = errorEstancias ?? errorPausas;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/reservas/series" className="text-sm font-semibold text-azul hover:underline">
          ← Series recurrentes
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">{perro?.nombre ?? "—"}</h1>
        {serie.perro_id && (
          <Link href={`/perros/${serie.perro_id}`} className="text-sm text-azul hover:underline">
            Ver expediente del perro →
          </Link>
        )}
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la serie">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <SerieDetalle
          serieId={serie.id}
          servicioId={serie.servicio_id}
          diasSemana={serie.dias_semana as number[]}
          fechaInicio={serie.fecha_inicio}
          fechaFin={serie.fecha_fin}
          cancelada={Boolean(serie.deleted_at)}
          servicios={servicios ?? []}
          estancias={(estancias ?? []).map((e) => ({
            id: e.id as string,
            fechaEntrada: e.fecha_entrada as string,
            estado: e.estado as string,
          }))}
          pausas={(pausas ?? []).map((p) => ({
            id: p.id as string,
            desde: p.desde as string,
            hasta: p.hasta as string,
            motivo: p.motivo as string | null,
          }))}
          hoy={hoy}
        />
      )}
    </div>
  );
}
