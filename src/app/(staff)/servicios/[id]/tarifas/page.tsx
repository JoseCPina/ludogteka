import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MatrizTarifas } from "../../matriz-tarifas";
import { HistorialTarifas, type FilaHistorial } from "../../historial-tarifas";

export default async function TarifasServicioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: servicio }, { data: tamanos }, { data: pelajes }, { data: vigentes }, { data: historialCrudo }] =
    await Promise.all([
      supabase
        .from("servicios")
        .select("id, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad, deleted_at")
        .eq("id", id)
        .single(),
      supabase.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
      supabase.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden"),
      supabase
        .from("tarifas_vigentes")
        .select("tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, precio, no_aplica")
        .eq("servicio_id", id),
      supabase
        .from("tarifas")
        .select("id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, precio, no_aplica, vigencia_desde, created_at, created_by")
        .eq("servicio_id", id)
        .order("vigencia_desde", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  if (!servicio) notFound();

  const tamanoEtiqueta = new Map((tamanos ?? []).map((t) => [t.id, t.etiqueta]));
  const pelajeEtiqueta = new Map((pelajes ?? []).map((p) => [p.id, p.etiqueta]));

  const idsCreadores = Array.from(
    new Set((historialCrudo ?? []).map((f) => f.created_by).filter((v): v is string => Boolean(v)))
  );
  let nombresCreadores = new Map<string, string>();
  if (idsCreadores.length > 0) {
    const { data: perfiles } = await supabase
      .from("profiles")
      .select("id, nombre_completo")
      .in("id", idsCreadores);
    nombresCreadores = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo ?? "—"]));
  }

  const historial: FilaHistorial[] = (historialCrudo ?? []).map((f) => ({
    id: f.id,
    tamano_etiqueta: f.tamano_id ? (tamanoEtiqueta.get(f.tamano_id) ?? "—") : "—",
    pelaje_etiqueta: f.pelaje_id ? (pelajeEtiqueta.get(f.pelaje_id) ?? "—") : "—",
    cantidad_desde: f.cantidad_desde,
    cantidad_hasta: f.cantidad_hasta,
    precio: f.precio,
    no_aplica: f.no_aplica,
    vigencia_desde: f.vigencia_desde,
    created_at: f.created_at,
    creado_por: f.created_by ? (nombresCreadores.get(f.created_by) ?? "—") : "—",
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/servicios/${id}`} className="text-sm font-semibold text-azul hover:underline">
          ← {servicio.nombre}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Tarifas — {servicio.nombre}</h1>
        <p className="mt-1 text-n-600">
          Solo se guardan las celdas que cambien. Nunca se sobreescribe un precio anterior.
        </p>
      </div>

      <MatrizTarifas
        servicioId={id}
        dependeTamano={servicio.depende_tamano}
        dependePelaje={servicio.depende_pelaje}
        dependeCantidad={servicio.depende_cantidad}
        tamanos={tamanos ?? []}
        pelajes={pelajes ?? []}
        vigentes={vigentes ?? []}
      />

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Historial de precios</h2>
        <HistorialTarifas filas={historial} />
      </div>
    </div>
  );
}
