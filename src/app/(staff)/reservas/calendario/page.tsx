import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { zonaActual } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { enBloques } from "@/lib/supabase/paginar";
import {
  diasDeLaVista,
  enlaceCalendario,
  ESTADOS_FILTRO,
  leerFiltros,
  moverAncla,
  nivelOcupacion,
  type FiltrosCalendario,
  type NivelOcupacion,
} from "@/lib/reservas/calendario";
import { FilaReserva, type ReservaCalendario } from "./fila-reserva";

// Calendario de reservas de guardería y hotel (QA externa B17): ocupación por día contra el cupo, en
// semana o mes; al tocar un día, sus reservas; y la lista de próximas reservas con filtros. El cupo
// es de TODA la casa (guardería y hotel comparten el espacio), igual que en los tableros de cada módulo.

const TAM_LISTA = 25;
const TOPE_DIA = 60;

type FilaOcupacion = {
  fecha: string;
  cupo_diurno: number | null;
  ocupado_diurno: number;
  cupo_nocturno: number | null;
  ocupado_nocturno: number;
};

type EstanciaCruda = {
  id: string;
  reserva_id: string;
  updated_at: string | null;
  fecha_entrada: string;
  fecha_salida: string;
  estado: string;
  perros: { nombre: string } | { nombre: string }[] | null;
  servicios: { nombre: string; categoria: string } | { nombre: string; categoria: string }[] | null;
  reservas: { clientes: { nombre: string } | { nombre: string }[] | null } | { clientes: { nombre: string } | { nombre: string }[] | null }[] | null;
};

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

const SELECT_ESTANCIA =
  "id, reserva_id, fecha_entrada, fecha_salida, estado, updated_at, perros(nombre), servicios!inner(nombre, categoria), reservas(clientes(nombre))";

const ESTILO_NIVEL: Record<NivelOcupacion, string> = {
  sin_cupo: "border-n-200 bg-n-50",
  libre: "border-n-200 bg-white",
  normal: "border-menta bg-menta-suave",
  alto: "border-ambar bg-ambar-suave",
  lleno: "border-coral-oscuro bg-coral-suave",
};

const NOMBRE_MES = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" });
const NOMBRE_DIA = new Intl.DateTimeFormat("es-MX", { weekday: "short" });
const NOMBRE_DIA_LARGO = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
const aFecha = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
};

