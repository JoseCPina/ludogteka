import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { cargarPlantilla } from "@/lib/reporte/carga";
import { coloresDeTarjeta } from "@/lib/reporte/colores";
import { EditorPlantilla } from "./editor-plantilla";

// Plantilla del reporte de comportamiento, colores de la tarjeta y los días
// que viven las fotos, los videos y las ligas. Solo admin.
export default async function ReporteGuarderiaAdminPage() {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") redirect("/admin");
  const supabase = await createSupabaseServerClient();
  const conReporte = sesion.modulos.includes("guarderia");
  const [plantilla, negocio] = await Promise.all([
    conReporte ? cargarPlantilla(supabase, { incluirInactivas: true }) : Promise.resolve({ config: null, secciones: [] }),
    cargarNegocioLanding(),
  ]);
  let config = plantilla.config;
  if (!conReporte) {
    const { data } = await supabase
      .from("reporte_config")
      .select("id, titulo, subtitulo, color_primario, color_secundario, color_acento, retencion_dias")
      .is("deleted_at", null)
      .maybeSingle();
    config = data as typeof config;
  }
  const porOmision = coloresDeTarjeta(null, { color: negocio.marca?.color ?? null });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header>
        <Link href="/admin" className="text-sm font-semibold text-morado hover:underline">
          ← Administración
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-n-900">Reporte, fotos y videos</h1>
        <p className="mt-1 text-n-700">
          {conReporte
            ? "Cómo se llena y cómo se ve el reporte de comportamiento diario de guardería, y cuánto tiempo viven las fotos, los videos y las ligas que le mandas al dueño."
            : "Cuánto tiempo viven las fotos, los videos y las ligas que le mandas al dueño. El reporte de comportamiento es del módulo de guardería, que este negocio no tiene activo."}
        </p>
      </header>
      <EditorPlantilla
        config={config}
        secciones={plantilla.secciones}
        conReporte={conReporte}
        coloresMarca={porOmision}
      />
    </div>
  );
}
