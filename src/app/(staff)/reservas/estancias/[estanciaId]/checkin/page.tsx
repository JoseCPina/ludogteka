import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AlertaCriticaBanner } from "@/app/(staff)/perros/alerta-critica-banner";
import { ResumenSanitario, type EstadoRequisitoItem } from "@/app/(staff)/perros/resumen-sanitario";
import {
  ContratoEstadoBanner,
  resumenVacio,
  type ContratoResumen,
} from "@/app/(staff)/perros/contrato-estado-banner";
import { formatearFechaCalendario, formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { moduloDeCategoria } from "@/lib/modulos";
import { CheckinForm } from "./checkin-form";
import { PaseCheckin, type EstadoPaseCheckin } from "./pase-checkin";
import { describirBono } from "@/lib/bonos/descripcion";
import { zonaActual } from "@/lib/negocio/actual";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { SeccionServiciosExtra } from "@/components/extras/seccion-servicios-extra";
import { cuentasPorEstancia } from "@/lib/cuentas/cuenta-estancia";

export default async function CheckinEstanciaPage({
  params,
}: {
  params: Promise<{ estanciaId: string }>;
}) {
  const zona = await zonaActual();
  const sesion = await obtenerSesionConRol();
  const { estanciaId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: estancia, error } = await supabase
    .from("estancias")
    .select(
      "id, reserva_id, perro_id, servicio_id, fecha_entrada, fecha_salida, estado, precio_unitario, entregado_por_nombre, entregado_por_telefono, estado_llegada, foto_llegada_path, hora_entrada_real, pertenencias, perros(nombre, cliente_id, contacto_emergencia_nombre, contacto_emergencia_telefono, clientes(nombre, telefono)), servicios(nombre, categoria, unidad)"
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
      .from("perros_contrato_resumen")
      .select("estado, faltantes, desactualizados")
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

  // ¿Viene con pase o paga el día? Solo para guardería de día completo:
  // lo que ya cubrió un bono (movimientos_bono) y, si no hay nada, si ESTE
  // perro tiene alguno vigente que incluya este servicio (el paquete es
  // del perro, no del dueño: el de su hermano no le sirve).
  let estadoPase: EstadoPaseCheckin = { tipo: "no_aplica" };
  if (esGuarderia && servicio?.unidad === "dia") {
    const dias = Math.max(
      1,
      Math.round((new Date(estancia.fecha_salida).getTime() - new Date(estancia.fecha_entrada).getTime()) / 86400000)
    );
    const { data: consumos } = await supabase
      .from("movimientos_bono")
      .select("bono_cliente_id, cantidad, tipo")
      .in("tipo", ["consumo", "devolucion"])
      .eq("item_tipo", "estancia")
      .eq("item_id", estanciaId);
    // Neto: consumos menos devoluciones.
    const cubierto = (consumos ?? []).reduce(
      (s, m) => s + (m.tipo === "devolucion" ? -1 : 1) * (m.cantidad as number),
      0
    );
    const columnasBono =
      "id, servicio_nombre, servicio_incluido_id, cantidad_total, cantidad_disponible, fecha_vencimiento, estado, ilimitado";
    if (cubierto >= dias && consumos && consumos.length > 0) {
      const { data: bono } = await supabase
        .from("bonos_clientes_estado")
        .select(columnasBono)
        .eq("id", consumos[0].bono_cliente_id as string)
        .maybeSingle();
      estadoPase = {
        tipo: "cubierto",
        descripcion: bono ? `${bono.servicio_nombre}: ${describirBono(bono)}` : "Cubierto con bono",
        bono: bono ?? undefined,
      };
    } else {
      // QA R50 (N136): lo que paga el día suelto es la línea de esta estancia en la cuenta de la base.
      const precioDia = (await cuentasPorEstancia(supabase, estancia.reserva_id as string)).cuentas.get(estanciaId)?.base?.total ?? 0;
      const { data: disponibles } = await supabase
        .from("bonos_clientes_estado")
        .select(columnasBono)
        .eq("perro_id", estancia.perro_id)
        .eq("estado", "activo")
        .eq("servicio_incluido_id", estancia.servicio_id)
        // Vigente el día de la estancia, no solo hoy: misma regla que
        // aplicar_bono_a_estancia.
        .or(`fecha_vencimiento.is.null,fecha_vencimiento.gte.${estancia.fecha_entrada}`)
        .gte("cantidad_disponible", dias - cubierto)
        .order("fecha_vencimiento", { ascending: true, nullsFirst: false })
        .limit(1);
      const bono = disponibles?.[0];
      estadoPase = bono
        ? {
            tipo: "disponible",
            descripcion: `${bono.servicio_nombre}: ${describirBono(bono)}`,
            precioDia,
            bono,
          }
        : { tipo: "paga", precioDia };
    }
  }
  // Esta pantalla es de una estancia concreta y se llega a ella desde
  // cualquiera de los dos modulos: a cual regresar lo dice la categoria
  // del propio servicio, no un parametro en la URL que se pierde al
  // recargar o al llegar por un enlace pegado.
  const modulo = moduloDeCategoria(servicio?.categoria);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={modulo ? `${modulo.base}/checkin` : "/reservas"}
        className="text-sm font-semibold text-morado hover:underline"
      >
        ← Check-in{modulo ? ` de ${modulo.etiqueta.toLowerCase()}` : ""}
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-n-900">Check-in — {perro.nombre}</h1>
        <p className="mt-1 text-n-600">
          {servicio?.nombre} · {esGuarderia ? formatearFechaCalendario(estancia.fecha_entrada) : `${formatearFechaCalendario(estancia.fecha_entrada)} — ${formatearFechaCalendario(estancia.fecha_salida)}`}
        </p>
      </div>

      <PaseCheckin
        estanciaId={estanciaId}
        estado={estadoPase}
        perroNombre={perro.nombre}
        enCurso={estancia.estado === "en_curso"}
        puedeAjustar={tienePermiso(sesion, "ajustar_pases")}
        esAdmin={sesion?.rol === "admin"}
      />

      <AlertaCriticaBanner alertas={alertasActivas} alergiasGraves={alergiasGraves} tamano="grande" />
      <ResumenSanitario items={(estadoSanitario as EstadoRequisitoItem[]) ?? []} tamano="grande" />
      <ContratoEstadoBanner
        resumen={
          contratoEstado
            ? {
                estado: contratoEstado.estado as ContratoResumen["estado"],
                faltantes: contratoEstado.faltantes ?? [],
                desactualizados: contratoEstado.desactualizados ?? [],
              }
            : resumenVacio()
        }
      />

      {yaHizoCheckin ? (
        <div className="rounded-lg border border-n-200 bg-n-50 p-4">
          <p className="font-semibold text-n-900" role="status">
            Check-in registrado
            {estancia.hora_entrada_real ? ` a las ${horaLocalDeInstante(estancia.hora_entrada_real, zona)}` : ""}
          </p>
          <p className="mt-1 text-sm text-n-700">
            Este perro ya hizo check-in
            {estancia.hora_entrada_real ? ` el ${formatearFecha(estancia.hora_entrada_real, zona)}` : ""}.
          </p>
          <p className="mt-1 text-sm text-n-600">
            Entregó: {estancia.entregado_por_nombre ?? "—"}
            {estancia.estado_llegada ? ` · Estado a la llegada: ${estancia.estado_llegada}` : ""}
          </p>
          <p className="mt-1 text-sm text-n-600" data-pertenencias-recibidas>
            Pertenencias recibidas:{" "}
            {(pertenencias ?? []).length > 0 || estancia.pertenencias?.trim()
              ? [...(estancia.pertenencias?.trim() ? [estancia.pertenencias.trim()] : []), ...(pertenencias ?? []).map((p) => p.descripcion)].join(", ")
              : "ninguna"}
            .
          </p>
        </div>
      ) : (
        <CheckinForm
          estanciaId={estanciaId}
          perroId={estancia.perro_id}
          clienteId={perro.cliente_id}
          pertenenciasIniciales={pertenencias ?? []}
          declaradas={estancia.pertenencias?.trim() || null}
          conocidos={conocidosDeEntrega(perro)}
        />
      )}

      {servicio?.categoria !== "estetica" && (
        <div className="border-t border-n-200 pt-4">
          <SeccionServiciosExtra estanciaId={estanciaId} />
        </div>
      )}
    </div>
  );
}

// QA S15: «Quién entrega al perro» se escoge de una lista (el dueño y su contacto de emergencia) o se marca
// «Otra persona» con su nombre: así se ve claro cuando no es alguien conocido.
type PerroConDueno = {
  contacto_emergencia_nombre?: string | null;
  contacto_emergencia_telefono?: string | null;
  clientes?: { nombre: string | null; telefono: string | null } | { nombre: string | null; telefono: string | null }[] | null;
};
function conocidosDeEntrega(perro: PerroConDueno): { etiqueta: string; nombre: string; telefono: string }[] {
  const dueno = Array.isArray(perro.clientes) ? perro.clientes[0] : perro.clientes;
  const lista: { etiqueta: string; nombre: string; telefono: string }[] = [];
  if (dueno?.nombre?.trim()) lista.push({ etiqueta: "Dueño", nombre: dueno.nombre.trim(), telefono: dueno.telefono ?? "" });
  const emergencia = perro.contacto_emergencia_nombre?.trim();
  if (emergencia && !lista.some((c) => c.nombre.toLowerCase() === emergencia.toLowerCase())) {
    lista.push({ etiqueta: "Contacto de emergencia", nombre: emergencia, telefono: perro.contacto_emergencia_telefono ?? "" });
  }
  return lista;
}
