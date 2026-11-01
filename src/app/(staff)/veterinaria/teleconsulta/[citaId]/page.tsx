import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { formatearFecha, fechaLocalDeInstante, sumarDiasFecha } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { ESTADOS_CITA, type CitaVet } from "@/lib/veterinaria/expediente";
import { ETIQUETA_VENTANA, type DetalleTeleconsulta } from "@/lib/telemedicina/tipos";
import { PanelTeleconsulta } from "./panel";
import { Enlace } from "@/components/ui/enlace";

export default async function TeleconsultaPagina({ params, searchParams }: { params: Promise<{ citaId: string }>; searchParams: Promise<{ nueva?: string; aviso?: string }> }) {
  const { citaId } = await params;
  const { nueva, aviso } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(citaId)) return <Alert variante="advertencia" titulo="No encontramos esa cita">Vuelve a la agenda.</Alert>;
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const [{ data: detalleCrudo, error }, { data: puedeAtender }] = await Promise.all([
    supabase.rpc("vet_telemedicina_detalle", { p_cita: citaId }),
    supabase.rpc("vet_puede", { p_permiso: "atender_teleconsultas" }),
  ]);
  if (error) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Enlace href="/veterinaria/agenda" className="text-sm">← Agenda clínica</Enlace>
        <Alert variante="advertencia" titulo="No pudimos abrir la teleconsulta">{error.code === "42501" ? error.message : "No existe o no tienes acceso."}</Alert>
      </div>
    );
  }
  const d = detalleCrudo as DetalleTeleconsulta | null;
  // La cita se busca en la agenda del día en que abre la sala (la ventana empieza 15 min antes).
  const dia = d ? fechaLocalDeInstante(d.desde, zona) : fechaLocalDeInstante(new Date().toISOString(), zona);
  const { data: citasCrudo } = await supabase.rpc("vet_agenda", { p_desde: sumarDiasFecha(dia, -1), p_hasta: sumarDiasFecha(dia, 1), p_medico: null });
  const cita = ((citasCrudo ?? []) as CitaVet[]).find((c) => c.id === citaId);
  if (!cita) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Enlace href="/veterinaria/agenda" className="text-sm">← Agenda clínica</Enlace>
        <Alert variante="advertencia" titulo="No encontramos esa cita">Puede que se haya movido de fecha. Búscala en la agenda.</Alert>
      </div>
    );
  }
  const e = ESTADOS_CITA[cita.estado] ?? { etiqueta: cita.estado, estilo: "bg-n-100" };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Enlace href={`/veterinaria/agenda?fecha=${fechaLocalDeInstante(cita.inicia_at, zona)}`} className="text-sm">← Agenda clínica</Enlace>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-n-900">Teleconsulta · {cita.mascota}</h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${e.estilo}`}>{e.etiqueta}</span>
          {d && <span className="rounded-full bg-morado-suave px-2.5 py-1 text-xs font-semibold text-morado">{ETIQUETA_VENTANA[d.ventana]}</span>}
        </div>
        <p className="mt-1 text-n-700">{formatearFecha(cita.inicia_at, zona)} · {cita.medico} · de {cita.dueno}{cita.telefono ? ` · ${cita.telefono}` : ""}</p>
        {cita.motivo && <p className="text-n-600">Motivo: {cita.motivo}</p>}
      </div>
      {nueva === "1" && <Alert variante="exito" titulo="Teleconsulta agendada">La sala ya está creada. Genera la liga y mándasela al dueño.</Alert>}
      {aviso === "sala" && <Alert variante="advertencia" titulo="La cita quedó agendada, pero no pudimos crear la sala">Usa «Preparar la sala» abajo cuando el servicio de video esté disponible.</Alert>}
      {d && (
        <ul className="grid gap-1 rounded-lg border border-n-200 bg-white p-4 text-sm text-n-700">
          <li>Consentimiento: <strong>{d.consentimiento_firmado ? `firmado por ${d.consentimiento_firmante ?? "el dueño"}` : "pendiente"}</strong></li>
          {d.pago_requerido && <li>Cobro anticipado: <strong>{d.pagado ? "pagado" : "pendiente"}</strong></li>}
          <li>El dueño ya entró: <strong>{d.entro_dueno_at ? "sí" : "no"}</strong></li>
        </ul>
      )}
      <PanelTeleconsulta
        citaId={citaId}
        hayDetalle={!!d}
        puedeEntrar={!!d?.puede_entrar}
        requierePago={!!d?.pago_requerido}
        pagado={!!d?.pagado}
        monto={d?.monto ?? null}
        firmada={!!d?.consentimiento_firmado}
        consultaId={cita.consulta_id}
        puedeAtender={puedeAtender === true}
        nombreMedico={cita.medico}
      />
    </div>
  );
}
