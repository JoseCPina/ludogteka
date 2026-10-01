import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { negocioActual } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";
import { cargarPlantilla, respuestasBuenDia, seccionesParaFormulario } from "@/lib/reporte/carga";
import { coloresDeTarjeta } from "@/lib/reporte/colores";
import { contactoDelPerro } from "@/lib/reporte/enlaces";
import { metaDeReporte } from "@/lib/reporte/meta";
import { respuestasDeContenido, respuestasVacias, type ContenidoReporte } from "@/lib/reporte/tipos";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { FormularioReporte } from "./formulario-reporte";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReportePerroPage({ params }: { params: Promise<{ perroId: string }> }) {
  const { perroId } = await params;
  const volver = (
    <Link href="/guarderia/reportes" className="text-sm font-semibold text-morado hover:underline">
      ← Reportes del día
    </Link>
  );
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "reportes_guarderia")) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {volver}
        <Alert variante="advertencia" titulo="No tienes el permiso «Reportes de guardería»">
          Pídele a quien administra el negocio que te lo dé en Permisos.
        </Alert>
      </div>
    );
  }
  if (!UUID.test(perroId)) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {volver}
        <Alert variante="error" titulo="No encontramos a ese perro" />
      </div>
    );
  }

  const negocio = await negocioActual();
  const supabase = await createSupabaseServerClient();
  const { data: diaData } = await supabase.rpc("fecha_negocio");
  const hoy = String(diaData);

  const [{ data: perro }, { data: adentro }, plantilla, marca, contacto] = await Promise.all([
    supabase.from("perros").select("nombre").eq("id", perroId).is("deleted_at", null).maybeSingle(),
    supabase.from("quienes_estan_adentro").select("estancia_id").eq("perro_id", perroId).eq("categoria", "guarderia").limit(1),
    cargarPlantilla(supabase),
    cargarNegocioLanding(),
    contactoDelPerro(supabase, perroId),
  ]);
  if (!perro) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {volver}
        <Alert variante="error" titulo="No encontramos a ese perro" />
      </div>
    );
  }

  const nombreDescarga = `reporte-${String(perro.nombre).toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`;
  const [meta, { data: reporte }, { data: previo }] = await Promise.all([
    metaDeReporte(supabase, negocio.id, { perroId, fecha: hoy }, nombreDescarga),
    supabase.from("reportes_guarderia").select("contenido").eq("perro_id", perroId).eq("fecha", hoy).is("deleted_at", null).maybeSingle(),
    supabase.from("reportes_guarderia").select("id").eq("perro_id", perroId).lt("fecha", hoy).is("deleted_at", null).limit(1).maybeSingle(),
  ]);

  const guardado = (reporte?.contenido as ContenidoReporte | undefined) ?? null;
  if (!adentro?.length && !guardado) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {volver}
        <Alert variante="advertencia" titulo={`${perro.nombre} no está en guardería ahora`}>
          El reporte se llena para los perros con una estancia de guardería en curso hoy.
        </Alert>
      </div>
    );
  }

  const secciones = seccionesParaFormulario(plantilla.secciones, guardado);
  const inicial = { ...respuestasVacias(secciones), ...(guardado ? respuestasDeContenido(guardado) : {}) };

  return (
    <FormularioReporte
      perroId={perroId}
      perroNombre={perro.nombre as string}
      secciones={secciones}
      respuestasIniciales={inicial}
      buenDia={respuestasBuenDia(secciones)}
      colores={coloresDeTarjeta(plantilla.config, { color: marca.marca?.color ?? null })}
      metaInicial={meta}
      hayAyer={Boolean(previo)}
      faltaTelefono={contacto.error}
      retencionDias={plantilla.config?.retencion_dias ?? 7}
    />
  );
}
