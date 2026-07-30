import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import {
  CuentaCobro,
  type LineaCuenta,
  type CobroHistorial,
  type DevolucionHistorial,
  type DescuentoHistorial,
  type MotivoDescuento,
} from "./cuenta-cobro";

export default async function CobrarReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const { data: reserva, error: errorReserva } = await supabase
    .from("reservas")
    .select("id, notas, cliente_id, clientes(nombre, telefono)")
    .eq("id", id)
    .single();

  if (errorReserva || !reserva) notFound();
  const cliente = Array.isArray(reserva.clientes) ? reserva.clientes[0] : reserva.clientes;

  const [
    { data: lineasCrudo, error: errorLineas },
    { data: totalesCrudo, error: errorTotales },
    { data: turnoAbierto },
    { data: cobrosCrudo, error: errorCobros },
    { data: bonosCrudo },
    { data: catalogoDescuentosCrudo },
    { data: descuentosCrudo, error: errorDescuentos },
    { data: topeCrudo },
  ] = await Promise.all([
    supabase.rpc("cuenta_lineas_reserva", { p_reserva_id: id }),
    supabase.rpc("cuenta_totales_reserva", { p_reserva_id: id }),
    supabase.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle(),
    supabase
      .from("cobros")
      .select("id, notas, created_at, created_by, cobro_metodos(metodo, monto, propina)")
      .eq("reserva_id", id)
      .order("created_at"),
    supabase
      .from("bonos_clientes_estado")
      .select("id, servicio_incluido_id, servicio_nombre, cantidad_disponible, estado")
      .eq("cliente_id", reserva.cliente_id)
      .eq("estado", "activo"),
    supabase.from("catalogo_descuentos").select("id, etiqueta").is("deleted_at", null).order("orden"),
    supabase
      .from("descuentos_aplicados")
      .select(
        "id, tipo, valor, monto_aplicado, motivo_adicional, autorizado_por, cancelado, motivo_cancelacion, created_at, created_by, catalogo_descuentos(etiqueta)"
      )
      .eq("reserva_id", id)
      .order("created_at"),
    supabase.rpc("resolver_tope_descuento_recepcion"),
  ]);

  const cobroIds = (cobrosCrudo ?? []).map((c) => c.id as string);
  const { data: devolucionesCrudo, error: errorDevoluciones } = cobroIds.length
    ? await supabase
        .from("devoluciones")
        .select("id, motivo, created_at, autorizado_por, cobro_id, devolucion_metodos(metodo, monto)")
        .in("cobro_id", cobroIds)
        .order("created_at")
    : { data: [] as never[], error: null };

  const error = errorLineas ?? errorTotales ?? errorCobros ?? errorDevoluciones ?? errorDescuentos;

  type LineaCruda = {
    tipo: string;
    origen_id: string;
    servicio_id: string;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    total: number;
  };
  const lineasCrudas = (lineasCrudo as LineaCruda[] | null) ?? [];
  const idsLineasBono = lineasCrudas.filter((l) => l.tipo !== "bono").map((l) => l.origen_id);
  const { data: movimientosCrudo } = idsLineasBono.length
    ? await supabase
        .from("movimientos_bono")
        .select("item_id, cantidad")
        .eq("tipo", "consumo")
        .in("item_id", idsLineasBono)
    : { data: [] as { item_id: string; cantidad: number }[] };

  const cubiertoPorItem = new Map<string, number>();
  for (const m of movimientosCrudo ?? []) {
    cubiertoPorItem.set(m.item_id as string, (cubiertoPorItem.get(m.item_id as string) ?? 0) + (m.cantidad as number));
  }

  const lineas: LineaCuenta[] = lineasCrudas.map((l) => ({
    tipo: l.tipo as string,
    origenId: l.origen_id as string,
    servicioId: l.servicio_id as string,
    descripcion: l.descripcion as string,
    cantidad: Number(l.cantidad),
    precioUnitario: Number(l.precio_unitario),
    total: Number(l.total),
    cantidadCubiertaPorBono: cubiertoPorItem.get(l.origen_id) ?? 0,
  }));

  const totalesFila = Array.isArray(totalesCrudo) ? totalesCrudo[0] : totalesCrudo;
  const totales = {
    totalCuenta: Number(totalesFila?.total_cuenta ?? 0),
    totalCobrado: Number(totalesFila?.total_cobrado ?? 0),
    totalPropinas: Number(totalesFila?.total_propinas ?? 0),
    totalDevuelto: Number(totalesFila?.total_devuelto ?? 0),
    totalBono: Number(totalesFila?.total_bono ?? 0),
    totalDescuento: Number(totalesFila?.total_descuento ?? 0),
    saldo: Number(totalesFila?.saldo ?? 0),
  };

  const bonosDisponibles = (bonosCrudo ?? []).map((b) => ({
    id: b.id as string,
    servicioIncluidoId: b.servicio_incluido_id as string | null,
    servicioNombre: b.servicio_nombre as string,
    cantidadDisponible: b.cantidad_disponible as number,
  }));

  const catalogoDescuentos: MotivoDescuento[] = (catalogoDescuentosCrudo ?? []).map((c) => ({
    id: c.id as string,
    etiqueta: c.etiqueta as string,
  }));

  const topeFila = Array.isArray(topeCrudo) ? topeCrudo[0] : topeCrudo;
  const topeRecepcion = topeFila?.estado === "configurado" ? Number(topeFila.tope_recepcion) : 0;

  const idsCreadores = Array.from(
    new Set([
      ...(cobrosCrudo ?? []).map((c) => c.created_by as string | null),
      ...(devolucionesCrudo ?? []).map((d) => d.autorizado_por as string | null),
      ...(descuentosCrudo ?? []).map((d) => d.created_by as string | null),
    ]).values()
  ).filter((x): x is string => Boolean(x));

  const { data: perfiles } = idsCreadores.length
    ? await supabase.from("profiles").select("id, nombre_completo").in("id", idsCreadores)
    : { data: [] as { id: string; nombre_completo: string | null }[] };
  const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo ?? "—"]));

  const cobros: CobroHistorial[] = (cobrosCrudo ?? []).map((c) => ({
    id: c.id as string,
    notas: c.notas as string | null,
    creadoEn: c.created_at as string,
    creadoPorNombre: nombrePorId.get(c.created_by as string) ?? "—",
    metodos: (c.cobro_metodos as { metodo: string; monto: number; propina: number }[]) ?? [],
  }));

  const devoluciones: DevolucionHistorial[] = (devolucionesCrudo ?? []).map((d) => ({
    id: d.id as string,
    cobroId: d.cobro_id as string,
    motivo: d.motivo as string,
    creadoEn: d.created_at as string,
    autorizadoPorNombre: nombrePorId.get(d.autorizado_por as string) ?? "—",
    metodos: (d.devolucion_metodos as { metodo: string; monto: number }[]) ?? [],
  }));

  const descuentos: DescuentoHistorial[] = (descuentosCrudo ?? []).map((d) => {
    const catalogo = Array.isArray(d.catalogo_descuentos) ? d.catalogo_descuentos[0] : d.catalogo_descuentos;
    return {
      id: d.id as string,
      etiqueta: (catalogo as { etiqueta: string } | null)?.etiqueta ?? "—",
      tipo: d.tipo as string,
      valor: Number(d.valor),
      montoAplicado: Number(d.monto_aplicado),
      motivoAdicional: d.motivo_adicional as string | null,
      autorizadoPorNombre: d.autorizado_por ? nombrePorId.get(d.autorizado_por as string) ?? "—" : null,
      cancelado: d.cancelado as boolean,
      motivoCancelacion: d.motivo_cancelacion as string | null,
      creadoEn: d.created_at as string,
      creadoPorNombre: nombrePorId.get(d.created_by as string) ?? "—",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/reservas/${id}`} className="text-sm font-semibold text-azul hover:underline">
          ← Detalle de la reserva
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Cobrar — {cliente?.nombre ?? "Cliente"}</h1>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la cuenta">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <CuentaCobro
          reservaId={id}
          lineas={lineas}
          totales={totales}
          turnoAbierto={Boolean(turnoAbierto)}
          cobros={cobros}
          devoluciones={devoluciones}
          bonosDisponibles={bonosDisponibles}
          catalogoDescuentos={catalogoDescuentos}
          descuentos={descuentos}
          topeRecepcion={topeRecepcion}
          esAdmin={sesion?.rol === "admin"}
        />
      )}
    </div>
  );
}
