import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InsumoForm } from "../insumo-form";
import { crearInsumo } from "../actions";

export default async function NuevoInsumoPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: categorias }, { data: unidades }] = await Promise.all([
    supabase.from("categorias_insumo").select("id, etiqueta").is("deleted_at", null).order("orden"),
    supabase.from("unidades_medida").select("id, etiqueta, magnitud").is("deleted_at", null).order("etiqueta"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Nuevo insumo</h1>
        <p className="mt-1 text-n-600">Da de alta un insumo de estética o general.</p>
      </div>

      <InsumoForm
        action={crearInsumo}
        categorias={categorias ?? []}
        unidades={unidades ?? []}
        textoBoton="Crear insumo"
      />
    </div>
  );
}
