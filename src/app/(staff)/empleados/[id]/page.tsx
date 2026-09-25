import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatearFecha, formatearFechaCalendario, hoyNegocio, sumarDiasFecha } from "@/lib/formato";
import { DIAS_SEMANA, METODOS_PAGO, PERIODICIDADES, hora, horaCampo, moneda, textoEsquema } from "@/lib/empleados/textos";
import type { DiaAsistencia, PagoNomina } from "@/lib/empleados/tipos";
import { BotonAccion, Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { CamposEmpleado, type CuentaLigable } from "../campos-empleado";
import { ResumenAsistencia, TablaAsistencia, type Correccion } from "../tabla-asistencia";
import { COLUMNAS_AUSENCIA, FormularioSolicitarAusencia, ListaAusencias, type Ausencia } from "../ausencias-lista";
import { ListaPagos } from "../nomina-vistas";
import { actualizarEmpleado, darDeBajaEmpleado, guardarHorario, reactivarEmpleado } from "../empleados-actions";
import { ajustarVacaciones } from "../ausencias-actions";
import { cancelarAdelanto, guardarEsquema, registrarAdelanto } from "../nomina-actions";
import { zonaActual } from "@/lib/negocio/actual";

type Esquema = {
  id: string;
  vigente_desde: string;
  sueldo_monto: number | null;
  sueldo_periodicidad: string | null;
  pago_por_dia: number | null;
  con_comision: boolean;
  comision_tipo: string | null;
  comision_valor: number | null;
  recibe_propinas: boolean;
  notas: string | null;
  created_at: string;
};

function Seccion({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
      <div>
        <h2 className="text-lg font-bold text-n-900">{titulo}</h2>
        {sub && <p className="text-sm text-n-600">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function EmpleadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string; creado?: string }>;
}) {
  const zona = await zonaActual();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const esAdmin = sesion?.rol === "admin";
  const puedeNomina = tienePermiso(sesion, "nomina");
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);
  const hasta = sp.hasta || hoy;
  const desde = sp.desde || sumarDiasFecha(hasta, -13);

  const { data: e } = await supabase.from("empleados").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!e) notFound();
  const esSuyo = e.profile_id && e.profile_id === sesion?.user.id;
  const puedePedirPorEl = esAdmin || esSuyo || (sesion?.rol === "recepcion" && !e.profile_id);

  const [{ data: dias, error: errorDias }, { data: horario }, { data: ausencias }, { data: saldo }] = await Promise.all([
    supabase.rpc("asistencia_periodo", { p_desde: desde, p_hasta: hasta, p_empleado_id: id }),
    supabase.from("empleados_horario").select("dia_semana, hora_entrada, hora_salida").eq("empleado_id", id).is("deleted_at", null).order("dia_semana"),
    supabase.from("ausencias").select(COLUMNAS_AUSENCIA).eq("empleado_id", id).is("deleted_at", null).order("desde", { ascending: false }).limit(30),
    supabase.rpc("saldo_vacaciones", { p_empleado_id: id }),
  ]);
  const diasAsistencia = (dias ?? []) as DiaAsistencia[];
  const idsAsistencia = diasAsistencia.map((d) => d.asistencia_id).filter(Boolean) as string[];
  const { data: correcciones } = idsAsistencia.length
    ? await supabase.from("asistencia_correcciones").select("asistencia_id, entrada_anterior, salida_anterior, entrada_nueva, salida_nueva, motivo, created_at").in("asistencia_id", idsAsistencia).order("created_at")
    : { data: [] };
  const horarioDe = new Map((horario ?? []).map((h) => [h.dia_semana as number, h]));

  // Dinero: solo con «Nómina».
  let esquemas: Esquema[] = [];
  let adelantos: { id: string; monto: number; fecha: string; metodo: string; motivo: string | null; pago_id: string | null; cancelado: boolean; motivo_cancelacion: string | null }[] = [];
  let pagos: PagoNomina[] = [];
  let cuentas: CuentaLigable[] = [];
  let movimientosVacaciones: { dias: number; tipo: string; motivo: string; created_at: string }[] = [];
  if (puedeNomina) {
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from("esquemas_pago").select("*").eq("empleado_id", id).is("deleted_at", null).order("vigente_desde", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("adelantos").select("id, monto, fecha, metodo, motivo, pago_id, cancelado, motivo_cancelacion").eq("empleado_id", id).is("deleted_at", null).order("fecha", { ascending: false }),
      supabase.from("nomina_pagos").select("*").eq("empleado_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.rpc("cuentas_para_empleado"),
    ]);
    esquemas = (r1.data ?? []) as Esquema[];
    adelantos = r2.data ?? [];
    pagos = (r3.data ?? []) as PagoNomina[];
    cuentas = (r4.data ?? []) as CuentaLigable[];
  }
  if (esAdmin || puedeNomina) {
    const { data } = await supabase.from("vacaciones_movimientos").select("dias, tipo, motivo, created_at").eq("empleado_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(20);
    movimientosVacaciones = data ?? [];
  }
  const vigente = esquemas.find((x) => x.vigente_desde <= hoy) ?? null;
  const dadoDeBaja = Boolean(e.fecha_baja && e.fecha_baja < hoy);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/empleados" className="text-sm font-semibold text-morado hover:underline">
          ← Empleados
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">{e.nombre}</h1>
        <p className="mt-1 text-n-600">
          {e.puesto} · desde el {formatearFechaCalendario(e.fecha_ingreso)}
          {e.telefono && ` · ${e.telefono}`}
          {e.profile_id ? " · usa la app" : " · sin cuenta en la app"}
        </p>
        {(e.emergencia_nombre || e.emergencia_telefono) && (
          <p className="text-sm text-n-600">
            Emergencias: {e.emergencia_nombre ?? "—"}
            {e.emergencia_parentesco && ` (${e.emergencia_parentesco})`}
            {e.emergencia_telefono && ` · ${e.emergencia_telefono}`}
          </p>
        )}
      </div>

      {sp.creado && <Alert variante="exito" titulo="Empleado dado de alta">Ahora captura su horario{puedeNomina ? " y cómo se le paga" : ""}.</Alert>}
      {dadoDeBaja && (
        <Alert variante="advertencia" titulo={`Dado de baja el ${formatearFechaCalendario(e.fecha_baja)}`}>
          {e.motivo_baja}. Su asistencia y sus pagos se conservan.
        </Alert>
      )}

      <Seccion titulo="Asistencia" sub="Retardos y faltas contra su horario, con la hora del negocio.">
        <form className="flex flex-wrap items-end gap-3">
          <Field label="Desde" name="desde" type="date" defaultValue={desde} />
          <Field label="Hasta" name="hasta" type="date" defaultValue={hasta} />
          <Button type="submit" variante="secundario">Ver</Button>
        </form>
        {errorDias ? (
          <Alert variante="error" titulo="No pudimos cargar la asistencia">{errorDias.message}</Alert>
        ) : (
          <>
            <ResumenAsistencia dias={diasAsistencia} />
            <TablaAsistencia zona={zona} dias={diasAsistencia} empleadoId={id} puedeCorregir={esAdmin} correcciones={(correcciones ?? []) as Correccion[]} />
            {esAdmin && <p className="text-xs text-n-500">Solo admin corrige, y cada corrección guarda el registro original y el motivo.</p>}
          </>
        )}
      </Seccion>

      <Seccion titulo="Horario" sub="Cambiarlo vale desde hoy: los días de antes se siguen midiendo contra el horario que tenía.">
        {puedeNomina ? (
          <FormularioAccion accion={guardarHorario.bind(null, id)} textoBoton="Guardar horario">
            <div className="grid gap-2">
              {DIAS_SEMANA.map((nombre, d) => (
                <div key={d} className="grid grid-cols-[7rem_1fr_1fr] items-end gap-3">
                  <span className="pb-3 font-semibold text-n-800">{nombre}</span>
                  <Field label="Entrada" name={`entrada_${d}`} type="time" defaultValue={horaCampo(horarioDe.get(d)?.hora_entrada as string | undefined)} />
                  <Field label="Salida" name={`salida_${d}`} type="time" defaultValue={horaCampo(horarioDe.get(d)?.hora_salida as string | undefined)} />
                </div>
              ))}
            </div>
            <p className="text-sm text-n-600">Deja vacío el día que descansa.</p>
          </FormularioAccion>
        ) : (horario ?? []).length === 0 ? (
          <p className="text-sm text-n-600">Sin horario capturado.</p>
        ) : (
          <ul className="text-sm text-n-700">
            {(horario ?? []).map((h) => (
              <li key={h.dia_semana as number}>
                {DIAS_SEMANA[h.dia_semana as number]}: {hora(h.hora_entrada as string)}–{hora(h.hora_salida as string)}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Ausencias" sub="Vacaciones, incapacidad, día personal o falta justificada. Las aprueba un admin.">
        {saldo !== null && saldo !== undefined && (
          <p className="text-n-800">
            Saldo de vacaciones: <strong>{Number(saldo)} {Number(saldo) === 1 ? "día" : "días"}</strong>
          </p>
        )}
        {esAdmin && (
          <Desplegable texto="Asignar o ajustar días de vacaciones">
            <FormularioAccion accion={ajustarVacaciones.bind(null, id)} textoBoton="Guardar" reiniciar>
              <div className="grid gap-3 sm:grid-cols-3">
                <Select label="Movimiento" name="tipo" defaultValue="asignacion">
                  <option value="asignacion">Asignar (suma)</option>
                  <option value="ajuste">Ajuste (suma o resta)</option>
                </Select>
                <Field label="Días" name="dias" type="number" step="0.5" required ayuda="En un ajuste, negativo para quitar." />
                <Field label="Motivo" name="motivo" required placeholder="Primer año, corrección…" />
              </div>
            </FormularioAccion>
          </Desplegable>
        )}
        {movimientosVacaciones.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-n-700">Movimientos del saldo</summary>
            <ul className="mt-2 flex flex-col gap-1 text-n-700">
              {movimientosVacaciones.map((m) => (
                <li key={m.created_at}>
                  {formatearFecha(m.created_at, zona)} · {Number(m.dias) > 0 ? "+" : ""}
                  {Number(m.dias)} · {m.motivo}
                </li>
              ))}
            </ul>
          </details>
        )}
        <ListaAusencias zona={zona} ausencias={(ausencias ?? []) as unknown as Ausencia[]} esAdmin={esAdmin} puedeCancelarSolicitadas={Boolean(puedePedirPorEl)} vacio="Sin ausencias registradas." />
        {puedePedirPorEl && !dadoDeBaja && (
          <Desplegable texto={esSuyo ? "Pedir una ausencia" : "Pedir una ausencia por esta persona"}>
            <FormularioSolicitarAusencia empleadoId={id} hoy={hoy} />
          </Desplegable>
        )}
      </Seccion>

      {puedeNomina && (
        <>
          <Seccion titulo="Cómo se le paga" sub="Cambiarlo es capturar un esquema nuevo con su fecha: el anterior queda en el historial y los pagos hechos no cambian.">
            {vigente ? (
              <p className="rounded-md border border-n-200 bg-white p-3 text-n-800">
                {textoEsquema(vigente)} <span className="text-sm text-n-500">· desde el {formatearFechaCalendario(vigente.vigente_desde)}</span>
              </p>
            ) : (
              <Alert variante="advertencia" titulo="Sin esquema de pago">Captúralo para que la nómina calcule sueldo o pago por día.</Alert>
            )}
            <Desplegable texto={vigente ? "Cambiar esquema de pago" : "Capturar esquema de pago"}>
              <FormularioAccion accion={guardarEsquema.bind(null, id)} textoBoton="Guardar esquema">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Vale desde" name="vigente_desde" type="date" defaultValue={hoy} required />
                  <Field label="Sueldo fijo (opcional)" name="sueldo_monto" type="number" step="0.01" min="0" defaultValue={vigente?.sueldo_monto ?? ""} />
                  <Select label="Cada cuándo" name="sueldo_periodicidad" defaultValue={vigente?.sueldo_periodicidad ?? "quincenal"}>
                    {Object.entries(PERIODICIDADES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                  <Field label="Pago por día trabajado (opcional)" name="pago_por_dia" type="number" step="0.01" min="0" defaultValue={vigente?.pago_por_dia ?? ""} />
                </div>
                <label className="flex items-center gap-2 text-n-800">
                  <input type="checkbox" name="con_comision" defaultChecked={vigente?.con_comision ?? false} className="h-5 w-5" />
                  Gana comisión por los servicios de estética que atiende
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select label="Comisión por omisión" name="comision_tipo" defaultValue={vigente?.comision_tipo ?? ""} ayuda="Para los servicios sin regla propia (en Comisiones).">
                    <option value="">Solo la regla de cada servicio</option>
                    <option value="porcentaje">Porcentaje del precio</option>
                    <option value="monto">Monto fijo por servicio</option>
                  </Select>
                  <Field label="Cuánto (% o $)" name="comision_valor" type="number" step="0.01" min="0" defaultValue={vigente?.comision_valor ?? ""} />
                </div>
                <label className="flex items-center gap-2 text-n-800">
                  <input type="checkbox" name="recibe_propinas" defaultChecked={vigente?.recibe_propinas ?? true} className="h-5 w-5" />
                  Recibe las propinas de los clientes que atiende
                </label>
                <Textarea label="Notas (opcional)" name="notas" rows={2} />
              </FormularioAccion>
            </Desplegable>
            {esquemas.length > 1 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-n-700">Historial de esquemas</summary>
                <ul className="mt-2 flex flex-col gap-1 text-n-700">
                  {esquemas.map((x) => (
                    <li key={x.id}>
                      Desde el {formatearFechaCalendario(x.vigente_desde)}: {textoEsquema(x)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Seccion>

          <Seccion titulo="Adelantos" sub="Se descuentan solos del siguiente pago.">
            {adelantos.length === 0 ? (
              <p className="text-sm text-n-600">Sin adelantos.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {adelantos.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-n-200 bg-white p-3 text-sm">
                    <span className={a.cancelado ? "text-n-500 line-through" : "text-n-800"}>
                      {formatearFechaCalendario(a.fecha)} · {moneda(a.monto)} · {METODOS_PAGO[a.metodo] ?? a.metodo}
                      {a.motivo && ` · ${a.motivo}`}
                    </span>
                    <span className="text-xs font-semibold text-n-600">
                      {a.cancelado ? `Cancelado: ${a.motivo_cancelacion}` : a.pago_id ? "Ya descontado" : "Por descontar"}
                    </span>
                    {!a.cancelado && !a.pago_id && (
                      <Desplegable texto="Cancelar">
                        <FormularioAccion accion={cancelarAdelanto.bind(null, a.id, id)} textoBoton="Cancelar adelanto" variante="peligro">
                          <Textarea label="Motivo" name="motivo" rows={2} required />
                        </FormularioAccion>
                      </Desplegable>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Desplegable texto="Registrar adelanto">
              <FormularioAccion accion={registrarAdelanto.bind(null, id)} textoBoton="Registrar adelanto" reiniciar>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Monto" name="monto" type="number" step="0.01" min="0" required />
                  <Field label="Fecha" name="fecha" type="date" defaultValue={hoy} required />
                  <Select label="Método" name="metodo" defaultValue="efectivo">
                    {Object.entries(METODOS_PAGO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </div>
                <Field label="Motivo (opcional)" name="motivo" />
              </FormularioAccion>
            </Desplegable>
          </Seccion>

          <Seccion titulo="Pagos" sub="Para pagar un periodo, ve a la pestaña Nómina.">
            <Link href={`/empleados/nomina/${id}`} className="w-fit">
              <Button type="button" variante="secundario">Calcular y pagar un periodo</Button>
            </Link>
            <ListaPagos zona={zona} pagos={pagos} puedeRevertir={puedeNomina} />
          </Seccion>

          <Seccion titulo="Datos del empleado">
            <FormularioAccion accion={actualizarEmpleado.bind(null, id)} textoBoton="Guardar datos" textoExito="Datos guardados">
              <CamposEmpleado cuentas={cuentas} empleadoId={id} valores={e} />
            </FormularioAccion>
            {dadoDeBaja ? (
              <BotonAccion accion={reactivarEmpleado.bind(null, id)} texto="Reactivar" variante="secundario" />
            ) : (
              <Desplegable texto="Dar de baja">
                <FormularioAccion accion={darDeBajaEmpleado.bind(null, id)} textoBoton="Dar de baja" variante="peligro">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Último día que trabajó" name="fecha_baja" type="date" defaultValue={hoy} required />
                    <Field label="Motivo" name="motivo_baja" required />
                  </div>
                  <p className="text-sm text-n-600">No se borra nada: su asistencia, ausencias y pagos se conservan.</p>
                </FormularioAccion>
              </Desplegable>
            )}
          </Seccion>
        </>
      )}
    </div>
  );
}
