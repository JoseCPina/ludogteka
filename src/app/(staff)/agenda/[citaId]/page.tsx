import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { AlertaCriticaBanner } from "@/app/(staff)/perros/alerta-critica-banner";
import { ResumenSanitario, type EstadoRequisitoItem } from "@/app/(staff)/perros/resumen-sanitario";
import { formatearFechaCalendario, horaLocalDeInstante } from "@/lib/formato";
import { CitaDetalle, type RecetaItem } from "./cita-detalle";

export default async function CitaDetallePage({
  params,
}: {
  params: Promise<{ citaId: string }>;
}) {
  const { citaId } = await params;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const { data: cita, error } = await supabase
    .from("citas_estetica")
    .select(
      "id, perro_id, servicio_id, tamano_id, empleado_id, estancia_id, inicio, fin, estado, precio, fuera_de_horario, entregado_por_nombre, recogido_por_nombre, recogido_por_es_dueno, perros(nombre), servicios(nombre)"
    )
    .eq("id", citaId)
    .single();

  if (error || !cita) notFound();

  const perro = Array.isArray(cita.perros) ? cita.perros[0] : cita.perros;
  const servicio = Array.isArray(cita.servicios) ? cita.servicios[0] : cita.servicios;

  if (!perro) notFound();

  const [{ data: estadoSanitario }, { data: alertasCrudo }, { data: alergias }, { data: empleado }] =
    await Promise.all([
      supabase
        .from("perro_requisitos_sanitarios_estado")
        .select("tipo_requisito_id, clave, etiqueta, es_critica, ultima_fecha_aplicacion, fecha_vencimiento, estado")
        .eq("perro_id", cita.perro_id),
      supabase
        .from("perro_alertas")
        .select("id, alerta_id, notas, catalogo_alertas(etiqueta)")
        .eq("perro_id", cita.perro_id)
        .eq("activa", true),
      supabase.from("perro_alergias").select("id, alergeno, gravedad").eq("perro_id", cita.perro_id).is("deleted_at", null),
      supabase.from("profiles").select("nombre_completo").eq("id", cita.empleado_id).single(),
    ]);

  let recetaItems: RecetaItem[] = [];
  if (cita.tamano_id) {
    const { data: recetaCrudo } = await supabase
      .from("recetas_consumo")
      .select("insumo_id, cantidad_consumo, insumos(nombre, unidades_medida!unidad_consumo_id(etiqueta))")
      .eq("servicio_id", cita.servicio_id)
      .eq("tamano_id", cita.tamano_id)
      .is("deleted_at", null);

    recetaItems = (recetaCrudo ?? []).map((r) => {
      const insumo = r.insumos as unknown as { nombre: string; unidades_medida: { etiqueta: string } | null } | null;
      return {
        insumo_id: r.insumo_id,
        insumo_nombre: insumo?.nombre ?? "—",
        unidad_etiqueta: insumo?.unidades_medida?.etiqueta ?? "",
        cantidad_sugerida: Number(r.cantidad_consumo),
      };
    });
  }

  const alertasActivas = (alertasCrudo ?? []).map((a) => {
    const catalogo = a.catalogo_alertas as unknown as { etiqueta: string } | null;
    return { id: a.id as string, etiqueta: catalogo?.etiqueta ?? "—" };
  });
  const alergiasGraves = (alergias ?? [])
    .filter((a) => a.gravedad === "grave")
    .map((a) => ({ id: a.id as string, alergeno: a.alergeno as string }));

  const puedeEditar =
    sesion?.rol === "admin" || sesion?.rol === "recepcion" || sesion?.user.id === cita.empleado_id;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/agenda" className="text-sm font-semibold text-azul hover:underline">
        ← Agenda
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-n-900">
          {servicio?.nombre} — {perro.nombre}
        </h1>
        <p className="mt-1 text-n-600">
          {formatearFechaCalendario(cita.inicio)} · {horaLocalDeInstante(cita.inicio)}
          {cita.fin ? ` – ${horaLocalDeInstante(cita.fin)}` : ""} · {empleado?.nombre_completo ?? "—"}
        </p>
        {cita.fuera_de_horario && (
          <p className="mt-1 inline-block rounded-full bg-amarillo-suave px-2.5 py-1 text-xs font-bold text-amarillo-oscuro">
            Fuera de horario
          </p>
        )}
      </div>

      <AlertaCriticaBanner alertas={alertasActivas} alergiasGraves={alergiasGraves} tamano="grande" />
      <ResumenSanitario items={(estadoSanitario as EstadoRequisitoItem[]) ?? []} tamano="grande" />

      {cita.estancia_id && (
        <p className="rounded-md border border-n-200 bg-n-50 px-3 py-2 text-sm text-n-700">
          Ligada a una estancia en curso — el perro ya está adentro, esta cita no genera entrada ni
          salida propia.
        </p>
      )}

      {!puedeEditar ? (
        <p className="text-sm text-n-500">Esta cita es de otro empleado — solo se puede consultar.</p>
      ) : (
        <CitaDetalle
          citaId={cita.id}
          perroNombre={perro.nombre}
          estado={cita.estado}
          inicio={cita.inicio}
          precio={cita.precio}
          esStandalone={!cita.estancia_id}
          entregadoPorNombre={cita.entregado_por_nombre}
          recogidoPorNombre={cita.recogido_por_nombre}
          recogidoPorEsDueno={cita.recogido_por_es_dueno}
          recetaItems={recetaItems}
        />
      )}
    </div>
  );
}
