import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AlertaCriticaBanner } from "@/app/(staff)/perros/alerta-critica-banner";
import { ResumenSanitario, type EstadoRequisitoItem } from "@/app/(staff)/perros/resumen-sanitario";
import { ContratoEstadoBanner, type ContratoEstado } from "@/app/(staff)/perros/contrato-estado-banner";
import { formatearFechaCalendario, formatearFecha } from "@/lib/formato";
import { CheckinForm } from "./checkin-form";

export default async function CheckinEstanciaPage({
  params,
}: {
  params: Promise<{ estanciaId: string }>;
}) {
  const { estanciaId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: estancia, error } = await supabase
    .from("estancias")
    .select(
      "id, perro_id, fecha_entrada, fecha_salida, estado, entregado_por_nombre, entregado_por_telefono, estado_llegada, foto_llegada_path, hora_entrada_real, perros(nombre, cliente_id), servicios(nombre, categoria)"
    )
    .eq("id", estanciaId)
    .single();

  if (error || !estancia) notFound();

  const perro = Array.isArray(estancia.perros) ? estancia.perros[0] : estancia.perros;
  const servicio = Array.isArray(estancia.servicios) ? estancia.servicios[0] : estancia.servicios;

  if (!perro) notFound();

  const [
    { data: estadoSanitario },
    { data: alertasCrudo },
    { data: alergias },
    { data: pertenencias },
    { data: contratoEstado },
  ] = await Promise.all([
    supabase
      .from("perro_requisitos_sanitarios_estado")
      .select("tipo_requisito_id, clave, etiqueta, es_critica, ultima_fecha_aplicacion, fecha_vencimiento, estado")
      .eq("perro_id", estancia.perro_id),
    supabase
      .from("perro_alertas")
      .select("id, alerta_id, notas, catalogo_alertas(etiqueta)")
      .eq("perro_id", estancia.perro_id)
      .eq("activa", true),
    supabase
      .from("perro_alergias")
      .select("id, alergeno, gravedad")
      .eq("perro_id", estancia.perro_id)
      .is("deleted_at", null),
    supabase
      .from("estancia_pertenencias")
      .select("id, descripcion, devuelto")
      .eq("estancia_id", estanciaId)
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("perros_contrato_estado")
      .select("estado")
      .eq("perro_id", estancia.perro_id)
      .maybeSingle(),
  ]);

  const alertasActivas = (alertasCrudo ?? []).map((a) => {
    const catalogo = a.catalogo_alertas as unknown as { etiqueta: string } | null;
    return { id: a.id as string, etiqueta: catalogo?.etiqueta ?? "—" };
  });
  const alergiasGraves = (alergias ?? [])
    .filter((a) => a.gravedad === "grave")
    .map((a) => ({ id: a.id as string, alergeno: a.alergeno as string }));

  const yaHizoCheckin = estancia.estado !== "reservada" && estancia.estado !== "confirmada";
  const esGuarderia = servicio?.categoria === "guarderia";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/reservas/checkin" className="text-sm font-semibold text-azul hover:underline">
        ← Check-in
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-n-900">Check-in — {perro.nombre}</h1>
        <p className="mt-1 text-n-600">
          {servicio?.nombre} · {esGuarderia ? formatearFechaCalendario(estancia.fecha_entrada) : `${formatearFechaCalendario(estancia.fecha_entrada)} — ${formatearFechaCalendario(estancia.fecha_salida)}`}
        </p>
      </div>

      <AlertaCriticaBanner alertas={alertasActivas} alergiasGraves={alergiasGraves} tamano="grande" />
      <ResumenSanitario items={(estadoSanitario as EstadoRequisitoItem[]) ?? []} tamano="grande" />
      <ContratoEstadoBanner estado={(contratoEstado?.estado as ContratoEstado) ?? "sin_contrato"} />

      {yaHizoCheckin ? (
        <div className="rounded-lg border border-n-200 bg-n-50 p-4">
          <p className="font-semibold text-n-900">
            Este perro ya hizo check-in
            {estancia.hora_entrada_real ? ` el ${formatearFecha(estancia.hora_entrada_real)}` : ""}.
          </p>
          <p className="mt-1 text-sm text-n-600">
            Entregó: {estancia.entregado_por_nombre ?? "—"}
            {estancia.estado_llegada ? ` · Estado a la llegada: ${estancia.estado_llegada}` : ""}
          </p>
        </div>
      ) : (
        <CheckinForm
          estanciaId={estanciaId}
          perroId={estancia.perro_id}
          clienteId={perro.cliente_id}
          pertenenciasIniciales={pertenencias ?? []}
        />
      )}
    </div>
  );
}
