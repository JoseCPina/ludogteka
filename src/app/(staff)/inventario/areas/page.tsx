import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { cargarAreas } from "../comun";
import { EditorAreas } from "./editor-areas";

// Áreas del inventario: solo admin las edita (la base también lo aplica).
export default async function AreasPage() {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") redirect("/inventario");
  const supabase = await createSupabaseServerClient();
  const [areas, { data: insumos }, { data: equipos }] = await Promise.all([
    cargarAreas(supabase),
    supabase.from("insumos").select("area_id").is("deleted_at", null),
    supabase.from("equipos").select("area_id").is("deleted_at", null),
  ]);
  const cuenta = (lista: { area_id: string }[] | null, id: string) => (lista ?? []).filter((x) => x.area_id === id).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/inventario" className="text-sm font-semibold text-morado hover:underline">
          ← Inventario
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Áreas del inventario</h1>
        <p className="mt-1 text-n-600">Cómo se agrupan los consumibles y el equipo.</p>
      </div>
      <EditorAreas
        areas={areas.map((a) => ({ id: a.id, nombre: a.nombre, consumibles: cuenta(insumos, a.id), equipos: cuenta(equipos, a.id) }))}
      />
    </div>
  );
}
