import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { NEGOCIO_ORIGINAL_ID } from "@/lib/negocio/legado";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Antiguedad } from "@/components/ui/antiguedad";
import { Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { haceCuanto } from "@/lib/antiguedad";
import { moneda } from "@/lib/empleados/textos";
import { COLUMNAS_GASTO, METODOS_GASTO, mesAnterior, montoEnRango, rangoMes, type GastoFila } from "@/lib/gastos/textos";
import { CamposPago, type Opcion } from "./campos-gasto";
import { CampoComprobante } from "./campo-comprobante";
import { adjuntarComprobante, cancelarGasto, corregirGasto, pagarGastoEsperado, registrarGasto } from "./gastos-actions";

type PorAtender = { id: string; concepto: string; categoria: string; monto_estimado: number | null; vencimiento: string; dias: number; vencido: boolean };

const nombreMes = (mes: string) =>
  new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1));

// Gastos del local: lo que hay que pagar, registrar un gasto, y en qué se
// fue el dinero del mes (repartido por el periodo que cubre cada gasto).
export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string; cancelado?: string }> }) {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const esAdmin = sesion?.rol === "admin";
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? (sp.mes as string) : hoy.slice(0, 7);
  const { desde, hasta } = rangoMes(mes);
  const anterior = rangoMes(mesAnterior(mes));

  const [{ data: porAtender, error: errorAtender }, { data: categorias }, { data: proveedores }, { data: delMes }, { data: resumen }, { data: resumenAnterior }, { data: turno }] =
    await Promise.all([
      supabase.rpc("gastos_por_atender"),
      supabase.from("categorias_gasto").select("id, nombre").is("deleted_at", null).order("orden"),
      supabase.from("proveedores").select("id, nombre").is("deleted_at", null).order("nombre"),
      // Lo pagado en el mes, y lo que sin pagarse en el mes cubre parte de él.
      supabase
        .from("gastos")
        .select(COLUMNAS_GASTO)
        .is("deleted_at", null)
        .neq("estado", "pendiente")
        .or(`and(fecha_pago.gte.${desde},fecha_pago.lte.${hasta}),and(periodo_desde.lte.${hasta},periodo_hasta.gte.${desde})`)
        .order("fecha_pago", { ascending: false }),
      supabase.rpc("gastos_por_categoria_periodo", { p_desde: desde, p_hasta: hasta }),
      supabase.rpc("gastos_por_categoria_periodo", { p_desde: anterior.desde, p_hasta: anterior.hasta }),
      supabase.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle(),
    ]);
  const pendientes = ((porAtender ?? []) as PorAtender[]).sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
  const { data: periodosPendientes } = pendientes.length
    ? await supabase.from("gastos").select("id, periodo_desde, periodo_hasta").in("id", pendientes.map((p) => p.id))
    : { data: [] };
  const periodoDe = new Map((periodosPendientes ?? []).map((g) => [g.id as string, g]));
  const gastos = (delMes ?? []) as unknown as GastoFila[];

  // Comprobantes: los firma el servidor (el bucket no tiene políticas).
  // PeluDesk: la secret key firma cualquier ruta, así que solo se firman
  // las de ESTE negocio (`{negocio}/gastos/…`; las `gastos/…` de antes de
  // PeluDesk son todas de Ludogteka).
  const negocio = await negocioActual();
  const esDeEsteNegocio = (ruta: string) =>
    ruta.startsWith(`${negocio.id}/gastos/`) || (ruta.startsWith("gastos/") && negocio.id === NEGOCIO_ORIGINAL_ID);
  const conFoto = gastos.filter((g) => g.comprobante_path && esDeEsteNegocio(g.comprobante_path as string));
  const firmadas = conFoto.length
    ? await createSupabaseAdminClient(negocio.id).storage.from("gastos-comprobantes").createSignedUrls(conFoto.map((g) => g.comprobante_path as string), 3600)
    : { data: [] };
  const urlDe = new Map((firmadas.data ?? []).map((f) => [f.path, f.signedUrl]));
  const ajustesDe = (id: string) => gastos.filter((g) => g.ajuste_de === id && g.estado === "pagado");

  const filasResumen = ((resumen ?? []) as { categoria_id: string; categoria: string; monto: number }[]).map((r) => ({
    ...r,
    anterior: Number(((resumenAnterior ?? []) as { categoria_id: string; monto: number }[]).find((a) => a.categoria_id === r.categoria_id)?.monto ?? 0),
  }));
  const total = filasResumen.reduce((s, r) => s + Number(r.monto), 0);
  const totalAnterior = filasResumen.reduce((s, r) => s + r.anterior, 0);
  const cats: Opcion[] = (categorias ?? []) as Opcion[];
  const provs: Opcion[] = (proveedores ?? []) as Opcion[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Gastos del local</h1>
          <p className="mt-1 max-w-3xl text-n-600">
            Renta, luz, camioneta y todo lo que cuesta operar. Un gasto que cubre varios meses se reparte entre ellos en la utilidad.
            Nada se borra: se cancela con motivo o se corrige.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/gastos/recurrentes">
            <Button type="button" variante="secundario">Gastos recurrentes</Button>
          </Link>
          {esAdmin && (
            <Link href="/gastos/categorias">
              <Button type="button" variante="secundario">Categorías</Button>
            </Link>
          )}
        </div>
      </div>

      {sp.cancelado !== undefined && (
        <Alert variante="exito" titulo="Gasto cancelado">
          {sp.cancelado || "Se conserva en la lista con su motivo; ya no cuenta en la utilidad."}
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Por pagar</h2>
        {errorAtender ? (
          <Alert variante="error" titulo="No pudimos cargar los pendientes">{errorAtender.message}</Alert>
        ) : pendientes.length === 0 ? (
          <p className="text-sm text-n-600">Nada vencido ni por vencer en los próximos 7 días.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pendientes.map((p) => {
              const per = periodoDe.get(p.id);
              return (
                <li key={p.id} className={`flex flex-col gap-2 rounded-lg border bg-white p-3 ${p.vencido ? "border-naranja" : "border-n-200"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <p className="font-semibold text-n-900">
                        {p.concepto} <span className="text-sm font-normal text-n-500">· {p.categoria}</span>
                      </p>
                      <p className="text-sm text-n-600">
                        Vence el {formatearFechaCalendario(p.vencimiento)}
                        {p.monto_estimado ? ` · estimado ${moneda(p.monto_estimado)}` : ""}
                      </p>
                      <Antiguedad
                        dias={p.vencido ? p.dias : 0}
                        texto={p.vencido ? `Vencido ${haceCuanto(p.dias)}` : p.dias === 0 ? "Vence hoy" : `Vence en ${p.dias} ${p.dias === 1 ? "día" : "días"}`}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Desplegable texto="Marcar pagado" variante="primario">
                      <FormularioAccion accion={pagarGastoEsperado.bind(null, p.id)} textoBoton="Marcar pagado" variante="exito" textoExito="Marcado como pagado">
                        <CamposPago
                          hoy={hoy}
                          proveedores={provs}
                          montoSugerido={p.monto_estimado}
                          cubreDesde={per?.periodo_desde?.slice(0, 7)}
                          cubreHasta={per?.periodo_hasta?.slice(0, 7)}
                        />
                      </FormularioAccion>
                    </Desplegable>
                    <Desplegable texto="No se paga">
                      <FormularioAccion accion={cancelarGasto.bind(null, p.id)} textoBoton="Cancelar este pago" variante="peligro">
                        <Textarea label="¿Por qué?" name="motivo" rows={2} required />
                        <input type="hidden" name="mes" value={mes} />
                      </FormularioAccion>
                    </Desplegable>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Registrar un gasto</h2>
        {!turno && <p className="text-sm text-n-600">No hay turno de caja abierto: para pagar con efectivo del cajón, primero abre el turno.</p>}
        <FormularioAccion accion={registrarGasto} textoBoton="Registrar gasto" textoExito="Gasto registrado" reiniciar>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Concepto" name="concepto" required placeholder="Recibo de luz, gasolina, volantes…" />
            <Select label="Categoría" name="categoria_id" required defaultValue="">
              <option value="" disabled>
                Elige
              </option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
          <CamposPago hoy={hoy} proveedores={provs} />
        </FormularioAccion>
      </section>

      <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-bold capitalize text-n-900">{nombreMes(mes)}</h2>
          <form className="flex items-end gap-2">
            <Field label="Mes" name="mes" type="month" defaultValue={mes} />
            <Button type="submit" variante="secundario">Ver</Button>
          </form>
        </div>
        <div className="overflow-x-auto rounded-lg border border-n-200 bg-white">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="bg-n-100 text-left text-xs font-bold uppercase tracking-wide text-n-600">
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2 text-right">Este mes</th>
                <th className="px-3 py-2 text-right capitalize">{nombreMes(mesAnterior(mes))}</th>
                <th className="px-3 py-2 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {filasResumen
                .filter((r) => Number(r.monto) || r.anterior)
                .map((r) => {
                  const dif = Number(r.monto) - r.anterior;
                  return (
                    <tr key={r.categoria_id} className="border-t border-n-200">
                      <td className="px-3 py-2 font-semibold text-n-900">{r.categoria}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{moneda(r.monto)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-n-600">{moneda(r.anterior)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${dif > 0 ? "text-naranja-oscuro" : "text-verde-oscuro"}`}>
                        {dif > 0 ? "+" : ""}
                        {moneda(dif)}
                      </td>
                    </tr>
                  );
                })}
              <tr className="border-t-2 border-n-300 font-bold">
                <td className="px-3 py-2 text-n-900">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{moneda(total)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-n-600">{moneda(totalAnterior)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${total - totalAnterior > 0 ? "text-naranja-oscuro" : "text-verde-oscuro"}`}>
                  {total - totalAnterior > 0 ? "+" : ""}
                  {moneda(total - totalAnterior)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-n-500">Cada gasto cuenta en los meses que cubre, repartido por días: la luz bimestral pagada este mes carga la mitad aquí.</p>

        {gastos.filter((g) => g.tipo === "gasto").length === 0 ? (
          <p className="text-sm text-n-600">No hay gastos en este mes.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {gastos
              .filter((g) => g.tipo === "gasto")
              .map((g) => {
                const ajustes = ajustesDe(g.id);
                const vigente = Number(g.monto ?? 0) + ajustes.reduce((s, a) => s + Number(a.monto ?? 0), 0);
                const varios = g.periodo_desde.slice(0, 7) !== g.periodo_hasta.slice(0, 7);
                const cancelado = g.estado === "cancelado";
                const url = g.comprobante_path ? urlDe.get(g.comprobante_path) : null;
                return (
                  <li key={g.id} className={`flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-3 ${cancelado ? "opacity-70" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <p className={`font-semibold text-n-900 ${cancelado ? "line-through" : ""}`}>
                          {g.concepto} <span className="text-sm font-normal text-n-500">· {g.categorias_gasto?.nombre}</span>
                        </p>
                        <p className="text-sm text-n-600">
                          {g.fecha_pago && `Pagado el ${formatearFechaCalendario(g.fecha_pago)}`} · {METODOS_GASTO[g.metodo ?? ""] ?? g.metodo}
                          {g.proveedores?.nombre && ` · ${g.proveedores.nombre}`}
                          {g.mp_orden_id && " · registrado solo al cobrar con Mercado Pago"}
                        </p>
                        {varios && (
                          <p className="text-xs text-n-600">
                            Cubre del {formatearFechaCalendario(g.periodo_desde)} al {formatearFechaCalendario(g.periodo_hasta)}: a este mes le tocan{" "}
                            {moneda(montoEnRango(vigente, g.periodo_desde, g.periodo_hasta, desde, hasta))}
                          </p>
                        )}
                        {ajustes.map((a) => (
                          <p key={a.id} className="text-xs text-n-600">
                            Corrección del {formatearFechaCalendario(a.fecha_pago as string)}: {Number(a.monto) > 0 ? "+" : ""}
                            {moneda(a.monto)} · {a.notas}
                          </p>
                        ))}
                        {cancelado && <p className="text-xs font-semibold text-naranja-oscuro">Cancelado: {g.motivo_cancelacion}</p>}
                        {g.notas && !cancelado && <p className="text-xs text-n-500">{g.notas}</p>}
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="w-fit text-sm font-semibold text-azul hover:underline">
                            Ver comprobante
                          </a>
                        )}
                      </div>
                      <span className={`text-lg font-bold tabular-nums ${cancelado ? "text-n-400" : "text-n-900"}`}>{moneda(vigente)}</span>
                    </div>
                    {!cancelado && (
                      <div className="flex flex-wrap gap-2">
                        <Desplegable texto="Corregir monto">
                          <FormularioAccion accion={corregirGasto.bind(null, g.id)} textoBoton="Guardar corrección">
                            <Field label="Monto correcto" name="monto" type="number" step="0.01" min="0" defaultValue={vigente} required />
                            <Textarea label="Motivo" name="motivo" rows={2} required ayuda="Se registra un ajuste por la diferencia; el original no se toca." />
                          </FormularioAccion>
                        </Desplegable>
                        {!g.comprobante_path && (
                          <Desplegable texto="Adjuntar comprobante">
                            <FormularioAccion accion={adjuntarComprobante.bind(null, g.id)} textoBoton="Guardar foto">
                              <CampoComprobante etiqueta="Foto del comprobante o ticket" />
                            </FormularioAccion>
                          </Desplegable>
                        )}
                        <Desplegable texto="Cancelar">
                          <FormularioAccion accion={cancelarGasto.bind(null, g.id)} textoBoton="Cancelar gasto" variante="peligro">
                            <Textarea
                              label="¿Por qué se cancela?"
                              name="motivo"
                              rows={2}
                              required
                              ayuda={g.metodo === "efectivo_caja" ? "Si su turno de caja sigue abierto, su retiro también se quita (el dinero se queda en el cajón)." : undefined}
                            />
                            <input type="hidden" name="mes" value={mes} />
                          </FormularioAccion>
                        </Desplegable>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
