import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario, horaLocalDeInstante, hoyNegocio, sumarDiasFecha } from "@/lib/formato";
import { METODOS_PAGO, MINUTOS_TOLERANCIA, hora, minutos, moneda } from "@/lib/empleados/textos";
import type { DiaAsistencia, PagoNomina } from "@/lib/empleados/tipos";
import { BotonAccion } from "@/components/formulario-accion";
import { registrarEntrada, registrarSalida } from "../empleados/asistencia-actions";
import { ResumenAsistencia, TablaAsistencia } from "../empleados/tabla-asistencia";
import { COLUMNAS_AUSENCIA, FormularioSolicitarAusencia, ListaAusencias, type Ausencia } from "../empleados/ausencias-lista";
import { ListaPagos } from "../empleados/nomina-vistas";

// Lo de cada quien: su entrada y salida, su asistencia, sus ausencias y
// sus pagos. Nunca lo de otra persona (lo aplica la base: RLS y las
// funciones solo devuelven lo suyo).
export default async function MiTrabajoPage() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const { data: miId } = await supabase.rpc("mi_empleado_id");
  const empleadoId = miId as string | null;
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio();

  if (!empleadoId) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-bold text-n-900">Mi asistencia</h1>
        <Alert variante="advertencia" titulo="Tu cuenta no está ligada a ningún empleado">
          Pídele a un admin que te dé de alta en Empleados y ligue tu cuenta. Después aquí registras tu entrada y salida y ves
          tus ausencias y tus pagos.
        </Alert>
      </div>
    );
  }

  const [{ data: empleado }, { data: dias }, { data: ausencias }, { data: saldo }, { data: pagos }, { data: adelantos }] = await Promise.all([
    supabase.from("empleados").select("nombre, puesto").eq("id", empleadoId).single(),
    supabase.rpc("asistencia_periodo", { p_desde: sumarDiasFecha(hoy, -29), p_hasta: hoy, p_empleado_id: empleadoId }),
    supabase.from("ausencias").select(COLUMNAS_AUSENCIA).eq("empleado_id", empleadoId).is("deleted_at", null).order("desde", { ascending: false }).limit(20),
    supabase.rpc("saldo_vacaciones", { p_empleado_id: empleadoId }),
    supabase.from("nomina_pagos").select("*").eq("empleado_id", empleadoId).is("deleted_at", null).order("created_at", { ascending: false }).limit(12),
    supabase.from("adelantos").select("id, monto, fecha, metodo, motivo, pago_id, cancelado").eq("empleado_id", empleadoId).is("deleted_at", null).order("fecha", { ascending: false }).limit(12),
  ]);
  const diasAsistencia = (dias ?? []) as DiaAsistencia[];
  const deHoy = diasAsistencia.find((d) => d.fecha === hoy);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Mi asistencia</h1>
        <p className="mt-1 text-n-600">
          {empleado?.nombre ?? sesion?.nombreCompleto} · {empleado?.puesto}
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
        <h2 className="text-lg font-bold text-n-900">Hoy, {formatearFechaCalendario(hoy)}</h2>
        <p className="text-n-700">
          {deHoy?.hora_entrada_prog
            ? `Tu horario: ${hora(deHoy.hora_entrada_prog)} a ${hora(deHoy.hora_salida_prog)}. Después de ${MINUTOS_TOLERANCIA} minutos cuenta como retardo.`
            : "Hoy no te toca según tu horario."}
        </p>
        {deHoy?.entrada_at && (
          <p className="text-n-700">
            Entraste a las <strong>{horaLocalDeInstante(deHoy.entrada_at)}</strong>
            {deHoy.estado === "retardo" && ` (${minutos(deHoy.minutos_retardo)} tarde)`}
            {deHoy.salida_at && (
              <>
                {" "}
                y saliste a las <strong>{horaLocalDeInstante(deHoy.salida_at)}</strong>
              </>
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {!deHoy?.entrada_at && <BotonAccion accion={registrarEntrada.bind(null, null)} texto="Registrar mi entrada" textoExito="Entrada registrada" />}
          {deHoy?.entrada_at && !deHoy.salida_at && (
            <BotonAccion accion={registrarSalida.bind(null, null)} texto="Registrar mi salida" variante="secundario" textoExito="Salida registrada" />
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Últimos 30 días</h2>
        <ResumenAsistencia dias={diasAsistencia} />
        <TablaAsistencia dias={diasAsistencia} empleadoId={empleadoId} puedeCorregir={false} correcciones={[]} />
        <p className="text-xs text-n-500">Si un registro está mal, pídele a un admin que lo corrija.</p>
      </section>

      <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Mis ausencias</h2>
        <p className="text-n-800">
          Saldo de vacaciones: <strong>{Number(saldo ?? 0)} {Number(saldo ?? 0) === 1 ? "día" : "días"}</strong>
        </p>
        <ListaAusencias ausencias={(ausencias ?? []) as unknown as Ausencia[]} esAdmin={false} puedeCancelarSolicitadas vacio="No has pedido ausencias." />
        <div className="rounded-lg border border-n-200 bg-white p-4">
          <h3 className="mb-3 font-bold text-n-900">Pedir una ausencia</h3>
          <FormularioSolicitarAusencia empleadoId={null} hoy={hoy} />
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-n-200 pt-6">
        <h2 className="text-lg font-bold text-n-900">Mis pagos</h2>
        <ListaPagos pagos={(pagos ?? []) as PagoNomina[]} puedeRevertir={false} />
        {(adelantos ?? []).length > 0 && (
          <>
            <h3 className="font-bold text-n-900">Mis adelantos</h3>
            <ul className="flex flex-col gap-1 text-sm text-n-700">
              {(adelantos ?? []).map((a) => (
                <li key={a.id}>
                  {formatearFechaCalendario(a.fecha as string)} · {moneda(a.monto as number)} · {METODOS_PAGO[a.metodo as string] ?? a.metodo}
                  {a.cancelado ? " · cancelado" : a.pago_id ? " · ya descontado" : " · se descuenta del siguiente pago"}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
