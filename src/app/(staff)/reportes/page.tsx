import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { mesAnterior, periodoAnterior, rangoMes } from "@/lib/gastos/textos";
import { zonaActual } from "@/lib/negocio/actual";
import { urlDesglose } from "@/lib/reportes/desglose";
import { TEXTO_CORTE_CIEGO, turnoAbiertoEnPeriodo } from "@/lib/caja/corte-ciego";
import { TablaResponsiva } from "@/components/ui/tabla-responsiva";
import { Enlace } from "@/components/ui/enlace";

function formatearMoneda(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

// Una cifra que se toca: abre el desglose de las operaciones que la forman, en el mismo periodo.
function Toque({ href, etiqueta, className, children }: { href: string; etiqueta: string; className?: string; children: React.ReactNode }) {
  return (
    <Enlace href={href} aria-label={etiqueta} data-desglose-enlace className={className}>
      {children}
    </Enlace>
  );
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const zona = await zonaActual();
  const params = await searchParams;
  const hoy = hoyNegocio(zona);
  // Por omisión, el ÚLTIMO MES COMPLETO: a mitad de mes los gastos fijos
  // salen prorrateados a los días transcurridos y la utilidad se ve mejor
  // de lo que va a ser.
  const ultimoMes = rangoMes(mesAnterior(hoy.slice(0, 7)));
  const mesEnCurso = { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  const desde = params.desde || ultimoMes.desde;
  const hasta = params.hasta || (params.desde ? hoy : ultimoMes.hasta);
  // El rango llega a hoy o después: todavía no termina.
  const parcial = hasta >= hoy;
  const esMesCompleto = desde === rangoMes(desde.slice(0, 7)).desde && hasta === rangoMes(desde.slice(0, 7)).hasta;
  const nombreMes = (fecha: string) =>
    new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(new Date(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, 1));
  const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;

  // Con qué se compara: el mes anterior si el rango es un mes completo; si
  // no, los mismos días justo antes.
  const anterior = periodoAnterior(desde, hasta);
  const D = (tarjeta: string) => urlDesglose(tarjeta, desde, hasta);
  const supabase = await createSupabaseServerClient();
  const [
    { data, error },
    { data: costosData, error: errorCostos },
    { data: margenPorServicio, error: errorMargen },
    { data: operativoData, error: errorOperativo },
    { data: estadoActualData, error: errorEstadoActual },
    { data: utilidadData, error: errorUtilidad },
    { data: utilidadAnteriorData },
    { data: gastosCategoria },
    { data: gastosCategoriaAnterior },
    { data: ventasData, error: errorVentas },
    { data: diasPaseData },
    { data: extrasData },
  ] = await Promise.all([
    supabase.rpc("reporte_financiero_periodo", { p_desde: desde, p_hasta: hasta }).single(),
    supabase.rpc("reporte_costos_periodo", { p_desde: desde, p_hasta: hasta }).single(),
    supabase.rpc("reporte_margen_por_servicio_periodo", { p_desde: desde, p_hasta: hasta }),
    supabase.rpc("reporte_operativo_periodo", { p_desde: desde, p_hasta: hasta }).single(),
    supabase.rpc("reporte_estado_operativo_actual").single(),
    supabase.rpc("reporte_utilidad_periodo", { p_desde: desde, p_hasta: hasta }).single(),
    supabase.rpc("reporte_utilidad_periodo", { p_desde: anterior.desde, p_hasta: anterior.hasta }).single(),
    supabase.rpc("gastos_por_categoria_periodo", { p_desde: desde, p_hasta: hasta }),
    supabase.rpc("gastos_por_categoria_periodo", { p_desde: anterior.desde, p_hasta: anterior.hasta }),
    supabase.rpc("reporte_ventas_mostrador_periodo", { p_desde: desde, p_hasta: hasta }).single(),
    supabase.rpc("reporte_dias_pase_periodo", { p_desde: desde, p_hasta: hasta }).single(),
    supabase.rpc("reporte_servicios_extra_periodo", { p_desde: desde, p_hasta: hasta }),
  ]);
  // Corte ciego: con un turno abierto en el periodo, el dinero de caja por método no sale de este servidor.
  const turnoCiego = await turnoAbiertoEnPeriodo(supabase, desde, hasta, zona);
  // Servicios extra de Hotel y guardería: ingreso por servicio y por empleado.
  const extras = ((extrasData ?? []) as { agrupacion: string; clave: string; nombre: string; veces: number; cantidad: number; ingreso: number; cubierto_paquete: number }[]).map((r) => ({
    ...r,
    veces: Number(r.veces),
    cantidad: Number(r.cantidad),
    ingreso: Number(r.ingreso),
    cubierto_paquete: Number(r.cubierto_paquete),
  }));
  // Venta de mostrador: aparte de los servicios (ya está dentro de lo cobrado).
  const ventas = ventasData as {
    ventas: number;
    total_vendido: number;
    productos: number;
    conceptos: number;
    costo_productos: number;
    cobrado: number;
  } | null;

  // Utilidad = ingreso reconocido − consumo de insumos − costo de nómina.
  // Si la utilidad falla, que los logs digan por qué (antes el motivo se perdía y solo se veía el aviso).
  if (errorUtilidad) console.error("[reportes] reporte_utilidad_periodo falló", { desde, hasta, codigo: errorUtilidad.code, mensaje: errorUtilidad.message });

  const utilidad = utilidadData as {
    ingreso_reconocido: number;
    costo_insumos: number;
    nomina_costo: number;
    nomina_pagada: number;
    propinas_repartidas: number;
    adelantos_pendientes: number;
    gastos_local: number;
    utilidad: number;
  } | null;
  const utilidadAnterior = utilidadAnteriorData as typeof utilidad;
  const categoriasGasto = ((gastosCategoria ?? []) as { categoria_id: string; categoria: string; monto: number }[])
    .map((c) => ({
      ...c,
      monto: Number(c.monto),
      anterior: Number(((gastosCategoriaAnterior ?? []) as { categoria_id: string; monto: number }[]).find((a) => a.categoria_id === c.categoria_id)?.monto ?? 0),
    }))
    .filter((c) => c.monto || c.anterior);

  const reporte = data as {
    cobros_efectivo: number;
    cobros_terminal: number;
    cobros_transferencia: number;
    cobros_tarjeta_manual: number;
    propinas_tarjeta_manual: number;
    devoluciones_tarjeta_manual: number;
    propinas_efectivo: number;
    propinas_terminal: number;
    propinas_transferencia: number;
    devoluciones_efectivo: number;
    devoluciones_terminal: number;
    devoluciones_transferencia: number;
    retiros_efectivo: number;
    bonos_vendidos: number;
    bonos_consumidos: number;
    descuentos_otorgados: number;
    ingreso_caja_neto: number;
    ingreso_reconocido: number;
    efectivo_agregado?: number;
  } | null;

  const costos = costosData as {
    compras_total: number;
    consumo_valorizado_total: number;
    merma_valorizada: number;
    consumo_estetica_valorizado: number;
    ingreso_estetica: number;
    margen_estetica: number;
  } | null;

  const margenServicios = (margenPorServicio ?? []) as {
    servicio_id: string;
    servicio_nombre: string;
    citas_finalizadas: number;
    ingreso: number;
    costo_consumo: number;
    margen: number;
    comision: number;
    margen_con_comision: number;
  }[];

  const operativo = operativoData as {
    dias_guarderia: number;
    noches_hotel: number;
    citas_estetica_finalizadas: number;
    estancias_canceladas: number;
    citas_no_llego: number;
  } | null;

  // Días de pase: los reales (check-ins que cubrió un pase) aparte de los que
  // se movieron a mano (ajustes de saldo, sin dinero de por medio).
  const diasPase = diasPaseData as {
    dias_reales: number;
    dias_ajustados_mas: number;
    dias_ajustados_menos: number;
    dias_uso_previo: number;
    ajustes: number;
  } | null;

  const estadoActual = estadoActualData as {
    sanitario_vigente: number;
    sanitario_por_vencer: number;
    sanitario_bloqueado: number;
    contrato_vigente: number;
    contrato_sin_firmar: number;
    contrato_requiere_actualizacion: number;
    insumos_bajo_minimo: number;
    insumos_por_caducar: number;
  } | null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Reportes</h1>
        <p className="mt-1 text-n-600">Financiero y operativo. Solo para admin y para quien tenga el permiso «Reportes financieros».</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-n-200 bg-white p-4">
        <div>
          <label htmlFor="desde" className="mb-1.5 block text-sm font-semibold text-n-800">
            Desde
          </label>
          <input
            id="desde"
            name="desde"
            type="date"
            defaultValue={desde}
            className="min-h-12 rounded-md border-[1.5px] border-n-400 px-3.5 text-base focus:border-morado focus:outline-none focus:ring-[3px] focus:ring-morado-suave"
          />
        </div>
        <div>
          <label htmlFor="hasta" className="mb-1.5 block text-sm font-semibold text-n-800">
            Hasta
          </label>
          <input
            id="hasta"
            name="hasta"
            type="date"
            defaultValue={hasta}
            className="min-h-12 rounded-md border-[1.5px] border-n-400 px-3.5 text-base focus:border-morado focus:outline-none focus:ring-[3px] focus:ring-morado-suave"
          />
        </div>
        <Button type="submit">Actualizar</Button>
        <div className="flex flex-wrap gap-3 pb-3 text-sm font-semibold">
          <Enlace href={`/reportes?desde=${ultimoMes.desde}&hasta=${ultimoMes.hasta}`}>
            Último mes completo ({nombreMes(ultimoMes.desde)})
          </Enlace>
          <Enlace href={`/reportes?desde=${mesEnCurso.desde}&hasta=${mesEnCurso.hasta}`}>
            Mes en curso
          </Enlace>
        </div>
      </form>

      <p className="-mt-3 text-sm text-n-600">
        Mostrando{" "}
        <strong className="text-n-900">
          {esMesCompleto && !parcial
            ? `${nombreMes(desde)} completo`
            : esMesCompleto
              ? `${nombreMes(desde)} (todavía no termina)`
              : `del ${formatearFechaCalendario(desde)} al ${formatearFechaCalendario(hasta)}`}
        </strong>
        .
      </p>

      {parcial && (
        <Alert variante="advertencia" titulo={desde.slice(0, 7) === hoy.slice(0, 7) ? "Mes en curso: es un mes parcial" : "El periodo todavía no termina"}>
          {hasta === hoy
            ? `Van ${dias(desde, hoy)} días (del ${formatearFechaCalendario(desde)} a hoy). Los gastos fijos (renta, luz, internet…) están prorrateados a esos días transcurridos, no al mes completo, así que la utilidad todavía no es la del mes. `
            : `El rango termina el ${formatearFechaCalendario(hasta)}, después de hoy: los gastos fijos se cuentan hasta esa fecha, pero ingresos, insumos y nómina solo llegan a hoy, así que la utilidad sale más baja de lo que va a ser. `}
          Para ver un mes cerrado, usa «Último mes completo».
        </Alert>
      )}

      {errorUtilidad || !utilidad ? (
        <Alert variante="error" titulo="No pudimos calcular la utilidad">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border-[1.5px] border-n-300 bg-white p-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-n-600">Utilidad del periodo</p>
            <p className={`mt-1 text-3xl font-extrabold ${Number(utilidad.utilidad) < 0 ? "text-coral-oscuro" : "text-n-900"}`}>
              {formatearMoneda(Number(utilidad.utilidad))}
            </p>
          </div>
          <div className="overflow-x-auto">
            <TablaResponsiva className="tabla-tarjetas w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wide text-n-500">
                  <th className="py-1.5 pr-3" />
                  <th className="py-1.5 pr-3 text-right">Este periodo</th>
                  <th className="py-1.5 pr-3 text-right">
                    Anterior ({formatearFechaCalendario(anterior.desde)} – {formatearFechaCalendario(anterior.hasta)})
                  </th>
                </tr>
              </thead>
              <tbody className="text-n-800">
                {(
                  [
                    ["Ingreso reconocido", "ingreso_reconocido", 1],
                    ["− Insumos consumidos (incluye merma)", "costo_insumos", -1],
                    ["− Nómina", "nomina_costo", -1],
                    ["− Gastos del local", "gastos_local", -1],
                  ] as const
                ).map(([etiqueta, clave]) => (
                  <tr key={clave} className="border-t border-n-200">
                    <td data-label="" className="py-1.5 pr-3">{etiqueta}</td>
                    <td data-label="Este periodo" className="py-1.5 pr-3 text-right tabular-nums">{formatearMoneda(Number(utilidad[clave]))}</td>
                    <td data-label="Periodo anterior" className="py-1.5 pr-3 text-right tabular-nums text-n-600">{utilidadAnterior ? formatearMoneda(Number(utilidadAnterior[clave])) : "—"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-n-300 font-bold">
                  <td data-label="" className="py-1.5 pr-3">Utilidad</td>
                  <td data-label="Este periodo" className="py-1.5 pr-3 text-right tabular-nums">{formatearMoneda(Number(utilidad.utilidad))}</td>
                  <td data-label="Periodo anterior" className="py-1.5 pr-3 text-right tabular-nums text-n-600">{utilidadAnterior ? formatearMoneda(Number(utilidadAnterior.utilidad)) : "—"}</td>
                </tr>
              </tbody>
            </TablaResponsiva>
          </div>

          {categoriasGasto.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-n-900">Gastos del local, por categoría</p>
              <div className="overflow-x-auto">
                <TablaResponsiva className="tabla-tarjetas w-full min-w-[480px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold uppercase tracking-wide text-n-500">
                      <th className="py-1.5 pr-3">Categoría</th>
                      <th className="py-1.5 pr-3 text-right">Este periodo</th>
                      <th className="py-1.5 pr-3 text-right">Anterior</th>
                      <th className="py-1.5 pr-3 text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="text-n-800">
                    {categoriasGasto.map((c) => {
                      const dif = c.monto - c.anterior;
                      return (
                        <tr key={c.categoria_id} className="border-t border-n-200">
                          <td data-label="" className="py-1.5 pr-3">{c.categoria}</td>
                          <td data-label="Este periodo" className="py-1.5 pr-3 text-right tabular-nums">{formatearMoneda(c.monto)}</td>
                          <td data-label="Anterior" className="py-1.5 pr-3 text-right tabular-nums text-n-600">{formatearMoneda(c.anterior)}</td>
                          <td data-label="Diferencia" className={`py-1.5 pr-3 text-right tabular-nums ${dif > 0 ? "text-coral-oscuro" : "text-menta-oscuro"}`}>
                            {dif > 0 ? "+" : ""}
                            {formatearMoneda(dif)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TablaResponsiva>
              </div>
            </div>
          )}

          <p className="text-xs text-n-500">
            Los gastos del local cuentan en los meses que cubren, repartidos por días (la luz bimestral carga la mitad en cada mes).
            La nómina entra por la fecha en que se pagó (con sus reversos): sueldos, pago por día y comisiones, con los adelantos que
            ese pago descontó. Las propinas no cuentan ({formatearMoneda(Number(utilidad.propinas_repartidas))} repartidas en el periodo):
            las deja el cliente para quien lo atendió y tampoco entran como ingreso.
            {Number(utilidad.adelantos_pendientes) > 0 &&
              ` Hay ${formatearMoneda(Number(utilidad.adelantos_pendientes))} en adelantos entregados que todavía no se descuentan de un pago: entran cuando se pague.`}
          </p>
        </div>
      )}

      {error || !reporte ? (
        <Alert variante="error" titulo="No pudimos cargar el reporte">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border-[1.5px] border-menta bg-menta-suave p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-menta-oscuro">
                Ingreso reconocido
              </p>
              <p className="mt-1 text-3xl font-extrabold text-menta-oscuro">
                {formatearMoneda(reporte.ingreso_reconocido)}
              </p>
              <p className="mt-2 text-sm text-n-700">
                Lo que el negocio ganó en el periodo — descuenta bonos vendidos (ingreso diferido) y
                suma bonos consumidos (ingreso ya devengado). Es el número correcto para comparar
                contra costos.
              </p>
            </div>
            {!turnoCiego && (
            <div className="rounded-lg border-[1.5px] border-morado bg-morado-suave p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-morado-oscuro">
                Ingreso neto de caja
              </p>
              <p className="mt-1 text-3xl font-extrabold text-morado-oscuro">
                {formatearMoneda(reporte.ingreso_caja_neto)}
              </p>
              <p className="mt-2 text-sm text-n-700">
                Lo que de verdad entró y salió del cajón (cobros − devoluciones − retiros). Reconcilia
                con los cortes de caja del periodo.
              </p>
            </div>
            )}
          </div>

          {turnoCiego ? (
            <Alert variante="info" titulo="Caja por método: al cerrar el turno">
              {TEXTO_CORTE_CIEGO}
            </Alert>
          ) : (
            <>
          <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
            <TablaResponsiva className="tabla-tarjetas w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                    Concepto
                  </th>
                  <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                    Efectivo
                  </th>
                  <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                    Terminal
                  </th>
                  <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                    Transferencia
                  </th>
                  <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                    Tarjeta manual (sin verificar)
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="" className="border-b border-n-200 px-4 py-2.5 font-semibold text-n-900">Cobros</td>
                  <td data-label="Efectivo" className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                    <Toque href={D("cobros:efectivo")} etiqueta="Ver los cobros en efectivo">{formatearMoneda(reporte.cobros_efectivo)}</Toque>
                  </td>
                  <td data-label="Terminal" className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                    <Toque href={D("cobros:terminal")} etiqueta="Ver los cobros en terminal">{formatearMoneda(reporte.cobros_terminal)}</Toque>
                  </td>
                  <td data-label="Transferencia" className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                    <Toque href={D("cobros:transferencia")} etiqueta="Ver los cobros en transferencia">{formatearMoneda(reporte.cobros_transferencia)}</Toque>
                  </td>
                  <td data-label="Tarjeta manual (sin verificar)" className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                    <Toque href={D("cobros:tarjeta_manual")} etiqueta="Ver los cobros en tarjeta manual">{formatearMoneda(reporte.cobros_tarjeta_manual)}</Toque>
                  </td>
                </tr>
                <tr>
                  <td data-label="" className="border-b border-n-200 px-4 py-2.5 text-n-700">Propinas</td>
                  <td data-label="Efectivo" className="border-b border-n-200 px-4 py-2.5 text-right text-n-600">
                    <Toque href={D("propinas:efectivo")} etiqueta="Ver los propinas en efectivo">{formatearMoneda(reporte.propinas_efectivo)}</Toque>
                  </td>
                  <td data-label="Terminal" className="border-b border-n-200 px-4 py-2.5 text-right text-n-600">
                    <Toque href={D("propinas:terminal")} etiqueta="Ver los propinas en terminal">{formatearMoneda(reporte.propinas_terminal)}</Toque>
                  </td>
                  <td data-label="Transferencia" className="border-b border-n-200 px-4 py-2.5 text-right text-n-600">
                    <Toque href={D("propinas:transferencia")} etiqueta="Ver los propinas en transferencia">{formatearMoneda(reporte.propinas_transferencia)}</Toque>
                  </td>
                  <td data-label="Tarjeta manual (sin verificar)" className="border-b border-n-200 px-4 py-2.5 text-right text-n-600">
                    <Toque href={D("propinas:tarjeta_manual")} etiqueta="Ver los propinas en tarjeta manual">{formatearMoneda(reporte.propinas_tarjeta_manual)}</Toque>
                  </td>
                </tr>
                <tr>
                  <td data-label="" className="border-b border-n-200 px-4 py-2.5 text-n-700">Devoluciones</td>
                  <td data-label="Efectivo" className="border-b border-n-200 px-4 py-2.5 text-right text-coral-oscuro">
                    <Toque href={D("devoluciones:efectivo")} etiqueta="Ver las devoluciones en efectivo">−{formatearMoneda(reporte.devoluciones_efectivo)}</Toque>
                  </td>
                  <td data-label="Terminal" className="border-b border-n-200 px-4 py-2.5 text-right text-coral-oscuro">
                    <Toque href={D("devoluciones:terminal")} etiqueta="Ver las devoluciones en terminal">−{formatearMoneda(reporte.devoluciones_terminal)}</Toque>
                  </td>
                  <td data-label="Transferencia" className="border-b border-n-200 px-4 py-2.5 text-right text-coral-oscuro">
                    <Toque href={D("devoluciones:transferencia")} etiqueta="Ver las devoluciones en transferencia">−{formatearMoneda(reporte.devoluciones_transferencia)}</Toque>
                  </td>
                  <td data-label="Tarjeta manual (sin verificar)" className="border-b border-n-200 px-4 py-2.5 text-right text-coral-oscuro">
                    <Toque href={D("devoluciones:tarjeta_manual")} etiqueta="Ver las devoluciones en tarjeta manual">−{formatearMoneda(reporte.devoluciones_tarjeta_manual)}</Toque>
                  </td>
                </tr>
                <tr>
                  <td data-label="" className="px-4 py-2.5 text-n-700">Retiros de caja</td>
                  <td data-label="Efectivo" className="px-4 py-2.5 text-right text-coral-oscuro">
                    <Toque href={D("retiros")} etiqueta="Ver los retiros de caja">−{formatearMoneda(reporte.retiros_efectivo)}</Toque>
                  </td>
                  <td data-label="Terminal" className="px-4 py-2.5 text-right text-n-400">—</td>
                  <td data-label="Transferencia" className="px-4 py-2.5 text-right text-n-400">—</td>
                  <td data-label="Tarjeta manual (sin verificar)" className="px-4 py-2.5 text-right text-n-400">—</td>
                </tr>
              </tbody>
            </TablaResponsiva>
          </div>
          {Number(reporte.efectivo_agregado ?? 0) > 0 && (
            <p className="text-sm text-n-700" data-efectivo-agregado-reporte>
              Efectivo agregado a la caja en el periodo (cambio, préstamos, aportaciones):{" "}
              <strong><Toque href={D("efectivo_agregado")} etiqueta="Ver el efectivo agregado">{formatearMoneda(Number(reporte.efectivo_agregado))}</Toque></strong>. Es movimiento del cajón, no una venta: no está sumado en los ingresos de arriba.
            </p>
          )}
          <p className="text-sm text-n-700" data-total-tarjeta-reporte>
            Total con tarjeta:{" "}
            <strong>
              {formatearMoneda(
                reporte.cobros_terminal + reporte.propinas_terminal - reporte.devoluciones_terminal +
                  reporte.cobros_tarjeta_manual + reporte.propinas_tarjeta_manual - reporte.devoluciones_tarjeta_manual
              )}
            </strong>{" "}
            = terminal (verificada por el proveedor){" "}
            {formatearMoneda(reporte.cobros_terminal + reporte.propinas_terminal - reporte.devoluciones_terminal)} + tarjeta manual (sin verificar){" "}
            {formatearMoneda(reporte.cobros_tarjeta_manual + reporte.propinas_tarjeta_manual - reporte.devoluciones_tarjeta_manual)}.
          </p>

            </>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Enlace href={D("bonos_vendidos")} aria-label="Ver los bonos vendidos" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Bonos vendidos</p>
              <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(reporte.bonos_vendidos)}</p>
              <p className="mt-1 text-xs text-n-500">Ingreso diferido, ya cobrado</p>
            </Enlace>
            <Enlace href={D("bonos_consumidos")} aria-label="Ver los bonos consumidos" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Bonos consumidos</p>
              <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(reporte.bonos_consumidos)}</p>
              <p className="mt-1 text-xs text-n-500">Ingreso reconocido este periodo</p>
            </Enlace>
            <Enlace href={D("descuentos")} aria-label="Ver los descuentos otorgados" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Descuentos otorgados</p>
              <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(reporte.descuentos_otorgados)}</p>
              <p className="mt-1 text-xs text-n-500">Ya restados del cobro, solo informativo</p>
            </Enlace>
          </div>
        </div>
      )}

      {!errorVentas && ventas && Number(ventas.ventas) > 0 && (
        <div className="flex flex-col gap-4 border-t border-n-200 pt-6" data-reporte-ventas>
          <div>
            <h2 className="text-lg font-bold text-n-900">Ventas de mostrador</h2>
            <p className="mt-1 text-sm text-n-600">
              Productos y conceptos vendidos en Caja → Venta rápida, aparte de los servicios. Ya están dentro de lo cobrado de arriba; el costo de
              los productos entra al costo de insumos de la utilidad.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Enlace href={D("ventas_vendido")} aria-label="Ver las ventas de mostrador" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Vendido</p>
              <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(Number(ventas.total_vendido))}</p>
              <p className="mt-1 text-xs text-n-500">{Number(ventas.ventas)} {Number(ventas.ventas) === 1 ? "venta" : "ventas"}</p>
            </Enlace>
            <Enlace href={D("ventas_productos")} aria-label="Ver los productos vendidos" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Productos</p>
              <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(Number(ventas.productos))}</p>
              <p className="mt-1 text-xs text-n-500">Costo {formatearMoneda(Number(ventas.costo_productos))}</p>
            </Enlace>
            <Enlace href={D("ventas_conceptos")} aria-label="Ver los conceptos libres" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Conceptos libres</p>
              <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(Number(ventas.conceptos))}</p>
            </Enlace>
            <Enlace href={D("ventas_cobrado")} aria-label="Ver lo cobrado de las ventas de mostrador" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Cobrado (neto)</p>
              <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(Number(ventas.cobrado))}</p>
              <p className="mt-1 text-xs text-n-500">Menos devoluciones</p>
            </Enlace>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <div>
          <h2 className="text-lg font-bold text-n-900">Costos y margen — estética</h2>
          <p className="mt-1 text-sm text-n-600">
            Costo valorizado al promedio ponderado de compra de cada insumo (no por lote). Solo
            cubre servicios de estética con receta de consumo configurada — guardería y hotel no
            tienen costo de insumo ligado todavía.
          </p>
        </div>

        {errorCostos || errorMargen || !costos ? (
          <Alert variante="error" titulo="No pudimos cargar el reporte de costos">
            Recarga la página. Si el problema sigue, avísale al equipo técnico.
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border-[1.5px] border-menta bg-menta-suave p-5">
                <p className="text-sm font-bold uppercase tracking-wide text-menta-oscuro">
                  Margen bruto de estética
                </p>
                <p className="mt-1 text-3xl font-extrabold text-menta-oscuro">
                  {formatearMoneda(costos.margen_estetica)}
                </p>
                <p className="mt-2 text-sm text-n-700">
                  Ingreso de citas finalizadas del periodo menos el costo real de su consumo ligado. En la tabla de abajo,
                  además, la comisión del estilista que atendió cada cita.
                </p>
              </div>
              <div className="rounded-lg border border-n-200 bg-white p-5">
                <p className="text-sm font-bold uppercase tracking-wide text-n-600">Compras del periodo</p>
                <p className="mt-1 text-3xl font-extrabold text-n-900">
                  {formatearMoneda(costos.compras_total)}
                </p>
                <p className="mt-2 text-sm text-n-700">Lo que se pagó a proveedores en el rango de fechas.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Enlace href={D("estetica_ingreso")} aria-label="Ver las citas que forman el ingreso de estética" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
                <p className="text-xs font-bold uppercase tracking-wide text-n-600">Ingreso de estética</p>
                <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(costos.ingreso_estetica)}</p>
              </Enlace>
              <div className="rounded-lg border border-n-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-n-600">Costo de consumo (estética)</p>
                <p className="mt-1 text-xl font-bold text-n-900">
                  {formatearMoneda(costos.consumo_estetica_valorizado)}
                </p>
              </div>
              <div className="rounded-lg border border-n-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-n-600">Merma valorizada</p>
                <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(costos.merma_valorizada)}</p>
                <p className="mt-1 text-xs text-n-500">Insumo perdido, no vendido</p>
              </div>
            </div>

            {margenServicios.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
                <TablaResponsiva className="tabla-tarjetas w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr>
                      <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                        Servicio
                      </th>
                      <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                        Citas
                      </th>
                      <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                        Ingreso
                      </th>
                      <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                        Costo
                      </th>
                      <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                        Margen
                      </th>
                      <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                        Comisión
                      </th>
                      <th className="border-b border-n-200 bg-n-100 px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-n-600">
                        Margen tras comisión
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {margenServicios.map((s) => (
                      <tr key={s.servicio_id}>
                        <td data-label="" className="border-b border-n-200 px-4 py-2.5 font-semibold text-n-900">
                          {s.servicio_nombre}
                        </td>
                        <td data-label="Citas" className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                          <Toque href={D(`estetica_servicio:${s.servicio_id}`)} etiqueta={`Ver las citas de ${s.servicio_nombre}`}>{s.citas_finalizadas}</Toque>
                        </td>
                        <td data-label="Ingreso" className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                          <Toque href={D(`estetica_servicio:${s.servicio_id}`)} etiqueta={`Ver el ingreso de ${s.servicio_nombre}`}>{formatearMoneda(s.ingreso)}</Toque>
                        </td>
                        <td data-label="Costo" className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                          {formatearMoneda(s.costo_consumo)}
                        </td>
                        <td data-label="Margen" className="border-b border-n-200 px-4 py-2.5 text-right font-semibold text-n-900">
                          {formatearMoneda(s.margen)}
                        </td>
                        <td data-label="Comisión" className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                          {formatearMoneda(Number(s.comision))}
                        </td>
                        <td data-label="Margen tras comisión" className="border-b border-n-200 px-4 py-2.5 text-right font-semibold text-n-900">
                          {formatearMoneda(Number(s.margen_con_comision))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TablaResponsiva>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <div>
          <h2 className="text-lg font-bold text-n-900">Operación del periodo</h2>
          <p className="mt-1 text-sm text-n-600">
            No calcula % de ocupación contra el cupo configurado, solo cuenta días/noches reales.
          </p>
        </div>

        {errorOperativo || !operativo ? (
          <Alert variante="error" titulo="No pudimos cargar la operación del periodo">
            Recarga la página. Si el problema sigue, avísale al equipo técnico.
          </Alert>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Enlace href={D("op_guarderia")} aria-label="Ver los días de guardería" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Días de guardería</p>
              <p className="mt-1 text-xl font-bold text-n-900">{operativo.dias_guarderia}</p>
            </Enlace>
            <Enlace href={D("op_hotel")} aria-label="Ver las noches de hotel" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Noches de hotel</p>
              <p className="mt-1 text-xl font-bold text-n-900">{operativo.noches_hotel}</p>
            </Enlace>
            <Enlace href={D("op_estetica")} aria-label="Ver las citas de estética finalizadas" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Citas de estética</p>
              <p className="mt-1 text-xl font-bold text-n-900">{operativo.citas_estetica_finalizadas}</p>
            </Enlace>
            <Enlace href={D("op_canceladas")} aria-label="Ver las estancias canceladas" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Estancias canceladas</p>
              <p className="mt-1 text-xl font-bold text-n-900">{operativo.estancias_canceladas}</p>
            </Enlace>
            <Enlace href={D("op_no_llego")} aria-label="Ver las citas en las que no llegó" data-desglose-enlace className="block rounded-lg border border-n-200 bg-white p-4 hover:border-morado hover:bg-morado-suave" forma="bloque">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Citas no llegó</p>
              <p className="mt-1 text-xl font-bold text-n-900">{operativo.citas_no_llego}</p>
            </Enlace>
          </div>
        )}
      </div>

      {diasPase && (
        <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
          <div>
            <h2 className="text-lg font-bold text-n-900">Días de pase: reales y ajustados a mano</h2>
            <p className="mt-1 text-sm text-n-600">
              Los días reales son los que cubrió un pase en una estancia. Los ajustados se corrigieron a mano en el
              saldo del pase: no son asistencia y no mueven dinero.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Días reales con pase</p>
              <p className="mt-1 text-xl font-bold text-n-900">{diasPase.dias_reales}</p>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Ajustados: se sumaron</p>
              <p className="mt-1 text-xl font-bold text-n-900">{diasPase.dias_ajustados_mas}</p>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Ajustados: se devolvieron</p>
              <p className="mt-1 text-xl font-bold text-n-900">{diasPase.dias_ajustados_menos}</p>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Uso previo a PeluDesk</p>
              <p className="mt-1 text-xl font-bold text-n-900">{diasPase.dias_uso_previo}</p>
            </div>
          </div>
        </div>
      )}

      {extras.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-n-200 pt-6" data-reporte-extras>
          <div>
            <h2 className="text-lg font-bold text-n-900">Servicios extra de Hotel y guardería</h2>
            <p className="mt-1 text-sm text-n-600">
              Lo que se hizo y se cobró en el periodo (paseos, traslados, entrenamiento…), por servicio y por la persona que
              lo marcó como hecho. Lo cubierto con un paquete de sesiones va aparte: no se cobró en ese momento.
            </p>
          </div>
          {(["servicio", "empleado"] as const).map((grupo) => {
            const filas = extras.filter((r) => r.agrupacion === grupo);
            if (filas.length === 0) return null;
            return (
              <div key={grupo} className="overflow-x-auto rounded-lg border border-n-200 bg-white">
                <TablaResponsiva className="tabla-tarjetas w-full text-left text-sm">
                  <thead className="bg-n-50 text-xs font-bold uppercase tracking-wide text-n-600">
                    <tr>
                      <th className="px-3 py-2">{grupo === "servicio" ? "Servicio" : "Empleado"}</th>
                      <th className="px-3 py-2 text-right">Veces</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-right">Ingreso</th>
                      <th className="px-3 py-2 text-right">Cubierto con paquete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((r) => (
                      <tr key={r.clave} className="border-t border-n-100">
                        <td data-label="" className="px-3 py-2 font-semibold text-n-900">{r.nombre}</td>
                        <td data-label="Veces" className="px-3 py-2 text-right tabular-nums">{r.veces}</td>
                        <td data-label="Cantidad" className="px-3 py-2 text-right tabular-nums">{r.cantidad}</td>
                        <td data-label="Ingreso" className="px-3 py-2 text-right tabular-nums">${r.ingreso.toFixed(2)}</td>
                        <td data-label="Cubierto con paquete" className="px-3 py-2 text-right tabular-nums">${r.cubierto_paquete.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </TablaResponsiva>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-n-200 pt-6">
        <div>
          <h2 className="text-lg font-bold text-n-900">Estado actual</h2>
          <p className="mt-1 text-sm text-n-600">
            Fotografía de ahora mismo — no cambia con el rango de fechas de arriba.
          </p>
        </div>

        {errorEstadoActual || !estadoActual ? (
          <Alert variante="error" titulo="No pudimos cargar el estado actual">
            Recarga la página. Si el problema sigue, avísale al equipo técnico.
          </Alert>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-sm font-bold text-n-900">Cumplimiento sanitario</p>
              <div className="mt-2 flex flex-col gap-1 text-sm">
                <span className="text-menta-oscuro">Vigente: {estadoActual.sanitario_vigente}</span>
                <span className="text-ambar-oscuro">Por vencer: {estadoActual.sanitario_por_vencer}</span>
                <span className="text-coral-oscuro">Vencido/sin registro: {estadoActual.sanitario_bloqueado}</span>
              </div>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-sm font-bold text-n-900">Contratos</p>
              <p className="mt-0.5 text-xs text-n-500">
                Perros, contando todos los contratos que les aplican. No entran los que todavía no
                usan ningún servicio con contrato.
              </p>
              <div className="mt-2 flex flex-col gap-1 text-sm">
                <span className="text-menta-oscuro">Vigente: {estadoActual.contrato_vigente}</span>
                <span className="text-morado-oscuro">Requiere actualización: {estadoActual.contrato_requiere_actualizacion}</span>
                <span className="text-ambar-oscuro">Sin firmar: {estadoActual.contrato_sin_firmar}</span>
              </div>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-sm font-bold text-n-900">Inventario</p>
              <div className="mt-2 flex flex-col gap-1 text-sm">
                <span className="text-ambar-oscuro">Bajo mínimo: {estadoActual.insumos_bajo_minimo}</span>
                <span className="text-coral-oscuro">Por caducar/caducados: {estadoActual.insumos_por_caducar}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
