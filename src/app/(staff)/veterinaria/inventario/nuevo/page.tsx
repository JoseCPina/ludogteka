import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { cargarAreas } from "../../../inventario/comun";
import { ProductoForm } from "../producto-form";
import type { PrincipioActivo } from "../../comun";

export default async function NuevoProductoClinico() {
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "lotes_clinicos")) redirect("/veterinaria/inventario");
  const supabase = await createSupabaseServerClient();
  const [areas, { data: unidades }, { data: principios }] = await Promise.all([
    cargarAreas(supabase),
    supabase.from("unidades_medida").select("id, etiqueta").is("deleted_at", null).order("etiqueta"),
    supabase.from("principios_activos").select("id, nombre, grupo_senasica, clasificacion_lgs, es_antimicrobiano, por_confirmar, nota").is("deleted_at", null).order("nombre"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/veterinaria/inventario" className="text-sm font-semibold text-morado hover:underline">
          ← Inventario clínico
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Nuevo producto clínico</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          Un producto clínico se maneja por lotes, con su caducidad. Después de crearlo registras la primera entrada con su código de lote.
        </p>
      </div>
      <ProductoForm
        areas={areas.map((a) => ({ id: a.id, etiqueta: a.nombre }))}
        unidades={(unidades ?? []).map((u) => ({ id: u.id as string, etiqueta: u.etiqueta as string }))}
        principios={(principios ?? []) as PrincipioActivo[]}
        puedeEditar
      />
    </div>
  );
}
