import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { hoyNegocio, horaLocalDeInstante, formatearFechaCalendario } from "@/lib/formato";
import { ESTADOS_DIA, MINUTOS_TOLERANCIA, ORIGEN_REGISTRO, TIPOS_AUSENCIA, hora, horaCampo, minutos } from "@/lib/empleados/textos";
import type { DiaAsistencia } from "@/lib/empleados/tipos";
import { SubnavEmpleados } from "./subnav";
import { BotonAccion } from "./formulario-accion";
import { registrarEntrada, registrarSalida } from "./asistencia-actions";

// Asistencia de hoy de toda la casa, y la lista del personal. Recepción
// registra la entrada y salida de quien no tiene cuenta en la app; quien
// sí la tiene lo registra desde su sesión (Mi asistencia).
export default async function EmpleadosPage() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const puedeNomina = tienePermiso(sesion, "nomina");
  const esAdmin = sesion?.rol === "admin";
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio();
  // "HH:MM" en la hora del negocio, para comparar contra su horario.
  const ahora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

  const [{ data: dias, error }, { data: empleados }, { count: porAprobar }] = await Promise.all([
    supabase.rpc("asistencia_periodo", { p_desde: hoy, p_hasta: hoy }),
    supabase.from("empleados").select("id, nombre, puesto, telefono, profile_id, fecha_baja").is("deleted_at", null).order("nombre"),
    supabase.from("ausencias").select("id", { count: "exact", head: true }).eq("estado", "solicitada").is("deleted_at", null),
  ]);
  const hoyDe = new Map(((dias ?? []) as DiaAsistencia[]).map((d) => [d.empleado_id, d]));
  const activos = (empleados ?? []).filter((e) => !e.fecha_baja || e.fecha_baja >= hoy);
  const bajas = (empleados ?? []).filter((e) => e.fecha_baja && e.fecha_baja < hoy);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Empleados</h1>
          <p className="mt-1 text-n-600">
            Asistencia de hoy ({formatearFechaCalendario(hoy)}). Retardo es llegar más de {MINUTOS_TOLERANCIA} minutos después
            de su hora.
          </p>
        </div>
        {puedeNomina && (
          <Link href="/empleados/nuevo">
            <Button type="button">Nuevo empleado</Button>
          </Link>
        )}
      </div>

      <SubnavEmpleados activa="hoy" puedeNomina={puedeNomina} ausenciasPorAprobar={porAprobar ?? 0} />

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la asistencia">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : activos.length === 0 ? (
        <p className="rounded-lg border-[1.5px] border-dashed border-n-300 bg-white p-8 text-center text-n-600">
          Todavía no hay empleados capturados.{puedeNomina ? " Empieza con «Nuevo empleado»." : " Un admin los da de alta."}
        </p>
      ) : (
        <ul className="divide-y divide-n-200 rounded-lg border border-n-200 bg-white">
          {activos.map((e) => {
            const d = hoyDe.get(e.id);
            let estado = d ? ESTADOS_DIA[d.estado] : null;
            if (d?.estado === "pendiente" && d.hora_entrada_prog && ahora > horaCampo(d.hora_entrada_prog)) {
              estado = { etiqueta: "No ha llegado", estilo: "bg-amarillo-suave text-amarillo-oscuro" };
            }
            // Recepción registra solo por quien no tiene cuenta; admin, por cualquiera.
            const puedeRegistrar = esAdmin || (sesion?.rol === "recepcion" && !e.profile_id);
            return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-[14rem] flex-col gap-1">
                  <Link href={`/empleados/${e.id}`} className="font-semibold text-n-900 hover:underline">
                    {e.nombre}
                  </Link>
                  <span className="text-sm text-n-600">
                    {e.puesto}
                    {d?.hora_entrada_prog ? ` · hoy ${hora(d.hora_entrada_prog)}–${hora(d.hora_salida_prog)}` : " · hoy no le toca"}
                    {!e.profile_id && " · sin cuenta en la app"}
                  </span>
                  {d?.entrada_at && (
                    <span className="text-xs text-n-600">
                      Entró {horaLocalDeInstante(d.entrada_at)} ({ORIGEN_REGISTRO[d.entrada_origen ?? ""] ?? ""})
                      {d.salida_at && ` · salió ${horaLocalDeInstante(d.salida_at)} (${ORIGEN_REGISTRO[d.salida_origen ?? ""] ?? ""})`}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {estado && (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${estado.estilo}`}>
                      {d?.estado === "ausencia" ? TIPOS_AUSENCIA[d.ausencia_tipo ?? ""] ?? estado.etiqueta : estado.etiqueta}
                      {d?.estado === "retardo" && ` · ${minutos(d.minutos_retardo)}`}
                    </span>
                  )}
                  {puedeRegistrar && !d?.entrada_at && d?.estado !== "ausencia" && (
                    <BotonAccion accion={registrarEntrada.bind(null, e.id)} texto="Registrar entrada" textoExito="Entrada registrada" />
                  )}
                  {puedeRegistrar && d?.entrada_at && !d.salida_at && (
                    <BotonAccion accion={registrarSalida.bind(null, e.id)} texto="Registrar salida" variante="secundario" textoExito="Salida registrada" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {bajas.length > 0 && (
        <details className="rounded-lg border border-n-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold text-n-700">Dados de baja ({bajas.length})</summary>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {bajas.map((e) => (
              <li key={e.id}>
                <Link href={`/empleados/${e.id}`} className="text-azul hover:underline">
                  {e.nombre}
                </Link>{" "}
                <span className="text-n-500">· {e.puesto} · baja el {formatearFechaCalendario(e.fecha_baja as string)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
