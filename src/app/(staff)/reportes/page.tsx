import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { hoyNegocio } from "@/lib/formato";

function formatearMoneda(n: number): string {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const params = await searchParams;
  const hoy = hoyNegocio();
  const desde = params.desde || `${hoy.slice(0, 7)}-01`;
  const hasta = params.hasta || hoy;

  const supabase = await createSupabaseServerClient();
  const [
    { data, error },
    { data: costosData, error: errorCostos },
    { data: margenPorServicio, error: errorMargen },
    { data: operativoData, error: errorOperativo },
    { data: estadoActualData, error: errorEstadoActual },
  ] = await Promise.all([
    supabase.rpc("reporte_financiero_periodo", { p_desde: desde, p_hasta: hasta }).single(),
    supabase.rpc("reporte_costos_periodo", { p_desde: desde, p_hasta: hasta }).single(),
    supabase.rpc("reporte_margen_por_servicio_periodo", { p_desde: desde, p_hasta: hasta }),
    supabase.rpc("reporte_operativo_periodo", { p_desde: desde, p_hasta: hasta }).single(),
    supabase.rpc("reporte_estado_operativo_actual").single(),
  ]);

  const reporte = data as {
    cobros_efectivo: number;
    cobros_terminal: number;
    cobros_transferencia: number;
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
  }[];

  const operativo = operativoData as {
    dias_guarderia: number;
    noches_hotel: number;
    citas_estetica_finalizadas: number;
    estancias_canceladas: number;
    citas_no_llego: number;
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
        <p className="mt-1 text-n-600">Financiero y operativo. Solo visible para admin.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-n-200 bg-white p-4">
        <div>
          <label htmlFor="desde" className="mb-1.5 block text-sm font-semibold text-n-800">
            Desde
          </label>
          <input
            id="desde"
            name="desde"
            type="date"
            defaultValue={desde}
            className="min-h-12 rounded-md border-[1.5px] border-n-400 px-3.5 text-base focus:border-azul focus:outline-none focus:ring-[3px] focus:ring-azul-suave"
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
            className="min-h-12 rounded-md border-[1.5px] border-n-400 px-3.5 text-base focus:border-azul focus:outline-none focus:ring-[3px] focus:ring-azul-suave"
          />
        </div>
        <Button type="submit">Actualizar</Button>
      </form>

      {error || !reporte ? (
        <Alert variante="error" titulo="No pudimos cargar el reporte">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border-[1.5px] border-verde bg-verde-suave p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-verde-oscuro">
                Ingreso reconocido
              </p>
              <p className="mt-1 text-3xl font-extrabold text-verde-oscuro">
                {formatearMoneda(reporte.ingreso_reconocido)}
              </p>
              <p className="mt-2 text-sm text-n-700">
                Lo que el negocio ganó en el periodo — descuenta bonos vendidos (ingreso diferido) y
                suma bonos consumidos (ingreso ya devengado). Es el número correcto para comparar
                contra costos.
              </p>
            </div>
            <div className="rounded-lg border-[1.5px] border-azul bg-azul-suave p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-azul-oscuro">
                Ingreso neto de caja
              </p>
              <p className="mt-1 text-3xl font-extrabold text-azul-oscuro">
                {formatearMoneda(reporte.ingreso_caja_neto)}
              </p>
              <p className="mt-2 text-sm text-n-700">
                Lo que de verdad entró y salió del cajón (cobros − devoluciones − retiros). Reconcilia
                con los cortes de caja del periodo.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
            <table className="w-full min-w-[560px] border-collapse">
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
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-b border-n-200 px-4 py-2.5 font-semibold text-n-900">Cobros</td>
                  <td className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                    {formatearMoneda(reporte.cobros_efectivo)}
                  </td>
                  <td className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                    {formatearMoneda(reporte.cobros_terminal)}
                  </td>
                  <td className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                    {formatearMoneda(reporte.cobros_transferencia)}
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-n-200 px-4 py-2.5 text-n-700">Propinas</td>
                  <td className="border-b border-n-200 px-4 py-2.5 text-right text-n-600">
                    {formatearMoneda(reporte.propinas_efectivo)}
                  </td>
                  <td className="border-b border-n-200 px-4 py-2.5 text-right text-n-600">
                    {formatearMoneda(reporte.propinas_terminal)}
                  </td>
                  <td className="border-b border-n-200 px-4 py-2.5 text-right text-n-600">
                    {formatearMoneda(reporte.propinas_transferencia)}
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-n-200 px-4 py-2.5 text-n-700">Devoluciones</td>
                  <td className="border-b border-n-200 px-4 py-2.5 text-right text-naranja-oscuro">
                    −{formatearMoneda(reporte.devoluciones_efectivo)}
                  </td>
                  <td className="border-b border-n-200 px-4 py-2.5 text-right text-naranja-oscuro">
                    −{formatearMoneda(reporte.devoluciones_terminal)}
                  </td>
                  <td className="border-b border-n-200 px-4 py-2.5 text-right text-naranja-oscuro">
                    −{formatearMoneda(reporte.devoluciones_transferencia)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-n-700">Retiros de caja</td>
                  <td className="px-4 py-2.5 text-right text-naranja-oscuro">
                    −{formatearMoneda(reporte.retiros_efectivo)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-n-400">—</td>
                  <td className="px-4 py-2.5 text-right text-n-400">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Bonos vendidos</p>
              <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(reporte.bonos_vendidos)}</p>
              <p className="mt-1 text-xs text-n-500">Ingreso diferido, ya cobrado</p>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Bonos consumidos</p>
              <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(reporte.bonos_consumidos)}</p>
              <p className="mt-1 text-xs text-n-500">Ingreso reconocido este periodo</p>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Descuentos otorgados</p>
              <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(reporte.descuentos_otorgados)}</p>
              <p className="mt-1 text-xs text-n-500">Ya restados del cobro, solo informativo</p>
            </div>
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
              <div className="rounded-lg border-[1.5px] border-turquesa bg-turquesa-suave p-5">
                <p className="text-sm font-bold uppercase tracking-wide text-turquesa-oscuro">
                  Margen bruto de estética
                </p>
                <p className="mt-1 text-3xl font-extrabold text-turquesa-oscuro">
                  {formatearMoneda(costos.margen_estetica)}
                </p>
                <p className="mt-2 text-sm text-n-700">
                  Ingreso de citas finalizadas del periodo menos el costo real de su consumo ligado.
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
              <div className="rounded-lg border border-n-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-n-600">Ingreso de estética</p>
                <p className="mt-1 text-xl font-bold text-n-900">{formatearMoneda(costos.ingreso_estetica)}</p>
              </div>
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
                <table className="w-full min-w-[560px] border-collapse">
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
                    </tr>
                  </thead>
                  <tbody>
                    {margenServicios.map((s) => (
                      <tr key={s.servicio_id}>
                        <td className="border-b border-n-200 px-4 py-2.5 font-semibold text-n-900">
                          {s.servicio_nombre}
                        </td>
                        <td className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                          {s.citas_finalizadas}
                        </td>
                        <td className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                          {formatearMoneda(s.ingreso)}
                        </td>
                        <td className="border-b border-n-200 px-4 py-2.5 text-right text-n-700">
                          {formatearMoneda(s.costo_consumo)}
                        </td>
                        <td className="border-b border-n-200 px-4 py-2.5 text-right font-semibold text-n-900">
                          {formatearMoneda(s.margen)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Días de guardería</p>
              <p className="mt-1 text-xl font-bold text-n-900">{operativo.dias_guarderia}</p>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Noches de hotel</p>
              <p className="mt-1 text-xl font-bold text-n-900">{operativo.noches_hotel}</p>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Citas de estética</p>
              <p className="mt-1 text-xl font-bold text-n-900">{operativo.citas_estetica_finalizadas}</p>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Estancias canceladas</p>
              <p className="mt-1 text-xl font-bold text-n-900">{operativo.estancias_canceladas}</p>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-n-600">Citas no llegó</p>
              <p className="mt-1 text-xl font-bold text-n-900">{operativo.citas_no_llego}</p>
            </div>
          </div>
        )}
      </div>

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
                <span className="text-verde-oscuro">Vigente: {estadoActual.sanitario_vigente}</span>
                <span className="text-amarillo-oscuro">Por vencer: {estadoActual.sanitario_por_vencer}</span>
                <span className="text-naranja-oscuro">Vencido/sin registro: {estadoActual.sanitario_bloqueado}</span>
              </div>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-sm font-bold text-n-900">Contratos</p>
              <div className="mt-2 flex flex-col gap-1 text-sm">
                <span className="text-verde-oscuro">Vigente: {estadoActual.contrato_vigente}</span>
                <span className="text-azul-oscuro">Requiere actualización: {estadoActual.contrato_requiere_actualizacion}</span>
                <span className="text-amarillo-oscuro">Sin firmar: {estadoActual.contrato_sin_firmar}</span>
              </div>
            </div>
            <div className="rounded-lg border border-n-200 bg-white p-4">
              <p className="text-sm font-bold text-n-900">Inventario</p>
              <div className="mt-2 flex flex-col gap-1 text-sm">
                <span className="text-amarillo-oscuro">Bajo mínimo: {estadoActual.insumos_bajo_minimo}</span>
                <span className="text-naranja-oscuro">Por caducar/caducados: {estadoActual.insumos_por_caducar}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
