import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { FormularioAccion } from "@/components/formulario-accion";
import { buscarMascotas, etiquetaEspecie } from "@/lib/veterinaria/buscar";
import { hoyNegocio } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { fechaPedidaValida, proponerFechaHoraPorPersona } from "@/lib/estetica/proponer-hora";
import { sumarDiasFecha } from "@/lib/formato";
import { cargarHorarioSemana } from "@/lib/estetica/horario-semana";
import { CamposCitaVet } from "./campos-cita";
import type { CitaVet, MedicoVet, TipoCitaConfig } from "@/lib/veterinaria/expediente";
import { agendarCita } from "../../expediente/actions";

export default async function NuevaCitaVet({ searchParams }: { searchParams: Promise<{ q?: string; perro?: string; fecha?: string; cliente?: string }> }) {
  const { q: qParam, perro, fecha, cliente } = await searchParams;
  const supabase = await createSupabaseServerClient();
  // De vuelta del alta de un cliente sin mascota todavía: la búsqueda abre con su nombre.
  let qCrudo = qParam;
  if (!qCrudo && !perro && cliente && /^[0-9a-f-]{36}$/.test(cliente)) {
    const { data: c } = await supabase.from("clientes").select("nombre").eq("id", cliente).maybeSingle();
    qCrudo = (c?.nombre as string | undefined) ?? undefined;
  }
  const zona = await zonaActual();
  const hoy = hoyNegocio(zona);

  if (!perro) {
    const filas = await buscarMascotas(supabase, qCrudo ?? "");
    return (
      <div className="flex flex-col gap-5">
        <div>
          <Link href="/veterinaria/agenda" className="text-sm font-semibold text-morado hover:underline">← Agenda clínica</Link>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Agendar una cita</h1>
          <p className="mt-1 text-n-600">Primero elige a la mascota: busca por su nombre, el de su dueño o su teléfono.</p>
        </div>
        <form className="flex max-w-xl items-end gap-3">
          <input type="hidden" name="fecha" value={fecha ?? ""} />
          <div className="flex-1"><Field label="Buscar mascota o dueño" name="q" defaultValue={qCrudo ?? ""} placeholder="Motita, Ana, 444…" /></div>
          <Button type="submit">Buscar</Button>
        </form>
        {/* QA S27: el alta del dueño sigue a la de su mascota y regresa aquí con ella elegida (?perro=). */}
        <Link href={`/clientes/nuevo?volver=${encodeURIComponent("/veterinaria/agenda/nueva")}`} className="self-start text-sm font-semibold text-morado hover:underline" data-nuevo-cliente-vet>
          + Nuevo cliente y su mascota
        </Link>
        {filas.length === 0 ? (
          <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">No encontramos a nadie con eso. Da de alta al dueño y a su mascota con <Link href={`/clientes/nuevo?volver=${encodeURIComponent("/veterinaria/agenda/nueva")}`} className="font-semibold text-morado underline">Nuevo cliente</Link>.</p>
        ) : (
          <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
            {filas.map((f) => (
              <li key={f.id}>
                <Link href={`/veterinaria/agenda/nueva?perro=${f.id}${fecha ? `&fecha=${fecha}` : ""}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50">
                  <span className="font-semibold text-n-900">{f.nombre} <span className="font-normal text-n-500">· {etiquetaEspecie(f.especie)}</span></span>
                  <span className="text-sm text-n-600">{f.dueno}{f.telefono ? ` · ${f.telefono}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const [{ data: mascota }, { data: tiposCrudo }, { data: medicosCrudo }, { data: miMedico }] = await Promise.all([
    supabase.from("perros").select("id, nombre, especie, clientes(nombre, telefono)").eq("id", perro).maybeSingle(),
    supabase.rpc("vet_tipos_cita_lista"),
    supabase.rpc("vet_medicos_lista"),
    supabase.rpc("vet_mi_medico"),
  ]);
  const tipos = ((tiposCrudo ?? []) as TipoCitaConfig[]).filter((t) => t.activo);
  const medicos = (medicosCrudo ?? []) as MedicoVet[];
  // Fecha y hora propuestas: la siguiente media hora que no ha pasado y que el médico tiene libre (QA S27);
  // la fecha de ?fecha= manda si viene.
  const desde = fechaPedidaValida(fecha, zona) ?? hoy;
  const [horarioSemana, { data: citasCrudo }] = await Promise.all([
    cargarHorarioSemana(supabase, zona),
    supabase.rpc("vet_agenda", { p_desde: desde, p_hasta: sumarDiasFecha(desde, 14), p_medico: null }),
  ]);
  const ocupados: Record<string, { inicio: string; fin: string }[]> = Object.fromEntries(medicos.map((m) => [m.id, []]));
  for (const c of (citasCrudo ?? []) as CitaVet[]) {
    if (!["cancelada", "no_llego"].includes(c.estado)) (ocupados[c.medico_id] ??= []).push({ inicio: c.inicia_at, fin: c.termina_at });
  }
  const propuestas = await proponerFechaHoraPorPersona(supabase, zona, fecha, ocupados, tipos.find((t) => t.clave === "consulta")?.duracion_min ?? 30);
  const medicoInicial = (miMedico as string | null) ?? medicos[0]?.id;
  const propuesta = propuestas[medicoInicial ?? ""] ?? propuestas.__todos;
  const dueno = mascota ? ((Array.isArray(mascota.clientes) ? mascota.clientes[0] : mascota.clientes) as { nombre: string } | null) : null;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <Link href="/veterinaria/agenda/nueva" className="text-sm font-semibold text-morado hover:underline">← Elegir otra mascota</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Agendar una cita</h1>
        {mascota && <p className="mt-1 text-n-700">{mascota.nombre} · {etiquetaEspecie(mascota.especie as string | null)} · de {dueno?.nombre ?? "—"}</p>}
      </div>
      {!mascota ? (
        <Alert variante="error" titulo="No encontramos a esa mascota">Búscala de nuevo.</Alert>
      ) : medicos.length === 0 ? (
        <Alert variante="advertencia" titulo="Todavía no hay médicos veterinarios">
          Antes de agendar hace falta al menos un médico con cuenta y cédula profesional. Un admin lo designa (o se designa a sí mismo con «Yo soy el médico») en{" "}
          <Link href="/bienvenida/medico" className="font-semibold underline">Médico veterinario</Link> o en <Link href="/veterinaria/medicos" className="font-semibold underline">Médicos</Link>.
        </Alert>
      ) : (
        <FormularioAccion accion={agendarCita} textoBoton="Agendar cita" className="rounded-lg border border-n-200 bg-white p-5">
          <input type="hidden" name="perro_id" value={perro} />
          <CamposCitaVet
            tipos={tipos}
            medicos={medicos}
            medicoInicial={medicoInicial}
            hoy={hoy}
            fechaInicial={propuesta.fecha}
            horaInicial={propuesta.hora}
            propuestaPorMedico={propuestas}
            horario={horarioSemana}
          />
          <Textarea label="Motivo (opcional)" name="motivo" rows={2} />
          <p className="text-sm text-n-600">Un médico no puede tener dos citas encimadas; una urgencia sí entra y se avisa.</p>
        </FormularioAccion>
      )}
    </div>
  );
}