export default async function CalendarioReservasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createSupabaseServerClient();
  const [sp, sesion, zona] = await Promise.all([searchParams, obtenerSesionConRol(), zonaActual()]);
  const hoy = hoyNegocio(zona);
  const f = leerFiltros(sp, hoy);
  const modulos = sesion?.modulos ?? [];
  const conGuarderia = modulos.includes("guarderia");
  const conHotel = modulos.includes("hotel");

  const dias = diasDeLaVista(f.vista, f.fecha);
  const [{ data: ocupacionCruda, error: errorOcupacion }, dia] = await Promise.all([
    supabase.rpc("calendario_ocupacion", { p_desde: dias[0], p_hasta: dias[dias.length - 1] }),
    f.dia ? cargarEstancias(supabase, f, { dia: f.dia, hoy }) : Promise.resolve(null),
  ]);
  const ocupacion = new Map<string, FilaOcupacion>(((ocupacionCruda ?? []) as FilaOcupacion[]).map((o) => [o.fecha, o]));
  const proximas = await cargarEstancias(supabase, f, { proximas: true });

  const cuentas = await cuentasDe(supabase, [...(dia?.filas ?? []), ...proximas.filas].map((e) => e.reserva_id));
  const aReserva = (e: EstanciaCruda): ReservaCalendario => {
    const s = uno(e.servicios);
    const c = uno(uno(e.reservas)?.clientes);
    const cuenta = cuentas.get(e.reserva_id) ?? { texto: "—", tono: "neutro" as const };
    return {
      id: e.id,
      reservaId: e.reserva_id,
      perroNombre: uno(e.perros)?.nombre ?? "—",
      clienteNombre: c?.nombre ?? "—",
      categoria: s?.categoria ?? "",
      servicioNombre: s?.nombre ?? "—",
      fechaEntrada: e.fecha_entrada,
      fechaSalida: e.fecha_salida,
      estado: e.estado,
      version: e.updated_at ?? null,
      cuenta: cuenta.texto,
      cuentaTono: cuenta.tono,
    };
  };

  const enlace = (p: Parameters<typeof enlaceCalendario>[0]) =>
    enlaceCalendario({ vista: f.vista, fecha: f.fecha, modulo: f.modulo, estado: f.estado === "activas" ? undefined : f.estado, desde: f.desde === hoy ? undefined : f.desde, ...p });
  const titulo = f.vista === "mes" ? NOMBRE_MES.format(aFecha(f.fecha)) : `Semana del ${formatearFechaCalendario(dias[0])} al ${formatearFechaCalendario(dias[6])}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/reservas" className="text-sm font-semibold text-morado hover:underline">
          ← Reservas
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Calendario de reservas</h1>
        <p className="mt-1 max-w-2xl text-n-600">
          Cuántos perros hay cada día contra el cupo. Guardería y hotel comparten el mismo espacio, así que el cupo es el de toda la casa. Toca un día para ver sus reservas.
        </p>
      </div>

      <section aria-label="Ocupación por día" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold capitalize text-n-900">{titulo}</h2>
          <nav aria-label="Vista del calendario" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Link href={enlace({ vista: "semana", dia: f.dia ?? undefined })} className={`rounded-md border-[1.5px] px-3 py-2 ${f.vista === "semana" ? "border-morado bg-morado-suave text-morado" : "border-borde bg-white text-n-800"}`} data-vista="semana">
              Semana
            </Link>
            <Link href={enlace({ vista: "mes", dia: f.dia ?? undefined })} className={`rounded-md border-[1.5px] px-3 py-2 ${f.vista === "mes" ? "border-morado bg-morado-suave text-morado" : "border-borde bg-white text-n-800"}`} data-vista="mes">
              Mes
            </Link>
            <span className="mx-1 hidden h-6 w-px bg-n-200 sm:inline-block" aria-hidden="true" />
            <Link href={enlace({ fecha: moverAncla(f.vista, f.fecha, -1), dia: f.dia ?? undefined })} className="rounded-md border-[1.5px] border-borde bg-white px-3 py-2 text-n-800" aria-label="Anterior">
              ←
            </Link>
            <Link href={enlace({ fecha: hoy, dia: f.dia ?? undefined })} className="rounded-md border-[1.5px] border-borde bg-white px-3 py-2 text-n-800">
              Hoy
            </Link>
            <Link href={enlace({ fecha: moverAncla(f.vista, f.fecha, 1), dia: f.dia ?? undefined })} className="rounded-md border-[1.5px] border-borde bg-white px-3 py-2 text-n-800" aria-label="Siguiente">
              →
            </Link>
          </nav>
        </div>

        {errorOcupacion ? (
          <Alert variante="error" titulo="No pudimos cargar la ocupación">
            Recarga la página. Si el problema sigue, avísale al equipo técnico.
          </Alert>
        ) : (
          <>
            <ul className={f.vista === "semana" ? "grid grid-cols-1 gap-2 sm:grid-cols-7" : "grid grid-cols-7 gap-1 sm:gap-2"} data-calendario-grid>
              {dias.map((d) => {
                const o = ocupacion.get(d);
                const nivel = nivelOcupacion(o?.ocupado_diurno ?? 0, o?.cupo_diurno ?? null);
                const hotel = o?.ocupado_nocturno ?? 0;
                const guarderia = Math.max((o?.ocupado_diurno ?? 0) - hotel, 0);
                const fuera = f.vista === "mes" && d.slice(0, 7) !== f.fecha.slice(0, 7);
                const esHoy = d === hoy;
                const elegido = d === f.dia;
                return (
                  <li key={d}>
                    <Link
                      href={enlace({ dia: d }) + "#reservas-del-dia"}
                      scroll={false}
                      data-dia={d}
                      aria-current={elegido ? "date" : undefined}
                      aria-label={`${NOMBRE_DIA_LARGO.format(aFecha(d))}: ${o?.ocupado_diurno ?? 0} de ${o?.cupo_diurno ?? "—"}`}
                      className={`flex h-full flex-col gap-1 rounded-lg border-[1.5px] p-2 transition-colors hover:border-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave ${ESTILO_NIVEL[nivel]} ${fuera ? "opacity-50" : ""} ${elegido ? "ring-[3px] ring-morado" : ""}`}
                    >
                      <span className={`flex items-center gap-1 text-xs font-semibold text-n-600 ${f.vista === "semana" ? "" : "justify-between"}`}>
                        {f.vista === "semana" && <span className="capitalize">{NOMBRE_DIA.format(aFecha(d))}</span>}
                        <span className={`text-sm font-bold ${esHoy ? "rounded-full bg-morado px-1.5 text-white" : "text-n-900"}`}>{Number(d.slice(8))}</span>
                      </span>
                      <span className="tabular-nums text-sm font-bold text-n-900">
                        {o?.ocupado_diurno ?? 0}
                        <span className="font-normal text-n-600">/{o?.cupo_diurno ?? "—"}</span>
                        {nivel === "lleno" && <span className="ml-1 hidden text-xs font-bold text-coral-oscuro sm:inline">Lleno</span>}
                      </span>
                      <span className="hidden text-xs text-n-600 sm:block">
                        {conGuarderia && <span className="block">Guardería {guarderia}</span>}
                        {conHotel && (
                          <span className="block">
                            Hotel {hotel}
                            {o?.cupo_nocturno != null ? `/${o.cupo_nocturno}` : ""}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-n-500">
              Cada día: perros de día contra el cupo diurno; el hotel, contra el cupo de noche. Verde: con reservas · ámbar: casi lleno (80 % o más) · rojo: lleno.
            </p>
          </>
        )}
      </section>

      <section id="reservas-del-dia" aria-label="Reservas del día" className="flex scroll-mt-4 flex-col gap-3">
        {f.dia ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold capitalize text-n-900">Reservas del {NOMBRE_DIA_LARGO.format(aFecha(f.dia))}</h2>
              <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
                {/* N121: la reserva nueva arranca en el día elegido (si ya pasó, en hoy). */}
                {f.dia >= hoy && conHotel && (
                  <Link href={`/hotel/nueva?fecha=${f.dia}`} className="text-morado hover:underline" data-nueva-reserva-dia="hotel">
                    + Reserva de hotel este día
                  </Link>
                )}
                {f.dia >= hoy && conGuarderia && (
                  <Link href={`/guarderia/nueva?fecha=${f.dia}`} className="text-morado hover:underline" data-nueva-reserva-dia="guarderia">
                    + Reserva de guardería este día
                  </Link>
                )}
                <Link href={enlace({ dia: undefined })} className="text-morado hover:underline">
                  Cerrar el día
                </Link>
              </div>
            </div>
            {dia?.error ? (
              <Alert variante="error" titulo="No pudimos cargar las reservas del día">
                Recarga la página.
              </Alert>
            ) : dia && dia.filas.length === 0 ? (
              <p className="text-n-600">No hay reservas ese día con este módulo y estado.</p>
            ) : (
              <ul className="flex flex-col gap-3" data-lista="dia">
                {(dia?.filas ?? []).map((e) => (
                  <FilaReserva key={e.id} r={aReserva(e)} />
                ))}
              </ul>
            )}
            {dia && dia.hayMas && <p className="text-sm text-n-600">Se muestran las primeras {TOPE_DIA}. Afina con los filtros de abajo.</p>}
          </>
        ) : (
          <p className="text-sm text-n-600">Toca un día del calendario para ver sus reservas aquí.</p>
        )}
      </section>

      <section aria-label="Próximas reservas" className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Próximas reservas</h2>
        <form method="get" action="/reservas/calendario" className="grid grid-cols-1 gap-3 rounded-lg border border-n-200 bg-n-50 p-3 sm:grid-cols-5 sm:items-end" data-filtros>
          <input type="hidden" name="vista" value={f.vista} />
          <input type="hidden" name="fecha" value={f.fecha} />
          {f.dia && <input type="hidden" name="dia" value={f.dia} />}
          {conGuarderia && conHotel && (
            <label className="flex flex-col gap-1 text-sm font-medium text-n-800">
              Módulo
              <select name="modulo" defaultValue={f.modulo} className="min-h-12 rounded-md border-[1.5px] border-borde bg-white px-3 text-base text-n-900">
                <option value="todos">Guardería y hotel</option>
                <option value="guarderia">Guardería</option>
                <option value="hotel">Hotel</option>
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm font-medium text-n-800">
            Estado
            <select name="estado" defaultValue={f.estado} className="min-h-12 rounded-md border-[1.5px] border-borde bg-white px-3 text-base text-n-900">
              {ESTADOS_FILTRO.map((e) => (
                <option key={e.clave} value={e.clave}>
                  {e.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-n-800">
            Desde
            <input type="date" name="desde" defaultValue={f.desde} className="min-h-12 rounded-md border-[1.5px] border-borde bg-white px-3 text-base text-n-900" />
          </label>
          <button type="submit" className="min-h-12 rounded-md bg-morado px-5 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado focus-visible:ring-offset-2">
            Filtrar
          </button>
          <Link href={enlaceCalendario({ vista: f.vista, fecha: f.fecha, dia: f.dia ?? undefined })} className="text-center text-sm font-semibold text-morado hover:underline sm:pb-3">
            Quitar filtros
          </Link>
        </form>

        {proximas.error ? (
          <Alert variante="error" titulo="No pudimos cargar las reservas">
            Recarga la página.
          </Alert>
        ) : proximas.filas.length === 0 ? (
          <p className="text-n-600">No hay reservas desde el {formatearFechaCalendario(f.desde)} con estos filtros.</p>
        ) : (
          <ul className="flex flex-col gap-3" data-lista="proximas">
            {proximas.filas.slice(0, TAM_LISTA).map((e) => (
              <FilaReserva key={e.id} r={aReserva(e)} />
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3 text-sm font-semibold">
          {f.pagina > 0 ? (
            <Link href={enlace({ pagina: f.pagina - 1, dia: f.dia ?? undefined })} className="text-morado hover:underline">
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          {proximas.hayMas && (
            <Link href={enlace({ pagina: f.pagina + 1, dia: f.dia ?? undefined })} className="text-morado hover:underline">
              Siguientes →
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

type Cliente = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// Estancias de un día (todas las que lo cubren) o las próximas desde una fecha; con módulo y estado. Pide una de más para saber si hay otra página.
async function cargarEstancias(
  supabase: Cliente,
  f: FiltrosCalendario,
  que: { dia: string; hoy: string } | { proximas: true }
): Promise<{ filas: EstanciaCruda[]; hayMas: boolean; error: boolean }> {
  let q = supabase.from("estancias").select(SELECT_ESTANCIA).is("deleted_at", null); // limite-filas-ok: se acota abajo con .limit (el día) o .range (25 por página)
  if ("dia" in que) {
    // Cubre ese día: entra antes o ese día y sale después (la salida es exclusiva). Hoy y antes, también el perro que
    // sigue adentro con la salida vencida (N122: cuenta en la ocupación de esos días, así que sale en su lista).
    q = que.dia <= que.hoy
      ? q.lte("fecha_entrada", que.dia).or(`fecha_salida.gt.${que.dia},and(estado.eq.en_curso,hora_salida_real.is.null)`)
      : q.lte("fecha_entrada", que.dia).gt("fecha_salida", que.dia);
  } else {
    q = q.gte("fecha_entrada", f.desde);
  }
  if (f.modulo !== "todos") q = q.eq("servicios.categoria", f.modulo);
  // El panel de un día enseña TODAS las reservas de ese día (también finalizadas y canceladas, con su estado:
  // QA B21); la lista de próximas sí parte de las activas.
  if (f.estado === "activas") {
    if (!("dia" in que)) q = q.in("estado", ["reservada", "confirmada", "en_curso"]);
  } else if (f.estado !== "todas") q = q.eq("estado", f.estado);
  q = q.order("fecha_entrada").order("id");
  if ("dia" in que) {
    const { data, error } = await q.limit(TOPE_DIA + 1);
    const filas = (data ?? []) as unknown as EstanciaCruda[];
    return { filas: filas.slice(0, TOPE_DIA), hayMas: filas.length > TOPE_DIA, error: Boolean(error) };
  }
  const desde = f.pagina * TAM_LISTA;
  const { data, error } = await q.range(desde, desde + TAM_LISTA);
  const filas = (data ?? []) as unknown as EstanciaCruda[];
  return { filas: filas.slice(0, TAM_LISTA), hayMas: filas.length > TAM_LISTA, error: Boolean(error) };
}

// Estado de la cuenta de cada reserva mostrada: cancelada, con saldo, pagada.
async function cuentasDe(supabase: Cliente, reservaIds: string[]): Promise<Map<string, { texto: string; tono: ReservaCalendario["cuentaTono"] }>> {
  const ids = [...new Set(reservaIds)];
  const mapa = new Map<string, { texto: string; tono: ReservaCalendario["cuentaTono"] }>();
  if (ids.length === 0) return mapa;
  const canceladas = new Set<string>();
  for (const bloque of enBloques(ids)) {
    const { data } = await supabase.from("cuentas_canceladas").select("reserva_id").in("reserva_id", bloque);
    for (const c of (data ?? []) as { reserva_id: string }[]) canceladas.add(c.reserva_id);
  }
  const dinero = (n: number) => `$${Math.abs(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  await Promise.all(
    ids.map(async (id) => {
      const { data } = await supabase.rpc("cuenta_totales_reserva", { p_reserva_id: id });
      const t = (Array.isArray(data) ? data[0] : data) as { total_cuenta?: number; total_cobrado?: number; total_devuelto?: number; saldo?: number } | null;
      // R35: lo que se cobró y se devolvió de una reserva cancelada (o sin cargos vivos) se dice junto al estado.
      const cobrado = Number(t?.total_cobrado ?? 0);
      const devuelto = Number(t?.total_devuelto ?? 0);
      const movimientos = cobrado > 0.005 ? ` · cobrado ${dinero(cobrado)}${devuelto > 0.005 ? ` · devuelto ${dinero(devuelto)}` : ""}` : "";
      if (canceladas.has(id)) return void mapa.set(id, { texto: `Cuenta cancelada · total $0.00${movimientos}`, tono: "cancelada" });
      if (!t) return void mapa.set(id, { texto: "—", tono: "neutro" });
      const saldo = Number(t.saldo ?? 0);
      if (Number(t.total_cuenta ?? 0) <= 0.005 && movimientos) {
        return void mapa.set(id, { texto: `Total $0.00${movimientos}${saldo < -0.005 ? ` · a favor ${dinero(saldo)}` : ""}`, tono: saldo < -0.005 ? "debe" : "neutro" });
      }
      if (saldo > 0.005) mapa.set(id, { texto: `Debe ${dinero(saldo)}`, tono: "debe" });
      else if (saldo < -0.005) mapa.set(id, { texto: `A favor ${dinero(saldo)}`, tono: "ok" });
      else mapa.set(id, { texto: Number(t.total_cuenta ?? 0) > 0 ? "Pagada" : "Sin cargos", tono: Number(t.total_cuenta ?? 0) > 0 ? "ok" : "neutro" });
    })
  );
  return mapa;
}

