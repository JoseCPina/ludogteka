import { fechaParaAgendar } from "@/lib/estetica/proponer-hora";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describirCita, fechaLocalDeInstante, formatearDiaDeInstante, formatearDiaSemana, formatearFechaCalendario, formatearHoraNegocio, horaLocalDeInstante, hoyNegocio, inicioSemana, sumarDiasFecha } from "@/lib/formato";
import { unirFrases } from "@/lib/texto/frases";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { AvisosWhatsApp } from "@/components/avisos-whatsapp";
import { ESTADOS_CITA, type CitaVet, type MedicoVet } from "@/lib/veterinaria/expediente";
import { AccionesCita } from "./acciones-cita";
import { EnlaceOTexto } from "@/components/acceso-contexto";
import { Chip } from "@/components/ui/chip";
import { recordatoriosDeCitas } from "@/lib/recordatorios/de-citas";
import { estadoDeRecordatorio } from "@/lib/recordatorios/estado";
import { Enlace } from "@/components/ui/enlace";
import { EnlacePestana } from "@/components/ui/enlace-pestana";

export default async function AgendaVeterinaria({ searchParams }: { searchParams: Promise<{ vista?: string; fecha?: string; medico?: string; aviso?: string; hora?: string }> }) {
  const zona = await zonaActual();
  const { vista: vistaParam, fecha: fechaParam, medico, aviso, hora: horaAgendada } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = (hoyData as string | null) ?? hoyNegocio(zona);
  const vista = vistaParam === "semana" ? "semana" : "dia";
  const ancla = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoy;
  const desde = vista === "semana" ? inicioSemana(ancla) : ancla;
  const hasta = vista === "semana" ? sumarDiasFecha(desde, 6) : ancla;
  const filtroMedico = medico && /^[0-9a-f-]{36}$/.test(medico) ? medico : null;

  const [{ data: citasCrudo, error }, { data: medicosCrudo }, { data: puedeAtenderCrudo }, { data: puedeLeerCrudo }] = await Promise.all([
    supabase.rpc("vet_agenda", { p_desde: desde, p_hasta: hasta, p_medico: filtroMedico }),
    supabase.rpc("vet_medicos_lista"),
    supabase.rpc("vet_puede", { p_permiso: "atender_consultas" }),
    supabase.rpc("vet_puede_leer"),
  ]);
  const citas = (citasCrudo ?? []) as CitaVet[];
  // El recordatorio automático por WhatsApp de cada cita (confirmó, pide cambio, enviado…).
  const recordatorios = await recordatoriosDeCitas(supabase, citas.map((c) => c.id));
  // «Avisar por WhatsApp» de cada cita viva: el teléfono del dueño de cada mascota de la agenda.
  const perroIds = [...new Set(citas.filter((c) => !["cancelada", "no_llego"].includes(c.estado)).map((c) => c.perro_id))];
  const [{ data: duenosCrudo }, negocio] = await Promise.all([
    perroIds.length ? supabase.from("perros").select("id, clientes(nombre, telefono)").in("id", perroIds) : Promise.resolve({ data: [] as { id: string; clientes: unknown }[] }),
    negocioActual(),
  ]);
  const duenoDe = new Map(
    (duenosCrudo ?? []).map((f) => {
      const c = (Array.isArray(f.clientes) ? f.clientes[0] : f.clientes) as { nombre: string | null; telefono: string | null } | null;
      return [f.id as string, c];
    })
  );
  const diaLargo = (iso: string) => new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: zona }).format(new Date(iso));
  const hora12 = (iso: string) => new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: zona }).format(new Date(iso));
  const medicos = (medicosCrudo ?? []) as MedicoVet[];
  const puedeAtender = puedeAtenderCrudo === true;
  const puedeLeer = puedeLeerCrudo === true;
  const dias = vista === "semana" ? Array.from({ length: 7 }, (_, i) => sumarDiasFecha(desde, i)) : [desde];
  const columnas = medicos.filter((m) => !filtroMedico || m.id === filtroMedico);
  const enlace = (v: string, f: string) => `/veterinaria/agenda?vista=${v}&fecha=${f}${filtroMedico ? `&medico=${filtroMedico}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Enlace href="/veterinaria" className="text-sm">← Veterinaria</Enlace>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Agenda clínica</h1>
          <p className="mt-1 text-n-600">{vista === "semana" ? `${formatearFechaCalendario(desde)} – ${formatearFechaCalendario(hasta)}` : formatearFechaCalendario(ancla)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Enlace href={enlace(vista, sumarDiasFecha(ancla, vista === "semana" ? -7 : -1))}>← Anterior</Enlace>
          <Enlace href={enlace("dia", hoy)}>Hoy</Enlace>
          <Enlace href={enlace(vista, sumarDiasFecha(ancla, vista === "semana" ? 7 : 1))}>Siguiente →</Enlace>
          <EnlacePestana href={enlace("dia", ancla)} activo={vista === "dia"}>Día</EnlacePestana>
          <EnlacePestana href={enlace("semana", ancla)} activo={vista === "semana"}>Semana</EnlacePestana>
          <Enlace href={`/veterinaria/agenda/nueva?fecha=${fechaParaAgendar(vista, ancla, desde, hoy)}`} data-agendar-fecha={fechaParaAgendar(vista, ancla, desde, hoy)}>Agendar</Enlace>
        </div>
      </div>

      {medicos.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filtrar por médico">
          <EnlacePestana href={`/veterinaria/agenda?vista=${vista}&fecha=${ancla}`} activo={!filtroMedico}>Todos los médicos</EnlacePestana>
          {medicos.map((m) => (
            <EnlacePestana key={m.id} href={`/veterinaria/agenda?vista=${vista}&fecha=${ancla}&medico=${m.id}`} activo={filtroMedico === m.id}>{m.nombre}</EnlacePestana>
          ))}
        </nav>
      )}

      {aviso === "descartado" && <Alert variante="exito" titulo="Borrador descartado" data-aviso-descartado>La cita volvió a quedar sin consulta: puedes iniciarla de nuevo.</Alert>}
      {aviso === "urgencia" && <Alert variante="advertencia" titulo="Urgencia agendada">Se empalma con otra cita de ese médico: avísale.</Alert>}
      {aviso === "agendada" && (
        <Alert variante="exito" titulo="Cita agendada" data-aviso-agendada>
          {`Quedó en la agenda${fechaParam ? ` del ${formatearFechaCalendario(fechaParam)}` : ""}${horaAgendada && /^\d{2}:\d{2}$/.test(horaAgendada) ? ` a las ${horaAgendada}` : ""}.`}
        </Alert>
      )}
      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la agenda">Recarga la página. Si el problema sigue, avísale al equipo técnico.</Alert>
      ) : medicos.length === 0 ? (
        <Alert variante="advertencia" titulo="Todavía no hay médicos veterinarios">Para agendar citas, un admin designa al menos un médico en <EnlaceOTexto href="/veterinaria/medicos" className="font-semibold underline">Médicos</EnlaceOTexto>.</Alert>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columnas.map((m) => {
            const delMedico = citas.filter((c) => c.medico_id === m.id);
            return (
              <section key={m.id} className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4" aria-label={`Citas de ${m.nombre}`}>
                <h2 className="text-sm font-bold uppercase tracking-wide text-n-600">{m.nombre}</h2>
                {delMedico.length === 0 ? (
                  <p className="text-sm text-n-500">Sin citas.</p>
                ) : (
                  dias.map((dia) => {
                    const delDia = delMedico.filter((c) => fechaLocalDeInstante(c.inicia_at, zona) === dia);
                    if (delDia.length === 0) return null;
                    return (
                      <div key={dia} className="flex flex-col gap-2">
                        {vista === "semana" && <p className="text-xs font-bold uppercase text-n-500">{formatearDiaSemana(dia)} {formatearFechaCalendario(dia)}</p>}
                        {delDia.map((c) => {
                          const e = ESTADOS_CITA[c.estado] ?? { etiqueta: c.estado, estilo: "bg-n-100" };
                          const gris = c.estado === "cancelada" || c.estado === "no_llego";
                          return (
                            <article key={c.id} className={`rounded-md border px-3 py-2 text-sm ${c.urgencia ? "border-coral bg-coral-suave" : "border-n-200 bg-n-50"} ${gris ? "opacity-60" : ""}`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-n-900">
                                  {horaLocalDeInstante(c.inicia_at, zona)}–{horaLocalDeInstante(c.termina_at, zona)} · {c.mascota}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.estilo}`}>{e.etiqueta}</span>
                              </div>
                              {recordatorios.has(c.id) && (() => {
                                const r = recordatorios.get(c.id)!;
                                const er = estadoDeRecordatorio(r.estado, r.respuesta);
                                return <span className="mt-1 inline-block" data-recordatorio-cita={r.respuesta ?? r.estado}><Chip tono={er.tono}>{er.texto}</Chip></span>;
                              })()}
                              <p className="text-n-700">
                                {c.tipo}{c.tipo_clave === "teleconsulta" ? " · telemedicina" : ""}{c.urgencia ? " · urgencia" : ""} · {c.dueno}
                              </p>
                              {c.motivo && <p className="text-n-600">{c.motivo}</p>}
                              {c.estado === "cancelada" && (c.cancelada_at || c.cancelada_motivo) && (
                                <p className="text-coral-oscuro" data-cita-cancelada="">
                                  {unirFrases(
                                    c.cancelada_at ? `Cancelada por ${c.cancelada_por ?? "alguien del equipo"} el ${formatearDiaDeInstante(c.cancelada_at, zona)} a las ${formatearHoraNegocio(c.cancelada_at, zona)}` : null,
                                    c.cancelada_motivo ? `Motivo: ${c.cancelada_motivo}` : null
                                  )}
                                </p>
                              )}
                              <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold">
                                {c.tipo_clave === "teleconsulta" && <Enlace href={`/veterinaria/teleconsulta/${c.id}`}>Teleconsulta (liga y sala)</Enlace>}
                                {puedeLeer && <Enlace href={`/veterinaria/expediente/${c.perro_id}?fecha=${ancla}`}>Expediente</Enlace>}
                                <Enlace href={`/veterinaria/carnet/${c.perro_id}`}>Carnet</Enlace>
                              </div>
                              {!gris && duenoDe.get(c.perro_id) && (
                                <div className="mt-2">
                                  <AvisosWhatsApp
                                    telefono={duenoDe.get(c.perro_id)?.telefono}
                                    datos={{
                                      negocio: negocio.nombre,
                                      servicio: { nombre: c.tipo, categoria: "veterinaria", modo: "cita" },
                                      mascota: c.mascota,
                                      cliente: duenoDe.get(c.perro_id)?.nombre ?? "",
                                      dia: diaLargo(c.inicia_at),
                                      hora: hora12(c.inicia_at),
                                    }}
                                  />
                                </div>
                              )}
                              <AccionesCita
                                id={c.id}
                                estado={c.estado}
                                consultaId={c.consulta_id}
                                puedeAtender={puedeAtender}
                                puedeLeer={puedeLeer}
                                medicos={medicos}
                                medicoId={c.medico_id}
                                fecha={fechaLocalDeInstante(c.inicia_at, zona)}
                                hora={horaLocalDeInstante(c.inicia_at, zona)}
                                version={c.updated_at ?? null}
                                descripcion={describirCita(c.tipo, c.mascota, c.inicia_at, zona)}
                              />
                            </article>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
