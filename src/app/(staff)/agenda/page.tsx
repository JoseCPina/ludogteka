import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  formatearFechaCalendario,
  formatearDiaSemana,
  fechaLocalDeInstante,
  horaLocalDeInstante,
  hoyNegocio,
  sumarDiasFecha,
  inicioSemana,
} from "@/lib/formato";

const ETIQUETA_ESTADO: Record<string, string> = {
  reservada: "Reservada",
  confirmada: "Confirmada",
  en_curso: "En curso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
  no_llego: "No llegó",
};

const ESTILO_ESTADO: Record<string, string> = {
  reservada: "bg-n-100 text-n-700",
  confirmada: "bg-azul-suave text-azul",
  en_curso: "bg-verde-suave text-verde-oscuro",
  finalizada: "bg-n-100 text-n-600",
  cancelada: "bg-naranja-suave text-naranja-oscuro",
  no_llego: "bg-naranja-suave text-naranja-oscuro",
};

type Cita = {
  id: string;
  inicio: string;
  estado: string;
  fuera_de_horario: boolean;
  empleado_id: string;
  perro_nombre: string;
  servicio_nombre: string;
  fecha_local: string;
};

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; fecha?: string }>;
}) {
  const { vista: vistaParam, fecha: fechaParam } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();

  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio();
  const vista = vistaParam === "semana" ? "semana" : "dia";
  const fechaAncla = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoy;

  const desde = vista === "semana" ? inicioSemana(fechaAncla) : fechaAncla;
  const hasta = vista === "semana" ? sumarDiasFecha(desde, 6) : fechaAncla;
  // Rango de consulta con margen de un día de cada lado — el filtro fino
  // por fecha de negocio se hace después, en JS (ver fechaLocalDeInstante).
  const desdeConsulta = sumarDiasFecha(desde, -1);
  const hastaConsulta = sumarDiasFecha(hasta, 2);

  const [{ data: empleados, error: errorEmpleados }, { data: citasCrudo, error: errorCitas }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, nombre_completo, rol")
        .in("rol", ["estetica", "admin"])
        .is("deleted_at", null)
        .order("nombre_completo"),
      supabase
        .from("citas_estetica")
        .select("id, inicio, estado, fuera_de_horario, empleado_id, perros(nombre), servicios(nombre)")
        .is("deleted_at", null)
        .gte("inicio", desdeConsulta)
        .lt("inicio", hastaConsulta)
        .order("inicio"),
    ]);

  const error = errorEmpleados ?? errorCitas;

  const citas: Cita[] = (citasCrudo ?? [])
    .map((c) => {
      const perro = Array.isArray(c.perros) ? c.perros[0] : c.perros;
      const servicio = Array.isArray(c.servicios) ? c.servicios[0] : c.servicios;
      return {
        id: c.id as string,
        inicio: c.inicio as string,
        estado: c.estado as string,
        fuera_de_horario: c.fuera_de_horario as boolean,
        empleado_id: c.empleado_id as string,
        perro_nombre: perro?.nombre ?? "—",
        servicio_nombre: servicio?.nombre ?? "—",
        fecha_local: fechaLocalDeInstante(c.inicio as string),
      };
    })
    .filter((c) => c.fecha_local >= desde && c.fecha_local <= hasta);

  const diasVista =
    vista === "semana" ? Array.from({ length: 7 }, (_, i) => sumarDiasFecha(desde, i)) : [desde];

  const puedeEditarTodos = sesion?.rol === "admin" || sesion?.rol === "recepcion";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Agenda</h1>
          <p className="mt-1 text-n-600">
            {vista === "semana"
              ? `${formatearFechaCalendario(desde)} – ${formatearFechaCalendario(hasta)}`
              : formatearFechaCalendario(fechaAncla)}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/agenda?vista=dia&fecha=${sumarDiasFecha(fechaAncla, vista === "semana" ? -7 : -1)}`}>
            <Button type="button" variante="secundario">
              ← Anterior
            </Button>
          </Link>
          <Link href={`/agenda?vista=dia&fecha=${hoy}`}>
            <Button type="button" variante="secundario">
              Hoy
            </Button>
          </Link>
          <Link href={`/agenda?vista=${vista}&fecha=${sumarDiasFecha(fechaAncla, vista === "semana" ? 7 : 1)}`}>
            <Button type="button" variante="secundario">
              Siguiente →
            </Button>
          </Link>
          <Link href={`/agenda?vista=dia&fecha=${fechaAncla}`}>
            <Button type="button" variante={vista === "dia" ? "primario" : "secundario"}>
              Día
            </Button>
          </Link>
          <Link href={`/agenda?vista=semana&fecha=${fechaAncla}`}>
            <Button type="button" variante={vista === "semana" ? "primario" : "secundario"}>
              Semana
            </Button>
          </Link>
          <Link href="/agenda/nueva">
            <Button type="button">Agendar</Button>
          </Link>
        </div>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la agenda">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : !empleados || empleados.length === 0 ? (
        <p className="text-n-600">No hay personal de estética registrado todavía.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {empleados.map((emp) => {
            const citasEmpleado = citas.filter((c) => c.empleado_id === emp.id);
            const esPropia = sesion?.user.id === emp.id;
            return (
              <section key={emp.id} className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">
                  {emp.nombre_completo ?? "—"}
                </h2>
                {citasEmpleado.length === 0 ? (
                  <p className="text-sm text-n-500">Sin citas.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {diasVista.map((dia) => {
                      const citasDelDia = citasEmpleado.filter((c) => c.fecha_local === dia);
                      if (citasDelDia.length === 0) return null;
                      return (
                        <div key={dia} className="flex flex-col gap-1.5">
                          {vista === "semana" && (
                            <p className="text-xs font-bold uppercase text-n-500">
                              {formatearDiaSemana(dia)} {formatearFechaCalendario(dia)}
                            </p>
                          )}
                          {citasDelDia.map((c) => (
                            <Link
                              key={c.id}
                              href={
                                puedeEditarTodos || esPropia ? `/agenda/${c.id}` : "#"
                              }
                              className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
                                c.fuera_de_horario ? "border-amarillo bg-amarillo-suave" : "border-n-200 bg-n-50"
                              } ${puedeEditarTodos || esPropia ? "hover:opacity-80" : "cursor-default"}`}
                            >
                              <span className="font-semibold text-n-900">
                                {horaLocalDeInstante(c.inicio)} · {c.perro_nombre}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_ESTADO[c.estado] ?? "bg-n-100"}`}
                              >
                                {ETIQUETA_ESTADO[c.estado] ?? c.estado}
                              </span>
                            </Link>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
