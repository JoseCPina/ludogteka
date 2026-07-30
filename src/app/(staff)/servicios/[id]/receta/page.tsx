import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { RecetaConsumo, type LineaReceta } from "./receta-consumo";

export default async function RecetaServicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const esAdmin = sesion?.rol === "admin";

  const { data: servicio } = await supabase
    .from("servicios")
    .select("id, nombre, categoria")
    .eq("id", id)
    .single();

  if (!servicio || servicio.categoria !== "estetica") notFound();

  const [{ data: tamanos }, { data: insumos }, { data: lineasCrudo }] = await Promise.all([
    supabase.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
    supabase
      .from("insumos")
      .select("id, nombre, unidades_medida!unidad_consumo_id(etiqueta)")
      .is("deleted_at", null)
      .order("nombre"),
    supabase
      .from("recetas_consumo")
      .select(
        "id, tamano_id, insumo_id, cantidad_consumo, tamanos_categoria(etiqueta, orden), insumos(nombre, unidades_medida!unidad_consumo_id(etiqueta))"
      )
      .eq("servicio_id", id)
      .is("deleted_at", null),
  ]);

  const insumosOpciones = (insumos ?? []).map((i) => ({
    id: i.id,
    nombre: i.nombre,
  }));

  const lineas: LineaReceta[] = (lineasCrudo ?? [])
    .map((l) => {
      const tamano = l.tamanos_categoria as unknown as { etiqueta: string; orden: number } | null;
      const insumo = l.insumos as unknown as { nombre: string; unidades_medida: { etiqueta: string } | null } | null;
      return {
        id: l.id,
        tamano_id: l.tamano_id,
        tamano_etiqueta: tamano?.etiqueta ?? "—",
        orden: tamano?.orden ?? 0,
        insumo_id: l.insumo_id,
        insumo_nombre: insumo?.nombre ?? "—",
        unidad_etiqueta: insumo?.unidades_medida?.etiqueta ?? "",
        cantidad_consumo: Number(l.cantidad_consumo),
      };
    })
    .sort((a, b) => a.orden - b.orden);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/servicios/${id}`} className="text-sm font-semibold text-azul hover:underline">
          ← {servicio.nombre}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Receta de consumo — {servicio.nombre}</h1>
        <p className="mt-1 text-n-600">
          Cuánto insumo gasta este servicio, por tamaño de perro. Se descuenta solo al finalizar cada
          cita, y se puede ajustar la cantidad real en ese momento.
        </p>
      </div>

      <RecetaConsumo servicioId={id} esAdmin={esAdmin} tamanos={tamanos ?? []} insumos={insumosOpciones} lineas={lineas} />
    </div>
  );
}
