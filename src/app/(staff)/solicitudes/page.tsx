import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { accesoDeSesion, puedeAbrir } from "@/lib/auth/acceso";
import { tienePermiso } from "@/lib/auth/permisos";
import { zonaActual } from "@/lib/negocio/actual";
import { formatearFecha, formatearFechaCalendario } from "@/lib/formato";
import { requisitoParaPersonal, type MotivoBase } from "@/lib/app/requisitos";
import { BotonAccion, Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { AbrirWhatsApp } from "@/components/ui/abrir-whatsapp";
import { Enlace } from "@/components/ui/enlace";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { aceptarConExcepcion, aceptarSolicitud, agendarEvaluacion, rechazarSolicitud } from "./actions";

type Solicitud = {
  id: string;
  tipo: "estancia" | "cita";
  estado: string;
  perro_id: string;
  perro_nombre: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  servicio_nombre: string;
  fecha_entrada: string | null;
  fecha_salida: string | null;
  horas: number | null;
  inicio: string | null;
  recoleccion: { direccion: string; km: number } | null;
  motivos: MotivoBase[];
  evaluacion_agendada_at: string | null;
  motivo_rechazo: string | null;
  motivo_excepcion: string | null;
  expira_at: string;
  resuelta_at: string | null;
  reserva_id: string | null;
  created_at: string;
};

const ESTADO: Record<string, string> = { aceptada: "Aceptada", rechazada: "Rechazada", caducada: "Caducó sin respuesta", cancelada: "La canceló el dueño" };

function esVigente(s: Solicitud): boolean {
  return s.estado === "pendiente" && Date.parse(s.expira_at) > Date.now();
}

function cuando(s: Solicitud, zona: string): string {
  if (s.tipo === "cita" && s.inicio) return formatearFecha(s.inicio, zona);
  if (!s.fecha_entrada) return "";
  return s.fecha_salida ? `${formatearFechaCalendario(s.fecha_entrada)} al ${formatearFechaCalendario(s.fecha_salida)}` : formatearFechaCalendario(s.fecha_entrada);
}

function whatsapp(s: Solicitud): string | null {
  const tel = s.cliente_telefono?.replace(/\D/g, "");
  if (!tel) return null;
  const texto = `Hola, ${s.cliente_nombre}. Te escribo por el lugar que pediste para ${s.perro_nombre}.`;
  return `https://wa.me/${tel.length === 10 ? `52${tel}` : tel}?text=${encodeURIComponent(texto)}`;
}

/** Lo que los dueños piden cuando les falta un requisito para reservar: no cobra ni ocupa cupo hasta aceptarla. */
export default async function SolicitudesPage() {
  const sesion = await obtenerSesionConRol();
  if (!puedeAbrir(accesoDeSesion(sesion), "/solicitudes")) redirect("/");
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const { data, error } = await supabase.rpc("solicitudes_del_negocio", { p_solo_pendientes: false });
  const todas = (data ?? []) as Solicitud[];
  const pendientes = todas.filter(esVigente);
  const resueltas = todas.filter((s) => s.estado !== "pendiente").reverse();
  const puedeExcepcion = tienePermiso(sesion, "excepciones_reserva");

  return (
    <div className="flex flex-col gap-6" data-solicitudes>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Solicitudes de lugar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Lo que tus clientes pidieron desde su cuenta y le falta un requisito. No cobra ni ocupa cupo hasta que la aceptes; sin respuesta, caduca a los 3 días.</p>
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-red-700">No pudimos leer las solicitudes. Recarga la página.</p>}
      {!error && pendientes.length === 0 && <p className="text-sm text-n-600" data-sin-solicitudes>No hay solicitudes por revisar.</p>}
      <ul className="flex flex-col gap-3">
        {pendientes.map((s) => {
          const wa = whatsapp(s);
          const pideEvaluacion = s.motivos.some((m) => m.clave === "evaluacion");
          return (
            <li key={s.id} className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4" data-solicitud={s.id}>
              <div>
                <p className="font-bold text-n-900">
                  <Enlace href={`/perros/${s.perro_id}`} enTexto>{s.perro_nombre}</Enlace> · {s.servicio_nombre}
                </p>
                <p className="text-sm text-n-600">{s.cliente_nombre} · {cuando(s, zona)}{s.horas ? ` · ${s.horas} h` : ""}</p>
                {s.recoleccion && <p className="text-sm text-n-600">Con recolección: {s.recoleccion.direccion} ({s.recoleccion.km} km)</p>}
                <p className="text-sm text-n-600">Caduca el {formatearFecha(s.expira_at, zona)}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-n-900">Falta</p>
                <ul className="list-disc pl-5 text-sm text-n-700" data-motivos>
                  {s.motivos.map((m, i) => <li key={i}>{requisitoParaPersonal(m)}</li>)}
                </ul>
                {s.evaluacion_agendada_at && <p className="mt-1 text-sm font-semibold text-menta-oscuro" data-evaluacion-agendada>Evaluación agendada: {formatearFecha(s.evaluacion_agendada_at, zona)}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <BotonAccion accion={aceptarSolicitud.bind(null, s.id)} texto="Aceptar" textoCargando="Aceptando…" />
                <p className="text-xs text-n-600">«Aceptar» funciona si ya se resolvió lo que faltaba; si no, te dice qué sigue faltando.</p>
                {puedeExcepcion && (
                  <Desplegable texto="Aceptar con excepción">
                    <FormularioAccion accion={aceptarConExcepcion.bind(null, s.id)} textoBoton="Aceptar con excepción" textoCargando="Aceptando…">
                      <Textarea label="Motivo de la excepción" name="motivo" required maxLength={500} />
                    </FormularioAccion>
                  </Desplegable>
                )}
                {pideEvaluacion && (
                  <Desplegable texto="Agendar evaluación">
                    <FormularioAccion accion={agendarEvaluacion.bind(null, s.id)} textoBoton="Agendar evaluación">
                      <Field label="Día y hora" name="cuando" type="datetime-local" required />
                    </FormularioAccion>
                  </Desplegable>
                )}
                {wa && <AbrirWhatsApp href={wa} texto="Contactar" variante="secundario" />}
                <Desplegable texto="Rechazar" variante="peligro">
                  <FormularioAccion accion={rechazarSolicitud.bind(null, s.id)} textoBoton="Rechazar" textoCargando="Rechazando…" variante="peligro">
                    <Textarea label="Motivo (el dueño lo va a leer)" name="motivo" required maxLength={500} />
                  </FormularioAccion>
                </Desplegable>
              </div>
            </li>
          );
        })}
      </ul>
      {resueltas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold text-n-900">Últimos 30 días</h2>
          <ul className="flex flex-col gap-2">
            {resueltas.map((s) => (
              <li key={s.id} className="rounded-md border border-n-200 bg-white p-3 text-sm" data-solicitud-resuelta={s.id}>
                <p className="font-semibold text-n-900">{s.perro_nombre} · {s.servicio_nombre} · {cuando(s, zona)}</p>
                <p className="text-n-600">{ESTADO[s.estado] ?? s.estado}{s.motivo_excepcion ? `, con excepción: ${s.motivo_excepcion}` : ""}{s.motivo_rechazo ? `: ${s.motivo_rechazo}` : ""}</p>
                {s.reserva_id && <Enlace href={`/reservas/${s.reserva_id}`}>Ver la reserva</Enlace>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
