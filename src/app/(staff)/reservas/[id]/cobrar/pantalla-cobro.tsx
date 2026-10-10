import { tienePermiso } from "@/lib/auth/permisos";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { SeccionFacturar } from "@/components/cfdi/seccion-facturar";
import { estadoCobroIntegrado } from "@/app/(staff)/caja/cobro-integrado-actions";
import type { OrdenCobroFila } from "./cobro-integrado";
import {
  CuentaCobro,
  type LineaCuenta,
  type CobroHistorial,
  type DevolucionHistorial,
  type DescuentoHistorial,
  type GrupoHistorial,
  type MotivoDescuento,
} from "./cuenta-cobro";

// La pantalla de cobro de una cuenta, vista desde la reserva
// (/reservas/[id]/cobrar) o desde Caja (/caja/cobrar/[reservaId]): es el
// MISMO cobro, solo cambia a dónde se regresa.
export async function PantallaCobro({
  reservaId: id,
  volverHref,
  volverEtiqueta,
}: {
  reservaId: string;
  volverHref: string;
  volverEtiqueta: string;
}) {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const { data: reserva, error: errorReserva } = await supabase
    .from("reservas")
    .select("id, notas, cliente_id, clientes(nombre, telefono, publico_general)")
    .eq("id", id)
    .single();

  if (errorReserva || !reserva) {
    return (
      <Alert variante="error" titulo="No encontramos esta cuenta">
        Puede que se haya dado de baja. Regresa y vuelve a buscarla.
      </Alert>
    );
  }
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
      .select("id, notas, created_at, created_by, origen, grupo_id, turno_id, anulado_at, anulacion_motivo, cobro_metodos(metodo, monto, propina, ajuste_id)")
      .eq("reserva_id", id)
      .order("created_at"),
    supabase
      .from("bonos_clientes_estado")
      .select("id, servicio_incluido_id, servicio_nombre, cantidad_disponible, estado, ilimitado, perro_id, perro_nombre")
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

  const [{ data: ordenesMpCrudo }, mpDisponible, { data: terminalManualBloqueada }] = await Promise.all([
    supabase
      .from("mp_ordenes_estado")
      .select("id, tipo, monto, descripcion, estado, url_pago, installments, simulado, pendiente_de_registrar, detalle_error, created_at, expira_at, cobro_id, proveedor, monto_reembolsado, grupo_cuentas")
      // Las órdenes de esta cuenta y las de un cobro junto en el que va incluida.
      .or(`reserva_id.eq.${id},grupo_cuentas.cs.${JSON.stringify([{ reserva_id: id }])}`)
      .order("created_at", { ascending: false })
      .limit(20),
    estadoCobroIntegrado(),
    // Con un proveedor de terminal elegido, «Terminal» no se captura a mano.
    supabase.rpc("terminal_manual_bloqueada"),
  ]);
  const ordenesMp: OrdenCobroFila[] = (ordenesMpCrudo ?? []).map((o) => ({
    id: o.id as string,
    tipo: o.tipo as "point" | "link",
    monto: Number(o.monto),
    descripcion: (o.descripcion as string | null) ?? null,
    estado: o.estado as string,
    url_pago: (o.url_pago as string | null) ?? null,
    installments: (o.installments as number | null) ?? null,
    simulado: Boolean(o.simulado),
    pendiente_de_registrar: Boolean(o.pendiente_de_registrar),
    detalle_error: (o.detalle_error as string | null) ?? null,
    created_at: o.created_at as string,
    expira_at: (o.expira_at as string | null) ?? null,
    cobro_id: (o.cobro_id as string | null) ?? null,
    proveedor: (o.proveedor as "mercadopago" | "clip") ?? "mercadopago",
    monto_reembolsado: Number(o.monto_reembolsado ?? 0),
    grupo_cuentas: (o.grupo_cuentas as { reserva_id: string; monto: number }[] | null) ?? null,
  }));

  const cobroIds = (cobrosCrudo ?? []).map((c) => c.id as string);
  // Los renglones de «Tarjeta (registro manual)» de estos cobros (folio, estado de revisión).
  // Un cobro junto: UN registro de tarjeta (un folio) para todas sus cuentas, y
  // el detalle del pago con las otras cuentas que se cobraron en el mismo movimiento.
  const grupoIds = Array.from(new Set((cobrosCrudo ?? []).map((c) => c.grupo_id as string | null).filter((g): g is string => Boolean(g))));
  const { data: tarjetasCrudo } = cobroIds.length
    ? await supabase
        .from("tarjetas_manuales")
        .select("id, cobro_id, grupo_id, folio, estado, monto, motivo, motivo_texto, ultimos4, banco, sobre_tope")
        .or([`cobro_id.in.(${cobroIds.join(",")})`, ...(grupoIds.length ? [`grupo_id.in.(${grupoIds.join(",")})`] : [])].join(","))
        .is("deleted_at", null)
        .order("created_at")
    : { data: [] as never[] };
  const detallesGrupo = new Map<string, GrupoHistorial>();
  for (const gid of grupoIds) {
    const { data: det } = await supabase.rpc("cobro_grupo_detalle", { p_grupo_id: gid });
    const d = (Array.isArray(det) ? det[0] : det) as {
      recibo: string;
      total: number;
      propina: number;
      cuentas: { reserva_id: string; monto: number; descripcion: string; anulado?: boolean }[];
    } | null;
    if (d) {
      detallesGrupo.set(gid, {
        id: gid,
        recibo: d.recibo,
        total: Number(d.total),
        propina: Number(d.propina),
        cuentas: d.cuentas.map((c) => ({ reservaId: c.reserva_id, descripcion: c.descripcion, monto: Number(c.monto), anulado: Boolean(c.anulado) })),
      });
    }
  }
  // Historial de correcciones (anulaciones y montos corregidos) y si el turno de
  // cada cobro ya se cerró (corregirlo pide un permiso más).
  const { data: correccionesCrudo } = cobroIds.length
    ? await supabase
        .from("cobro_correcciones")
        .select("cobro_id, tipo, motivo, created_at, hecha_por, estado_anterior, evidencia")
        .in("cobro_id", cobroIds)
        .in("tipo", ["anulacion", "edicion_monto"])
        .order("created_at")
    : { data: [] as never[] };
  const turnoIds = Array.from(new Set((cobrosCrudo ?? []).map((c) => c.turno_id as string))).filter(Boolean);
  const { data: turnosEstado } = turnoIds.length
    ? await supabase.from("turnos_caja").select("id, estado").in("id", turnoIds)
    : { data: [] as { id: string; estado: string }[] };
  const turnoCerradoDe = new Map((turnosEstado ?? []).map((t) => [t.id as string, (t.estado as string) !== "abierto"]));
  const { data: devolucionesCrudo, error: errorDevoluciones } = cobroIds.length
    ? await supabase
        .from("devoluciones")
        .select("id, motivo, created_at, autorizado_por, cobro_id, origen, devolucion_metodos(metodo, monto)")
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
        .select("item_id, cantidad, tipo")
        .in("tipo", ["consumo", "devolucion"])
        .in("item_id", idsLineasBono)
    : { data: [] as { item_id: string; cantidad: number; tipo: string }[] };

  // De qué perro es cada línea: el paquete es por perro y solo cubre las
  // líneas de su perro (una reserva puede traer a dos perros del mismo
  // dueño). Un cargo suelto sin estancia no tiene perro.
  const idsPorTipo = (t: string) => lineasCrudas.filter((l) => l.tipo === t).map((l) => l.origen_id);
  const [{ data: perrosEstancias }, { data: perrosCitas }, { data: perrosCargos }] = await Promise.all([
    idsPorTipo("estancia").length
      ? supabase.from("estancias").select("id, perro_id").in("id", idsPorTipo("estancia"))
      : Promise.resolve({ data: [] as { id: string; perro_id: string }[] }),
    idsPorTipo("estetica").length
      ? supabase.from("citas_estetica").select("id, perro_id").in("id", idsPorTipo("estetica"))
      : Promise.resolve({ data: [] as { id: string; perro_id: string }[] }),
    idsPorTipo("cargo").length
      ? supabase.from("cargos_aplicados").select("id, estancias(perro_id)").in("id", idsPorTipo("cargo"))
      : Promise.resolve({ data: [] as { id: string; estancias: unknown }[] }),
  ]);
  const perroPorItem = new Map<string, string>();
  for (const e of perrosEstancias ?? []) perroPorItem.set(e.id as string, e.perro_id as string);
  for (const c of perrosCitas ?? []) perroPorItem.set(c.id as string, c.perro_id as string);
  for (const c of perrosCargos ?? []) {
    const est = (Array.isArray(c.estancias) ? c.estancias[0] : c.estancias) as { perro_id: string } | null;
    if (est?.perro_id) perroPorItem.set(c.id as string, est.perro_id);
  }

  // Cobertura neta: consumos menos devoluciones (un pase devuelto al
  // cancelar ya no cubre nada).
  const cubiertoPorItem = new Map<string, number>();
  for (const m of movimientosCrudo ?? []) {
    const signo = m.tipo === "devolucion" ? -1 : 1;
    cubiertoPorItem.set(
      m.item_id as string,
      (cubiertoPorItem.get(m.item_id as string) ?? 0) + signo * (m.cantidad as number)
    );
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
    perroId: perroPorItem.get(l.origen_id) ?? null,
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
    ilimitado: Boolean(b.ilimitado),
    perroId: (b.perro_id as string | null) ?? null,
    perroNombre: (b.perro_nombre as string | null) ?? null,
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
      ...(correccionesCrudo ?? []).map((x) => x.hecha_por as string | null),
      ...(devolucionesCrudo ?? []).map((d) => d.autorizado_por as string | null),
      ...(descuentosCrudo ?? []).map((d) => d.created_by as string | null),
    ]).values()
  ).filter((x): x is string => Boolean(x));

  const { data: perfiles } = idsCreadores.length
    ? await supabase.from("profiles").select("id, nombre_completo").in("id", idsCreadores)
    : { data: [] as { id: string; nombre_completo: string | null }[] };
  const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo ?? "—"]));

  // Lo cobrado por método es NETO de correcciones (los renglones compensatorios
  // restan); el monto original es lo que se capturó.
  const netoPorMetodo = (filas: { metodo: string; monto: number; propina: number }[]) => {
    const m = new Map<string, { metodo: string; monto: number; propina: number }>();
    for (const f of filas) {
      const x = m.get(f.metodo) ?? { metodo: f.metodo, monto: 0, propina: 0 };
      x.monto = Math.round((x.monto + Number(f.monto)) * 100) / 100;
      x.propina = Math.round((x.propina + Number(f.propina)) * 100) / 100;
      m.set(f.metodo, x);
    }
    return Array.from(m.values()).filter((x) => x.monto !== 0 || x.propina !== 0);
  };
  const cobros: CobroHistorial[] = (cobrosCrudo ?? []).map((c) => ({
    id: c.id as string,
    notas: c.notas as string | null,
    creadoEn: c.created_at as string,
    creadoPorNombre: nombrePorId.get(c.created_by as string) ?? "—",
    metodos: netoPorMetodo((c.cobro_metodos as { metodo: string; monto: number; propina: number }[]) ?? []),
    anulado: Boolean(c.anulado_at),
    anulacionMotivo: (c.anulacion_motivo as string | null) ?? null,
    montoOriginal: ((c.cobro_metodos as { monto: number; ajuste_id: string | null }[]) ?? []).filter((m) => !m.ajuste_id).reduce((s, m) => s + Number(m.monto), 0),
    turnoCerrado: turnoCerradoDe.get(c.turno_id as string) ?? false,
    correcciones: (correccionesCrudo ?? [])
      .filter((x) => x.cobro_id === c.id)
      .map((x) => {
        const antes = x.estado_anterior as { metodo?: string; monto?: number; metodos?: { monto: number }[] } | null;
        const ev = x.evidencia as { monto_nuevo?: number; monto?: number } | null;
        const detalle =
          x.tipo === "edicion_monto"
            ? `de $${Number(antes?.monto ?? 0).toFixed(2)} a $${Number(ev?.monto_nuevo ?? 0).toFixed(2)}`
            : `cobro de $${Number(ev?.monto ?? 0).toFixed(2)}`;
        return { tipo: x.tipo as string, motivo: x.motivo as string, creadoEn: x.created_at as string, porNombre: nombrePorId.get(x.hecha_por as string) ?? "—", detalle };
      }),
    origen: ((c.origen as string | null) ?? "manual") as CobroHistorial["origen"],
    grupo: c.grupo_id ? detallesGrupo.get(c.grupo_id as string) ?? null : null,
    tarjetasManuales: (tarjetasCrudo ?? [])
      .filter((t) => t.cobro_id === c.id || (t.grupo_id && t.grupo_id === c.grupo_id))
      .map((t) => ({
        id: t.id as string,
        folio: t.folio as string,
        estado: t.estado as CobroHistorial["tarjetasManuales"][number]["estado"],
        monto: Number(t.monto),
        motivo: t.motivo as string,
        motivoTexto: (t.motivo_texto as string | null) ?? null,
        ultimos4: (t.ultimos4 as string | null) ?? null,
        banco: (t.banco as string | null) ?? null,
        sobreTope: Boolean(t.sobre_tope),
      })),
  }));

  const devoluciones: DevolucionHistorial[] = (devolucionesCrudo ?? []).map((d) => ({
    id: d.id as string,
    cobroId: d.cobro_id as string,
    motivo: d.motivo as string,
    creadoEn: d.created_at as string,
    autorizadoPorNombre: d.autorizado_por
      ? nombrePorId.get(d.autorizado_por as string) ?? "—"
      : d.origen && d.origen !== "manual"
        ? "hecho en el panel del proveedor"
        : "—",
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
        <Link href={volverHref} className="text-sm font-semibold text-morado hover:underline">
          ← {volverEtiqueta}
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
          puedeSinTope={tienePermiso(sesion, "descuentos_sin_tope")}
          puedeTarjetaManual={tienePermiso(sesion, "tarjeta_manual")}
          puedeAnular={tienePermiso(sesion, "anular_cobros")}
          puedeEditarMonto={tienePermiso(sesion, "editar_monto_cobros")}
          puedeTurnosCerrados={tienePermiso(sesion, "corregir_turnos_cerrados")}
          mp={{ disponible: mpDisponible, ordenes: ordenesMp, clienteTelefono: (cliente?.telefono as string | null) ?? null, terminalManualBloqueada: Boolean(terminalManualBloqueada) }}
        />
      )}
      {!error && (
        <SeccionFacturar
          clienteId={reserva.cliente_id as string}
          publicoGeneral={Boolean((cliente as { publico_general?: boolean } | null)?.publico_general)}
          cobros={cobros.map((c) => ({ id: c.id, anulado: c.anulado, creadoEn: c.creadoEn, monto: c.metodos.reduce((s, m) => s + m.monto, 0) }))}
        />
      )}
    </div>
  );
}
