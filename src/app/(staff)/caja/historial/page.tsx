import { createSupabaseServerClient } from "@/lib/supabase/server";
import { zonaActual } from "@/lib/negocio/actual";
import { hoyNegocio, sumarDiasFecha, fechaLocalDeInstante, horaLocalDeInstante, formatearFechaCalendario } from "@/lib/formato";
import { dinero } from "@/lib/dinero";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Enlace } from "@/components/ui/enlace";
import { TablaResponsiva } from "@/components/ui/tabla-responsiva";
import { DetalleMovimiento } from "./detalle";
import { ETIQUETA_METODO, TIPOS_FILTRO, etiquetaMovimiento, type MovimientoCaja } from "./tipos";

const POR_PAGINA = 50;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const campo = "min-h-11 w-full rounded-md border-[1.5px] border-n-400 bg-card px-3 text-base focus:border-morado focus:outline-none focus:ring-[3px] focus:ring-morado-suave";

/**
 * Caja → Historial (ux/caja-historial, 3 de noviembre de 2026): los movimientos del turno abierto y de turnos anteriores
 * (cobros y abonos, ventas, devoluciones, anulaciones y correcciones, retiros, gastos pagados de caja y efectivo agregado),
 * con filtros por fecha, turno, tipo y forma de pago, y el detalle de uno al tocarlo. Todo sale de `caja_movimientos` /
 * `caja_movimiento_detalle`, que aplican en la BASE quién ve qué turno y el corte ciego (con el turno abierto, quien no es
 * admin no recibe montos de ese turno ni totales). Referencia: bloque data-table de shadcn/studio y Mobbin
 * panel-caja-cobros (Fresha: cobros con folio y chip de estado; el detalle en un cajón lateral).
 */
