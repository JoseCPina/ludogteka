import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { cargarAreas, puedeDarDeAlta } from "../../comun";
import { EquipoForm } from "../equipo-form";
import { crearEquipo } from "../equipo-actions";

// Alta rápida de equipo: admin y recepción, sin costo.
export default async function NuevoEquipoPage() {
  const sesion = await obtenerSesionConRol();
  if (!puedeDarDeAlta(sesion?.rol)) redirect("/inventario?ver=equipo");
  const supabase = await createSupabaseServerClient();
  const areas = await cargarAreas(supabase);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/inventario?ver=equipo" className="text-sm font-semibold text-morado hover:underline">
          ← Equipo
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Nuevo equipo</h1>
        <p className="mt-1 max-w-2xl text-n-600">
          Algo que no se gasta: tijeras, secadora, camas, platos. Se lleva cuántos hay, en qué estado
          están y cuándo toca su mantenimiento.
        </p>
      </div>
      <EquipoForm action={crearEquipo} areas={areas} textoBoton="Dar de alta" esAlta />
    </div>
  );
}
