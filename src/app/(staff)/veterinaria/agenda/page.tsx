import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatearFechaCalendario, formatearDiaSemana, fechaLocalDeInstante, horaLocalDeInstante, hoyNegocio, sumarDiasFecha, inicioSemana } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { ESTADOS_CITA, type CitaVet, type MedicoVet } from "@/lib/veterinaria/expediente";
import { AccionesCita } from "./acciones-cita";

export default async function AgendaVeterinaria({ searchParams }: { searchParams: Promise<{ vista?: string; fecha?: string; medico?: string; aviso?: string }> }) {
  const zona = await zonaActual();
  const { vista: vistaParam, fecha: fechaParam, medico, aviso } = await searchParams;
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
          <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Agenda clínica</h1>
          <p className="mt-1 text-n-600">{vista === "semana" ? `${formatearFechaCalendario(desde)} – ${formatearFechaCalendario(hasta)}` : formatearFechaCalendario(ancla)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={enlace(vista, sumarDiasFecha(ancla, vista === "semana" ? -7 : -1))}><Button type="button" variante="secundario">← Anterior</Button></Link>
          <Link href={enlace("dia", hoy)}><Button type="button" variante="secundario">Hoy</Button></Link>
          <Link href={enlace(vista, sumarDiasFecha(ancla, vista === "semana" ? 7 : 1))}><Button type="button" variante="secundario">Siguiente →</Button></Link>
          <Link href={enlace("dia", ancla)}><Button type="button" variante={vista === "dia" ? "primario" : "secundario"}>Día</Button></Link>
          <Link href={enlace("semana", ancla)}><Button type="button" variante={vista === "semana" ? "primario" : "secundario"}>Semana</Button></Link>
          <Link href={`/veterinaria/agenda/nueva?fecha=${ancla}`}><Button type="button">Agendar</Button></Link>
        </div>
      </div>

      {medicos.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filtrar por médico">
          <Link href={`/veterinaria/agenda?vista=${vista}&fecha=${ancla}`} className={`rounded-full border px-3 py-1.5 font-semibold ${!filtroMedico ? "border-morado bg-morado-suave text-morado" : "border-n-200 bg-white text-n-700"}`}>Todos los médicos</Link>
          {medicos.map((m) => (
            <Link key={m.id} href={`/veterinaria/agenda?vista=${vista}&fecha=${ancla}&medico=${m.id}`} className={`rounded-full border px-3 py-1.5 font-semibold ${filtroMedico === m.id ? "border-morado bg-morado-suave text-morado" : "border-n-200 bg-white text-n-700"}`}>{m.nombre}</Link>
          ))}
        </nav>
      )}

      {aviso === "urgencia" && <Alert variante="advertencia" titulo="Urgencia agendada">Se empalma con otra cita de ese médico: avísale.</Alert>}
      {error ? (
        <Alert variante="error" titulo="No pudimos cargar la agenda">Recarga la página. Si el problema sigue, avísale al equipo técnico.</Alert>
      ) : medicos.length === 0 ? (
        <Alert variante="advertencia" titulo="Todavía no hay médicos veterinarios">Para agendar citas, un admin designa al menos un médico en <Link href="/veterinaria/medicos" className="font-semibold underline">Médicos</Link>.</Alert>
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
                              <p className="text-n-700">
                                {c.tipo}{c.urgencia ? " · urgencia" : ""} · {c.dueno}
                              </p>
                              {c.motivo && <p className="text-n-600">{c.motivo}</p>}
                              {c.cancelada_motivo && <p className="text-coral-oscuro">Motivo: {c.cancelada_motivo}</p>}
                              <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold">
                                {puedeLeer && <Link href={`/veterinaria/expediente/${c.perro_id}`} className="text-morado hover:underline">Expediente</Link>}
                                <Link href={`/veterinaria/carnet/${c.perro_id}`} className="text-morado hover:underline">Carnet</Link>
                              </div>
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