export default async function HistorialCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; turno?: string; tipo?: string; metodo?: string; pag?: string; mov?: string }>;
}) {
  const sp = await searchParams;
  const [zona, supabase] = await Promise.all([zonaActual(), createSupabaseServerClient()]);
  const hoy = hoyNegocio(zona);
  const desde = sp.desde && FECHA.test(sp.desde) ? sp.desde : sumarDiasFecha(hoy, -6);
  const hasta = sp.hasta && FECHA.test(sp.hasta) ? sp.hasta : hoy;
  const turno = sp.turno && /^[0-9a-f-]{36}$/i.test(sp.turno) ? sp.turno : null;
  const tipo = TIPOS_FILTRO.some((t) => t.valor === sp.tipo) ? sp.tipo! : null;
  const metodo = sp.metodo && sp.metodo in ETIQUETA_METODO ? sp.metodo : null;
  const pagina = Math.max(1, Number(sp.pag) || 1);
  const mov = sp.mov && /^[a-z_]+:[0-9a-f-]{36}$/i.test(sp.mov) ? sp.mov : null;

  const [{ data, error }, { data: turnosCrudo }] = await Promise.all([
    supabase.rpc("caja_movimientos", { p_desde: desde, p_hasta: hasta, p_turno: turno, p_tipo: tipo, p_metodo: metodo, p_limite: POR_PAGINA, p_desplazamiento: (pagina - 1) * POR_PAGINA }),
    // Los turnos que esta persona puede ver (la RLS de turnos_caja: admin todos; recepción los suyos y el abierto).
    supabase.from("turnos_caja").select("id, estado, abierto_at").is("deleted_at", null).order("abierto_at", { ascending: false }).limit(40),
  ]);
  const r = (data ?? { total: 0, ciego: false, totales_por_metodo: null, movimientos: [] }) as { total: number; ciego: boolean; totales_por_metodo: Record<string, number> | null; movimientos: MovimientoCaja[] };
  const turnos = (turnosCrudo ?? []) as { id: string; estado: string; abierto_at: string }[];
  const base = { desde, hasta, turno: turno ?? undefined, tipo: tipo ?? undefined, metodo: metodo ?? undefined };
  const enlace = (extra: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...base, pag: pagina > 1 ? pagina : undefined, ...extra })) if (v !== undefined && v !== "") q.set(k, String(v));
    return `/caja/historial?${q.toString()}`;
  };
  const paginas = Math.max(1, Math.ceil(Number(r.total) / POR_PAGINA));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Enlace href="/caja" className="text-sm">← Caja</Enlace>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Historial de caja</h1>
        <p className="mt-1 text-n-600">Cobros, abonos, devoluciones, anulaciones, retiros, gastos y efectivo agregado, del turno abierto y de turnos anteriores. Toca uno para ver su detalle.</p>
      </div>

      <form method="get" action="/caja/historial" role="search" className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 shadow-tarjeta md:grid-cols-6 md:items-end" data-filtros-historial>
        <label className="flex flex-col gap-1 text-sm font-semibold text-n-800">Desde<input type="date" name="desde" defaultValue={desde} className={campo} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-n-800">Hasta<input type="date" name="hasta" defaultValue={hasta} className={campo} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-n-800">
          Turno
          <select name="turno" defaultValue={turno ?? ""} className={campo}>
            <option value="">Todos</option>
            {turnos.map((t) => (
              <option key={t.id} value={t.id}>{t.estado === "abierto" ? "El abierto" : `Del ${formatearFechaCalendario(fechaLocalDeInstante(t.abierto_at, zona))}`}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-n-800">
          Tipo
          <select name="tipo" defaultValue={tipo ?? ""} className={campo}>
            <option value="">Todos</option>
            {TIPOS_FILTRO.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-n-800">
          Forma de pago
          <select name="metodo" defaultValue={metodo ?? ""} className={campo}>
            <option value="">Todas</option>
            {Object.entries(ETIQUETA_METODO).map(([v, e]) => <option key={v} value={v}>{e}</option>)}
          </select>
        </label>
        <Button type="submit" sinBloqueo>Filtrar</Button>
      </form>

      {error && <Alert variante="error" titulo="No pudimos cargar el historial">{error.message}</Alert>}
      {r.ciego && (
        <p className="rounded-lg border border-ambar-oscuro/30 bg-ambar-suave px-4 py-3 text-sm text-ambar-oscuro" data-historial-ciego>
          Corte ciego: con el turno abierto, sus montos y los totales no se muestran hasta cerrarlo. Los turnos ya cerrados sí los enseñan.
        </p>
      )}
      {r.totales_por_metodo && Object.keys(r.totales_por_metodo).length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border bg-card p-4 text-sm shadow-tarjeta" data-totales-historial>
          {Object.entries(r.totales_por_metodo).map(([m, s]) => (
            <div key={m}><dt className="text-n-600">{ETIQUETA_METODO[m] ?? m}</dt><dd className="font-semibold tabular-nums text-n-900">{dinero(Number(s))}</dd></div>
          ))}
        </dl>
      )}

      <div className={mov ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start" : ""}>
        {mov && (
          <aside className="order-first rounded-lg border border-border bg-card p-4 shadow-tarjeta lg:sticky lg:top-20 lg:order-last" aria-label="Detalle del movimiento" data-detalle-movimiento>
            <div className="mb-2 flex justify-end">
              <Enlace href={enlace({ mov: undefined })} className="text-sm">Cerrar</Enlace>
            </div>
            <DetalleMovimiento mov={mov} zona={zona} />
          </aside>
        )}
        <section className="flex min-w-0 flex-col gap-3">
          <p className="text-sm text-n-600" data-total-historial={r.total}>{r.total} {Number(r.total) === 1 ? "movimiento" : "movimientos"} del {formatearFechaCalendario(desde)} al {formatearFechaCalendario(hasta)}</p>
          {r.movimientos.length === 0 ? (
            <p className="rounded-lg border border-border bg-card p-6 text-center text-n-600 shadow-tarjeta">No hay movimientos con esos filtros.</p>
          ) : (
            <TablaResponsiva className="w-full border-collapse text-sm" data-tabla-historial>
              <thead>
                <tr>
                  {["Hora", "Movimiento", "Cliente o cuenta", "Forma de pago", "Monto", "Quién"].map((c) => (
                    <th key={c} className={`border-b border-border bg-n-100 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-n-600 ${c === "Monto" ? "text-right" : "text-left"}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-n-800">
                {r.movimientos.map((m) => {
                  const e = etiquetaMovimiento(m);
                  const elegido = mov === `${m.tipo}:${m.id}`;
                  return (
                    <tr key={`${m.tipo}:${m.id}`} className={elegido ? "bg-morado-suave/60" : undefined} data-movimiento={`${m.tipo}:${m.id}`}>
                      <td className="whitespace-nowrap border-b border-border px-3 py-2">
                        <Enlace href={enlace({ mov: `${m.tipo}:${m.id}` })} data-abrir-movimiento>
                          {fechaLocalDeInstante(m.fecha, zona) === hoy ? "Hoy" : formatearFechaCalendario(fechaLocalDeInstante(m.fecha, zona))} · {horaLocalDeInstante(m.fecha, zona)}
                        </Enlace>
                      </td>
                      <td className="border-b border-border px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.clase}`}>{e.etiqueta}</span>
                        {m.turno_abierto && <span className="ml-1 text-xs text-n-500">turno abierto</span>}
                      </td>
                      <td className="border-b border-border px-3 py-2">{m.cliente_nombre || m.descripcion || "—"}</td>
                      <td className="border-b border-border px-3 py-2">{m.metodo ? ETIQUETA_METODO[m.metodo] ?? m.metodo : "—"}</td>
                      <td className="border-b border-border px-3 py-2 text-right tabular-nums" data-monto={m.monto ?? ""}>{m.monto == null ? <span className="text-n-500" title="Corte ciego">Al cerrar</span> : dinero(Number(m.monto))}</td>
                      <td className="border-b border-border px-3 py-2">{m.hecho_por || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TablaResponsiva>
          )}
          {paginas > 1 && (
            <nav className="flex flex-wrap items-center gap-3 text-sm" aria-label="Páginas">
              {pagina > 1 && <Enlace href={enlace({ pag: pagina - 1 })}>← Anteriores</Enlace>}
              <span className="text-n-600">Página {pagina} de {paginas}</span>
              {pagina < paginas && <Enlace href={enlace({ pag: pagina + 1 })} data-pagina-siguiente>Siguientes →</Enlace>}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
