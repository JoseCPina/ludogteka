import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ServicioForm } from "../servicio-form";
import { BajaServicioBoton } from "../baja-servicio-boton";
import { actualizarServicio, darDeBajaServicio } from "../actions";

export default async function EditarServicioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const { id } = await params;
  const { creado } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const [{ data: servicio }, { data: serviciosDisponibles }] = await Promise.all([
    supabase
      .from("servicios")
      .select(
        "id, clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad, servicio_incluido_id, cantidad_incluida, vigencia_dias, orden, deleted_at"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("servicios")
      .select("id, nombre")
      .neq("categoria", "bono")
      .neq("id", id)
      .is("deleted_at", null)
      .order("orden"),
  ]);

  if (!servicio) notFound();

  const actualizarConId = actualizarServicio.bind(null, id);
  const bajaConId = darDeBajaServicio.bind(null, id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-n-900">{servicio.nombre}</h1>
            {servicio.deleted_at && (
              <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
                Inactivo
              </span>
            )}
          </div>
          <p className="mt-1 text-n-600">Editar el servicio.</p>
        </div>
        <div className="flex gap-2">
          {servicio.categoria === "estetica" && (
            <Link href={`/servicios/${id}/receta`}>
              <Button type="button" variante="secundario">
                Receta de consumo
              </Button>
            </Link>
          )}
          <Link href={`/servicios/${id}/tarifas`}>
            <Button type="button">Ver/editar tarifas</Button>
          </Link>
        </div>
      </div>

      {creado === "1" && <Alert variante="exito" titulo="Servicio creado correctamente" />}
      {servicio.deleted_at && (
        <Alert variante="advertencia" titulo="Este servicio está inactivo">
          No aparece para cobrarse. Se puede seguir editando y su histórico de precios se conserva.
        </Alert>
      )}

      <ServicioForm
        action={actualizarConId}
        serviciosDisponibles={serviciosDisponibles ?? []}
        valoresIniciales={{
          clave: servicio.clave,
          nombre: servicio.nombre,
          categoria: servicio.categoria,
          unidad: servicio.unidad,
          depende_tamano: servicio.depende_tamano,
          depende_pelaje: servicio.depende_pelaje,
          depende_cantidad: servicio.depende_cantidad,
          servicio_incluido_id: servicio.servicio_incluido_id,
          cantidad_incluida: servicio.cantidad_incluida,
          vigencia_dias: servicio.vigencia_dias,
          orden: servicio.orden,
        }}
        textoBoton="Guardar cambios"
      />

      {!servicio.deleted_at && (
        <div className="flex flex-col gap-3 border-t border-n-200 pt-6">
          <h2 className="text-lg font-bold text-n-900">Dar de baja</h2>
          <p className="text-n-600">
            Un servicio dado de baja deja de aparecer para cobrarse, pero su histórico de precios
            y las reservas/tickets que ya lo usaron no se afectan.
          </p>
          <BajaServicioBoton accion={bajaConId} nombre={servicio.nombre} />
        </div>
      )}
    </div>
  );
}
