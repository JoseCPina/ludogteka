import { notFound } from "next/navigation";
import { SiPuedeAbrir } from "@/components/acceso-contexto";
import { ComoSeCobra } from "./como-se-cobra";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MatrizTarifas } from "../../matriz-tarifas";
import { HistorialTarifas, type FilaHistorial } from "../../historial-tarifas";
import { PreciosPorDia, type PrecioDia } from "../../precios-por-dia";
import { zonaActual, negocioIdActual } from "@/lib/negocio/actual";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { nombresDePersonal } from "@/lib/personal/nombres";
import { hoyNegocio } from "@/lib/formato";
import { Enlace } from "@/components/ui/enlace";

export default async function TarifasServicioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const zona = await zonaActual();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [
    { data: servicio },
    { data: grupos },
    { data: tamanos },
    { data: pelajes },
    { data: vigentes },
    { data: historialCrudo },
    { data: preciosDia },
    { data: hoyData },
    { data: otros },
  ] = await Promise.all([
    supabase
      .from("servicios")
      .select(
        "id, nombre, categoria, unidad, depende_grupo_raza, depende_tamano, depende_pelaje, depende_cantidad, acepta_pelo_maltratado, monto_libre, deleted_at"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("grupos_raza")
      .select("id, nombre, depende_tamano, depende_pelaje")
      .is("deleted_at", null)
      .order("orden"),
    supabase.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
    supabase.from("tipos_pelaje").select("id, etiqueta, clave").is("deleted_at", null).order("orden"),
    supabase
      .from("tarifas_vigentes")
      .select(
        "grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, precio, precio_pelo_maltratado, no_aplica, calculado"
      )
      .eq("servicio_id", id),
    supabase
      .from("tarifas")
      .select(
        "id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, precio, no_aplica, vigencia_desde, created_at, created_by"
      )
      .eq("servicio_id", id)
      .order("vigencia_desde", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("tarifas_dia_semana")
      .select("id, dia_semana, precio, vigencia_desde, created_at")
      .eq("servicio_id", id)
      .is("deleted_at", null)
      .order("dia_semana"),
    supabase.rpc("fecha_negocio"),
    // QA R22 (N62): candidatos para «Copiar precios de otro servicio» (misma categoría, con precios vigentes).
    supabase.from("servicios").select("id, nombre, categoria, monto_libre, depende_grupo_raza, depende_tamano, depende_pelaje").neq("id", id).is("deleted_at", null).order("orden").limit(200),
  ]);

  if (!servicio) notFound();

  // QA N43: la última captura de precios que esta pantalla vio; si otra persona captura después, no se guarda encima
  // sin avisar. Sin precios todavía, cualquier captura ajena cuenta.
  const versionPrecios =
    [...(historialCrudo ?? []), ...((preciosDia ?? []) as { created_at?: string }[])]
      .map((f) => f.created_at ?? "")
      .sort()
      .at(-1) || "-infinity";

  const grupoNombre = new Map((grupos ?? []).map((g) => [g.id, g.nombre]));
  const tamanoEtiqueta = new Map((tamanos ?? []).map((t) => [t.id, t.etiqueta]));
  const pelajeEtiqueta = new Map((pelajes ?? []).map((p) => [p.id, p.etiqueta]));

  const idsCreadores = Array.from(
    new Set((historialCrudo ?? []).map((f) => f.created_by).filter((v): v is string => Boolean(v)))
  );
  // Nombre de la ficha de empleado o de la cuenta (nombre_de_persona), nunca un guion.
  const sesion = await obtenerSesionConRol();
  const nombresCreadores = await nombresDePersonal(supabase, idsCreadores, { esAdmin: sesion?.rol === "admin", negocioId: await negocioIdActual() });

  const historial: FilaHistorial[] = (historialCrudo ?? []).map((f) => ({
    id: f.id,
    grupo_etiqueta: f.grupo_raza_id ? (grupoNombre.get(f.grupo_raza_id) ?? "—") : "—",
    tamano_etiqueta: f.tamano_id ? (tamanoEtiqueta.get(f.tamano_id) ?? "—") : "—",
    pelaje_etiqueta: f.pelaje_id ? (pelajeEtiqueta.get(f.pelaje_id) ?? "—") : "—",
    cantidad_desde: f.cantidad_desde,
    cantidad_hasta: f.cantidad_hasta,
    precio: f.precio,
    no_aplica: f.no_aplica,
    vigencia_desde: f.vigencia_desde,
    created_at: f.created_at,
    creado_por: f.created_by ? (nombresCreadores.get(f.created_by) ?? "Sin nombre") : "—",
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SiPuedeAbrir href={`/servicios/${id}`} sino={<Enlace href="/servicios" className="text-sm">← Servicios</Enlace>}>
          <Enlace href={`/servicios/${id}`} className="text-sm">
            ← {servicio.nombre}
          </Enlace>
        </SiPuedeAbrir>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Tarifas — {servicio.nombre}</h1>
        <p className="mt-1 text-n-600">
          Solo se guardan las celdas que cambien. Nunca se sobreescribe un precio anterior.
        </p>
      </div>

      {servicio.monto_libre && (
        <p className="rounded-md border-[1.5px] border-ambar bg-ambar-suave px-3 py-2 text-sm text-ambar-oscuro">
          Este cargo es de <strong>monto libre</strong>: no tiene precio fijo. El importe y qué se le
          dio se capturan al aplicarlo en la estancia. Lo que captures aquí no se usa.
        </p>
      )}

      {!servicio.monto_libre && (
        <ComoSeCobra unidad={servicio.unidad as string} dependeCantidad={servicio.depende_cantidad} vigentes={(vigentes ?? []) as Parameters<typeof ComoSeCobra>[0]["vigentes"]} enlaceCapturar="#capturar-tramos" />
      )}

      <div id="capturar-tramos" className="scroll-mt-20" />
      <MatrizTarifas
        servicioId={id}
        dependeGrupoRaza={servicio.depende_grupo_raza}
        dependeTamano={servicio.depende_tamano}
        dependePelaje={servicio.depende_pelaje}
        dependeCantidad={servicio.depende_cantidad}
        aceptaPeloMaltratado={servicio.acepta_pelo_maltratado}
        grupos={grupos ?? []}
        tamanos={tamanos ?? []}
        pelajes={pelajes ?? []}
        vigentes={vigentes ?? []}
        versionPrecios={versionPrecios}
        otrosServicios={((otros ?? []) as { id: string; nombre: string; categoria: string; monto_libre: boolean; depende_grupo_raza: boolean; depende_tamano: boolean; depende_pelaje: boolean }[])
          // Solo los que se pueden empatar: cada dimensión del otro servicio la tiene también este.
          .filter(
            (o) =>
              o.categoria === servicio.categoria &&
              !o.monto_libre &&
              (!o.depende_grupo_raza || servicio.depende_grupo_raza) &&
              (!o.depende_tamano || servicio.depende_tamano) &&
              (!o.depende_pelaje || servicio.depende_pelaje)
          )
          .map((o) => ({ id: o.id, nombre: o.nombre }))}
      />

      {!servicio.monto_libre && (
        <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
          <div>
            <h2 className="text-lg font-bold text-n-900">Precio distinto por día de la semana</h2>
            <p className="mt-1 text-n-600">
              Reemplaza el precio de arriba ese día, para todas las tallas. Por ejemplo: guardería día
              completo en sábado, que es medio día.
            </p>
          </div>
          <PreciosPorDia
            servicioId={id}
            precios={(preciosDia ?? []) as PrecioDia[]}
            versionPrecios={versionPrecios}
            hoy={(hoyData as string | null) ?? hoyNegocio(zona)}
          />
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Historial de precios</h2>
        <HistorialTarifas zona={zona} filas={historial} />
      </div>
    </div>
  );
}
