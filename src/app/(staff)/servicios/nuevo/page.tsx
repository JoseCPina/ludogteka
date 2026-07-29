import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ServicioForm } from "../servicio-form";
import { crearServicio } from "../actions";

export default async function NuevoServicioPage() {
  const supabase = await createSupabaseServerClient();
  const { data: servicios } = await supabase
    .from("servicios")
    .select("id, nombre")
    .neq("categoria", "bono")
    .is("deleted_at", null)
    .order("orden");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Nuevo servicio</h1>
        <p className="mt-1 text-n-600">
          Después de guardarlo vas a poder capturar sus precios en la matriz de tarifas.
        </p>
      </div>

      <ServicioForm
        action={crearServicio}
        serviciosDisponibles={servicios ?? []}
        textoBoton="Guardar servicio"
      />
    </div>
  );
}
