import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPermisos } from "@/lib/veterinaria/permisos";
import { Alert } from "@/components/ui/alert";
import { Desplegable } from "@/components/formulario-accion";
import { formatearFechaCalendario, hoyNegocio } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import {
  ESTADOS_CARNET,
  TIPOS_DESPARASITACION,
  type CarnetCompleto,
  type RegistroDesparasitacion,
  type RegistroVacuna,
} from "@/lib/veterinaria/carnet";
import {
  AnularRegistro,
  EnlaceCarnet,
  FormularioDesparasitacion,
  FormularioVacuna,
  RecordatoriosMascota,
  type RequisitoOpcion,
} from "./formularios";
import { cargarMedicos, cargarProductosConLotes, miMedico } from "@/lib/veterinaria/lotes";

const Etiqueta = ({ estado }: { estado: string }) => {
  const e = ESTADOS_CARNET[estado] ?? ESTADOS_CARNET.vigente;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.estilo}`}>{e.etiqueta}</span>;
};

function Seccion({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-bold text-n-900">{titulo}</h2>
        {nota && <p className="mt-0.5 text-sm text-n-600">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function CarnetDeMascota({ params }: { params: Promise<{ perroId: string }> }) {
  const { perroId } = await params;
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const hoy = hoyNegocio(zona);

  const { data: perro } = await supabase
    .from("perros")
    .select("id, nombre, especie, raza, sexo, fecha_nacimiento, microchip, fallecido, clientes(nombre, telefono)")
    .eq("id", perroId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!perro) notFound();
  const dueno = (Array.isArray(perro.clientes) ? perro.clientes[0] : perro.clientes) as { nombre: string; telefono: string | null } | null;

  const [permisos, { data: carnetCrudo, error }, medicos, productos, medicoPropio, { data: requisitosCrudo }, { data: enlace }, { data: ajustes }, { data: hospitalizaciones }] =
    await Promise.all([
      vetPermisos(supabase),
      supabase.rpc("carnet_de_mascota", { p_perro_id: perroId }),
      cargarMedicos(supabase),
      cargarProductosConLotes(supabase),
      miMedico(supabase),
      supabase.from("tipos_requisito_sanitario").select("id, etiqueta").is("deleted_at", null).eq("obligatoria", true).order("orden"),
      supabase.from("carnet_enlaces").select("id").eq("perro_id", perroId).is("revocado_at", null).is("deleted_at", null).maybeSingle(),
      supabase.rpc("veterinaria_ajustes_actuales"),
      supabase.rpc("hospitalizaciones_de_mascota", { p_perro_id: perroId }),
    ]);

  const carnet = (carnetCrudo ?? { vacunas: [], desparasitaciones: [], recordatorios_apagados: false }) as CarnetCompleto;
  const requisitos: RequisitoOpcion[] = (requisitosCrudo ?? []).map((r) => ({ id: r.id as string, etiqueta: r.etiqueta as string }));

  const ajustesActuales = (ajustes ?? {}) as { recordatorios_activos?: boolean; carnet_reemplaza_comprobante?: boolean };
  const hospitalizado = ((hospitalizaciones ?? []) as { id: string; estado: string }[]).find((h) => h.estado === "ingresado");
  const vigentes = carnet.vacunas.filter((v) => v.estado !== "anulada");
  const anuladas = [...carnet.vacunas, ...carnet.desparasitaciones].filter((r) => r.estado === "anulada");
  const desparasitaciones = carnet.desparasitaciones.filter((d) => d.estado !== "anulada");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/veterinaria/carnet" className="text-sm font-semibold text-morado hover:underline">← Carnets</Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-n-900">Carnet de {perro.nombre as string}</h1>
            <p className="mt-1 text-n-600">
              {perro.especie === "gato" ? "Gato" : perro.especie === "otro" ? "Otra especie" : "Perro"}
              {perro.raza ? ` · ${perro.raza}` : ""}
              {perro.microchip ? ` · microchip ${perro.microchip}` : ""} · Dueño: {dueno?.nombre ?? "—"}
              {dueno?.telefono ? ` (${dueno.telefono})` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/veterinaria/carnet/${perroId}/imprimir`} className="inline-flex min-h-10 items-center rounded-md border-[1.5px] border-borde bg-white px-4 text-sm font-semibold text-n-900 hover:bg-n-100">
              Ver e imprimir carnet
            </Link>
            {permisos.certificados && (
              <Link href={`/veterinaria/certificados/nuevo?perro=${perroId}`} className="inline-flex min-h-10 items-center rounded-md border-[1.5px] border-borde bg-white px-4 text-sm font-semibold text-n-900 hover:bg-n-100">
                Emitir certificado de salud
              </Link>
            )}
            <Link href={hospitalizado ? `/veterinaria/hospitalizacion/${hospitalizado.id}` : `/veterinaria/hospitalizacion?perro=${perroId}`} className="inline-flex min-h-10 items-center rounded-md border-[1.5px] border-borde bg-white px-4 text-sm font-semibold text-n-900 hover:bg-n-100">
              {hospitalizado ? "Ver hospitalización" : "Hospitalizar"}
            </Link>
          </div>
        </div>
      </div>

      {error && <Alert variante="error" titulo="No pudimos cargar el carnet">{error.message}</Alert>}
      {perro.fallecido && <Alert variante="advertencia" titulo="Mascota fallecida">Esta mascota está marcada como fallecida.</Alert>}
      {ajustesActuales.carnet_reemplaza_comprobante && (
        <Alert variante="info" titulo="El carnet cuenta como comprobante">
          Una vacuna que marques como «cubre un requisito del check-in» ya no necesita que alguien suba el documento.
        </Alert>
      )}

      <Seccion titulo="Vacunas" nota="La más reciente primero. Una vacuna vence en su próxima dosis, o a los 12 meses si no tiene.">
        {vigentes.length === 0 ? (
          <p className="text-n-700">Todavía no hay vacunas registradas.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-n-200">
            {vigentes.map((v: RegistroVacuna) => (
              <li key={v.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-n-900">{v.biologico}</p>
                  <div className="flex items-center gap-2">
                    <Etiqueta estado={v.estado} />
                    {v.cubre_requisito && <span className="rounded-full bg-morado-suave px-2 py-0.5 text-xs font-semibold text-morado">Cubre el check-in</span>}
                  </div>
                </div>
                <p className="text-sm text-n-700">
                  Aplicada el {formatearFechaCalendario(v.fecha_aplicacion)}
                  {v.proxima_dosis ? ` · próxima dosis ${formatearFechaCalendario(v.proxima_dosis)}` : ` · vigente hasta ${formatearFechaCalendario(v.vigente_hasta)}`}
                  {v.laboratorio ? ` · ${v.laboratorio}` : ""}
                  {v.lote ? ` · lote ${v.lote}` : ""}
                  {v.dosis ? ` · ${v.dosis}` : ""}
                </p>
                <p className="text-sm text-n-600">
                  Aplicó: {v.medico ?? "—"}
                  {v.cedula ? ` (cédula ${v.cedula})` : ""}
                  {v.notas ? ` · ${v.notas}` : ""}
                </p>
                {permisos.vacunas && <AnularRegistro perroId={perroId} tipo="vacuna" id={v.id} />}
              </li>
            ))}
          </ul>
        )}
        {permisos.vacunas ? (
          <Desplegable texto="Registrar vacuna" variante="primario">
            <FormularioVacuna perroId={perroId} hoy={hoy} productos={productos} medicos={medicos} medicoPropio={medicoPropio} requisitos={requisitos} />
          </Desplegable>
        ) : (
          <p className="text-sm text-n-600">Registrar vacunas es de un médico veterinario o de quien tenga el permiso «Registrar vacunas y desparasitaciones».</p>
        )}
      </Seccion>

      <Seccion titulo="Desparasitaciones">
        {desparasitaciones.length === 0 ? (
          <p className="text-n-700">Todavía no hay desparasitaciones registradas.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-n-200">
            {desparasitaciones.map((d: RegistroDesparasitacion) => (
              <li key={d.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-n-900">
                    {d.producto} <span className="font-normal text-n-500">· {TIPOS_DESPARASITACION[d.tipo]}</span>
                  </p>
                  <Etiqueta estado={d.estado} />
                </div>
                <p className="text-sm text-n-700">
                  Aplicada el {formatearFechaCalendario(d.fecha_aplicacion)}
                  {d.proxima_dosis ? ` · próxima ${formatearFechaCalendario(d.proxima_dosis)}` : ` · vigente hasta ${formatearFechaCalendario(d.vigente_hasta)}`}
                  {d.lote ? ` · lote ${d.lote}` : ""}
                  {d.dosis ? ` · ${d.dosis}` : ""}
                  {d.medico ? ` · ${d.medico}` : ""}
                </p>
                {permisos.vacunas && <AnularRegistro perroId={perroId} tipo="desparasitacion" id={d.id} />}
              </li>
            ))}
          </ul>
        )}
        {permisos.vacunas && (
          <Desplegable texto="Registrar desparasitación" variante="primario">
            <FormularioDesparasitacion perroId={perroId} hoy={hoy} productos={productos} medicos={medicos} medicoPropio={medicoPropio} />
          </Desplegable>
        )}
      </Seccion>

      {permisos.vacunas && (
        <Seccion titulo="Recordatorios de próxima dosis" nota={ajustesActuales.recordatorios_activos ? "El negocio los tiene prendidos." : "El negocio los tiene apagados (se prenden en Ajustes de Veterinaria); aun así puedes verlos en la lista de recordatorios."}>
          <RecordatoriosMascota perroId={perroId} apagados={carnet.recordatorios_apagados} />
        </Seccion>
      )}

      {permisos.vacunas && (
        <Seccion titulo="Carnet verificable">
          <EnlaceCarnet perroId={perroId} vigente={Boolean(enlace)} />
        </Seccion>
      )}

      {anuladas.length > 0 && (
        <details className="rounded-lg border border-n-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold text-n-800">Registros anulados ({anuladas.length})</summary>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-n-700">
            {anuladas.map((r) => (
              <li key={r.id}>
                <span className="font-semibold">{"biologico" in r ? r.biologico : r.producto}</span> del {formatearFechaCalendario(r.fecha_aplicacion)} — anulada: {r.anulada_motivo}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
