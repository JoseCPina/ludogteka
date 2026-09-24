import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { InsumoForm } from "../insumo-form";
import { crearInsumo } from "../actions";
import { cargarAreas, puedeDarDeAlta } from "../comun";

// Alta rápida de un consumible: admin y recepción, sin proveedor y sin
// costo (el costo lo completa después quien tenga el permiso de costos).
export default async function NuevoConsumiblePage() {
  const sesion = await obtenerSesionConRol();
  if (!puedeDarDeAlta(sesion?.rol)) redirect("/inventario");
  const supabase = await createSupabaseServerClient();
  const [areas, { data: unidades }] = await Promise.all([
    cargarAreas(supabase),
    supabase.from("unidades_medida").select("id, etiqueta, magnitud").is("deleted_at", null).order("etiqueta"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/inventario" className="text-sm font-semibold text-azul hover:underline">
          ← Inventario
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Nuevo consumible</h1>
        <p className="mt-1 max-w-2xl text-n-600">
          Algo que se gasta y se repone. No hace falta proveedor ni costo: el costo lo completa admin
          después. El alimento que el dueño trae para su perro no va aquí: es suyo, no del negocio.
        </p>
      </div>

      <InsumoForm action={crearInsumo} areas={areas} unidades={unidades ?? []} textoBoton="Dar de alta" />
    </div>
  );
}
