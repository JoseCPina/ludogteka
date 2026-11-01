import { sinTitulosVacios } from "@/lib/veterinaria/portal-texto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { Alert } from "@/components/ui/alert";
import { Desplegable } from "@/components/formulario-accion";
import { etiquetaEspecie } from "@/lib/veterinaria/buscar";
import { formatearFecha, formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { ESTADOS_ESTIMADO, TIPOS_CITA, TIPOS_EVENTO, dinero, type EstimadoResumen, type EventoLinea, type MedicoVet } from "@/lib/veterinaria/expediente";
import { CapturarResultado, IniciarConsulta, SubirAdjunto } from "../captura";
import { Enlace } from "@/components/ui/enlace";

type Lectura = { recurso: string; persona: string; leido_at: string };

const ETIQUETA_LECTURA: Record<string, string> = { expediente: "el expediente", consulta: "una consulta", linea_tiempo: "la línea de tiempo", adjunto: "un archivo", resultado: "un resultado", estimado: "un estimado" };

export default async function ExpedienteMascota({ params, searchParams }: { params: Promise<{ perroId: string }>; searchParams: Promise<{ aviso?: string; fecha?: string }> }) {
  const { perroId } = await params;
  const { aviso, fecha } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const zona = await zonaActual();
  const hoy = hoyNegocio(zona);

  const { data: mascota } = await supabase.from("perros").select("id, nombre, especie, raza, fecha_nacimiento, esterilizado, clientes(id, nombre, telefono)").eq("id", perroId).is("deleted_at", null).maybeSingle();
  if (!mascota) {
    return <Alert variante="error" titulo="No encontramos a esa mascota">Búscala de nuevo en <Enlace href="/veterinaria/expediente" enTexto>Expediente clínico</Enlace>.</Alert>;
  }
  const dueno = (Array.isArray(mascota.clientes) ? mascota.clientes[0] : mascota.clientes) as { id: string; nombre: string; telefono: string | null } | null;
  const [{ data: puedeLeer }, { data: puedeAtender }, { data: puedeEstimar }] = await Promise.all([
    supabase.rpc("vet_puede_leer"),
    supabase.rpc("vet_puede", { p_permiso: "atender_consultas" }),
    supabase.rpc("vet_puede", { p_permiso: "crear_estimados" }),
  ]);
  if (puedeLeer !== true) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Enlace href="/veterinaria" className="text-sm">← Veterinaria</Enlace>
        <Alert variante="advertencia" titulo="No tienes acceso al expediente">Ver el expediente clínico es de un médico veterinario, de admin o de quien tenga «Atender consultas». Mientras, puedes ver su <Enlace href={`/veterinaria/carnet/${perroId}`} enTexto>carnet</Enlace>.</Alert>
      </div>
    );
  }
  const [{ data: lineaCrudo, error: errorLinea }, { data: estimadosCrudo }, { data: medicosCrudo }, { data: miMedico }, lecturas] = await Promise.all([
    supabase.rpc("vet_linea_tiempo", { p_perro: perroId }),
    supabase.rpc("vet_estimados_de_mascota", { p_perro: perroId }),
    supabase.rpc("vet_medicos_lista"),
    supabase.rpc("vet_mi_medico"),
    sesion?.rol === "admin" ? supabase.rpc("vet_lecturas_lista", { p_perro: perroId, p_limite: 40 }) : Promise.resolve({ data: null }),
  ]);
  const linea = (lineaCrudo ?? []) as EventoLinea[];
  const sinFirmar = linea.filter((e) => e.tipo === "consulta" && e.estado === "borrador").length;
  const estimados = (estimadosCrudo ?? []) as EstimadoResumen[];
  const medicos = (medicosCrudo ?? []) as MedicoVet[];
  const lecturasLista = (lecturas.data ?? []) as Lectura[];

  return (
    <div className="flex flex-col gap-6">
      {aviso === "descartado" && <Alert variante="exito" titulo="Borrador descartado">La consulta en borrador se quitó del expediente.</Alert>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Enlace href="/veterinaria/expediente" className="text-sm">← Expediente clínico</Enlace>
          <h1 className="mt-1 text-2xl font-bold text-n-900">{mascota.nombre}</h1>
          {/* QA S41 (N139): las consultas en borrador de esta mascota, contadas de la misma línea de tiempo que se lista abajo. */}
          <span data-sin-firmar={sinFirmar} className={`mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${sinFirmar > 0 ? "bg-ambar-suave text-ambar-oscuro" : "bg-n-100 text-n-600"}`}>
            {sinFirmar} {sinFirmar === 1 ? "consulta sin firmar" : "consultas sin firmar"}
          </span>
          <p className="text-n-700">
            {etiquetaEspecie(mascota.especie as string | null)}{mascota.raza ? ` · ${mascota.raza}` : ""}
            {mascota.fecha_nacimiento ? ` · nació el ${formatearFechaCalendario(mascota.fecha_nacimiento as string)}` : ""}
            {mascota.esterilizado ? " · esterilizado" : ""} · de {dueno?.nombre ?? "—"}{dueno?.telefono ? ` · ${dueno.telefono}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-semibold">
          <Enlace href={`/veterinaria/carnet/${perroId}`}>Carnet</Enlace>
          {/* Si se llegó desde un día de la agenda, «Agendar cita» abre en ese día (N116). */}
          <Enlace href={`/veterinaria/agenda/nueva?perro=${perroId}${fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `&fecha=${fecha}` : ""}`}>Agendar cita</Enlace>
          {puedeEstimar === true && <Enlace href={`/veterinaria/estimados/nuevo?perro=${perroId}`}>Nuevo estimado</Enlace>}
        </div>
      </div>

      {puedeAtender === true && (
        <section className="flex flex-wrap items-start gap-3">
          <Desplegable texto="Nueva consulta" variante="primario">
            {medicos.length === 0 ? <p className="text-sm text-n-700">Un admin designa antes a un médico en Veterinaria → Médicos.</p> : <IniciarConsulta perroId={perroId} medicos={medicos} medicoPropio={(miMedico as string | null) ?? null} />}
          </Desplegable>
          <Desplegable texto="Capturar un resultado de laboratorio"><CapturarResultado perroId={perroId} consultaId={null} hoy={hoy} /></Desplegable>
          <Desplegable texto="Adjuntar una foto o PDF"><SubirAdjunto perroId={perroId} consultaId={null} /></Desplegable>
        </section>
      )}

      {errorLinea && <Alert variante="error" titulo="No pudimos cargar la línea de tiempo">Recarga la página. Si sigue, avísale al equipo técnico.</Alert>}

      {estimados.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Estimados</h2>
          <ul className="divide-y divide-n-200">
            {estimados.map((e) => {
              const est = ESTADOS_ESTIMADO[e.estado] ?? { etiqueta: e.estado, estilo: "bg-n-100" };
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Enlace href={`/veterinaria/estimados/${e.id}`}>{e.titulo} · v{e.version}</Enlace>
                  <span className="flex items-center gap-2 text-sm text-n-700">
                    {dinero(e.total_min)} – {dinero(e.total_max)}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${est.estilo}`}>{e.vencido ? "Vencido" : est.etiqueta}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-label="Línea de tiempo">
        <h2 className="text-lg font-bold text-n-900">Línea de tiempo</h2>
        {linea.length === 0 ? (
          <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">Esta mascota todavía no tiene nada en su expediente.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {linea.map((e) => {
              const t = TIPOS_EVENTO[e.tipo] ?? { etiqueta: e.tipo, estilo: "bg-n-100" };
              const anulada = e.estado === "anulada";
              const fecha = e.tipo === "vacuna" || e.tipo === "desparasitacion" || e.tipo === "peso" || e.tipo === "certificado" || e.tipo === "laboratorio" || e.tipo === "receta"
                ? formatearFechaCalendario(String(e.cuando).slice(0, 10))
                : formatearFecha(e.cuando, zona);
              const enlace =
                e.tipo === "consulta" ? `/veterinaria/consulta/${e.ref_id}`
                : e.tipo === "adjunto" ? `/api/veterinaria/adjunto/${e.ref_id}`
                : e.tipo === "hospitalizacion" ? `/veterinaria/hospitalizacion/${e.ref_id}`
                : e.tipo === "certificado" ? `/veterinaria/certificados/${e.ref_id}`
                : e.tipo === "receta" ? `/veterinaria/recetas/${e.ref_id}`
                : e.tipo === "vacuna" || e.tipo === "desparasitacion" ? `/veterinaria/carnet/${perroId}`
                : e.tipo === "laboratorio" && e.consulta_id ? `/veterinaria/consulta/${e.consulta_id}` : null;
              return (
                <li key={`${e.tipo}-${e.ref_id}`} className={`rounded-lg border border-n-200 bg-white px-4 py-3 ${anulada ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.estilo}`}>{t.etiqueta}</span>
                    <span className="text-sm text-n-600">{fecha}</span>
                    {e.estado === "borrador" && <span className="rounded-full bg-ambar-suave px-2 py-0.5 text-xs font-semibold text-ambar-oscuro">Borrador sin firmar</span>}
                    {anulada && <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">Anulado</span>}
                  </div>
                  <p className={`mt-1 font-semibold text-n-900 ${anulada ? "line-through" : ""}`}>
                    {enlace ? <Enlace href={enlace} {...(e.tipo === "adjunto" ? { target: "_blank", rel: "noopener" } : {})}>{e.tipo === "consulta" ? `${TIPOS_CITA[e.titulo.toLowerCase()] ?? e.titulo}` : e.titulo}</Enlace> : e.titulo}
                  </p>
                  {e.detalle && sinTitulosVacios(e.detalle) && <p className="text-sm text-n-700">{e.tipo === "receta" ? `Medicamentos: ${e.detalle}` : sinTitulosVacios(e.detalle)}</p>}
                  {e.tipo === "consulta" && e.extra && <p className="text-sm text-n-700">Diagnóstico: {e.extra}</p>}
                  {e.tipo === "laboratorio" && Number(e.extra) > 0 && <p className="text-sm font-semibold text-ambar-oscuro">{e.extra} valor(es) fuera de rango</p>}
                  {e.medico && <p className="text-xs text-n-500">{e.medico}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {sesion?.rol === "admin" && (
        <section className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Quién abrió este expediente</h2>
          <p className="text-sm text-n-600">Las últimas lecturas, para que todo acceso quede a la vista.</p>
          {lecturasLista.length === 0 ? (
            <p className="text-n-700">Todavía no hay lecturas.</p>
          ) : (
            <ul className="divide-y divide-n-200 text-sm">
              {lecturasLista.map((l, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span><strong>{l.persona}</strong> abrió {ETIQUETA_LECTURA[l.recurso] ?? l.recurso}</span>
                  <span className="text-n-600">{formatearFecha(l.leido_at, zona)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
