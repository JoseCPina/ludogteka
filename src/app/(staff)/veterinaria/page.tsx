import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { formatearFechaCalendario } from "@/lib/formato";

type Alertas = { caducados?: number; por_caducar?: number; bajo_minimo?: number };
type Permiso = { id: string; tipo: string; vencimiento: string; dias: number; estado: string };

function Tarjeta({ href, titulo, children }: { href?: string; titulo: string; children: React.ReactNode }) {
  const cuerpo = (
    <>
      <h2 className="text-lg font-bold text-n-900">{titulo}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm text-n-700">{children}</div>
    </>
  );
  const base = "rounded-lg border border-n-200 bg-white p-5";
  return href ? (
    <Link href={href} className={`${base} hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave`}>
      {cuerpo}
    </Link>
  ) : (
    <div className={`${base} border-dashed bg-n-50`}>{cuerpo}</div>
  );
}

const Contador = ({ n, texto, estilo }: { n: number; texto: string; estilo: string }) => (
  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${n > 0 ? estilo : "bg-n-100 text-n-600"}`}>
    {n} {texto}
  </span>
);

export default async function VeterinariaInicio() {
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const puedeLotes = tienePermiso(sesion, "lotes_clinicos");
  const puedeConfig = tienePermiso(sesion, "configuracion_negocio");
  const esAdmin = sesion?.rol === "admin";

  const [{ data: alertasCrudo }, { data: permisosCrudo }, { data: atencionCrudo }, { data: censoCrudo }] = await Promise.all([
    puedeLotes ? supabase.rpc("inventario_clinico_alertas") : Promise.resolve({ data: null }),
    puedeConfig ? supabase.rpc("permisos_establecimiento_por_vencer") : Promise.resolve({ data: null }),
    supabase.rpc("veterinaria_atencion"),
    supabase.rpc("hospitalizacion_censo"),
  ]);
  const atencion = (atencionCrudo ?? {}) as { recordatorios_pendientes?: number; dosis_atrasadas?: number; consentimientos_pendientes?: number };
  const internados = Array.isArray(censoCrudo) ? censoCrudo.length : 0;
  const alertas = ((alertasCrudo ?? {}) as Alertas) ?? {};
  const permisos = (permisosCrudo ?? []) as Permiso[];
  const vencidos = permisos.filter((p) => p.estado === "vencido");
  const porVencer = permisos.filter((p) => p.estado !== "vencido");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Veterinaria</h1>
        <p className="mt-1 max-w-3xl text-n-600">Carnets y certificados, hospitalización, inventario clínico por lote, médicos veterinarios y los permisos del establecimiento.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Tarjeta href="/veterinaria/carnet" titulo="Carnets">
          <p>Vacunas y desparasitaciones de cada mascota, con su carnet imprimible y verificable.</p>
        </Tarjeta>

        <Tarjeta href="/veterinaria/hospitalizacion" titulo="Hospitalización">
          <p>Quién está internado, su hoja de medicación, monitoreo y cuenta.</p>
          <span className="flex flex-wrap gap-2">
            <Contador n={internados} texto="internados" estilo="bg-morado-suave text-morado" />
            <Contador n={Number(atencion.dosis_atrasadas ?? 0)} texto="dosis atrasadas" estilo="bg-ambar-suave text-ambar-oscuro" />
          </span>
        </Tarjeta>

        <Tarjeta href="/veterinaria/certificados" titulo="Certificados de salud">
          <p>Los certificados emitidos, con la vigencia y el médico que firma.</p>
        </Tarjeta>

        <Tarjeta href="/veterinaria/recordatorios" titulo="Recordatorios de dosis">
          <p>Vacunas y desparasitaciones que ya les toca a las mascotas.</p>
          <span className="flex flex-wrap gap-2">
            <Contador n={Number(atencion.recordatorios_pendientes ?? 0)} texto="por mandar" estilo="bg-ambar-suave text-ambar-oscuro" />
          </span>
        </Tarjeta>

        <Tarjeta href="/veterinaria/consentimientos" titulo="Consentimientos">
          <p>Hospitalización, cirugía, anestesia y eutanasia: textos y firmas.</p>
          <span className="flex flex-wrap gap-2">
            <Contador n={Number(atencion.consentimientos_pendientes ?? 0)} texto="sin firmar" estilo="bg-ambar-suave text-ambar-oscuro" />
          </span>
        </Tarjeta>

        <Tarjeta href="/veterinaria/ajustes" titulo="Ajustes de Veterinaria">
          <p>Recordatorios, vigencia de certificados, carnet como comprobante y precio del día.</p>
        </Tarjeta>

        <Tarjeta href="/veterinaria/inventario" titulo="Inventario clínico">
          <p>Medicamentos y material clínico por lote, con caducidades y clasificación.</p>
          {puedeLotes ? (
            <span className="flex flex-wrap gap-2">
              <Contador n={Number(alertas.caducados ?? 0)} texto="caducados" estilo="bg-coral-suave text-coral-oscuro" />
              <Contador n={Number(alertas.por_caducar ?? 0)} texto="por caducar" estilo="bg-ambar-suave text-ambar-oscuro" />
              <Contador n={Number(alertas.bajo_minimo ?? 0)} texto="bajo mínimo" estilo="bg-ambar-suave text-ambar-oscuro" />
            </span>
          ) : (
            <span className="text-n-500">Solo consulta.</span>
          )}
        </Tarjeta>

        {esAdmin && (
          <Tarjeta href="/veterinaria/medicos" titulo="Médicos">
            <p>Quién es médico veterinario, con su cédula, su CPA del SITPV y sus folios de receta.</p>
          </Tarjeta>
        )}

        <Tarjeta href="/admin/perfil" titulo="Establecimiento y permisos">
          <p>Aviso de funcionamiento, responsable autorizado y permisos con su vencimiento.</p>
          {puedeConfig && (
            <span className="flex flex-col gap-1">
              {vencidos.length > 0 && (
                <span className="font-semibold text-coral-oscuro">
                  {vencidos.length === 1 ? `${vencidos[0].tipo} está vencido` : `${vencidos.length} permisos vencidos`}
                </span>
              )}
              {porVencer.length > 0 && (
                <span className="font-semibold text-ambar-oscuro">
                  {porVencer.length === 1
                    ? `${porVencer[0].tipo} vence el ${formatearFechaCalendario(porVencer[0].vencimiento)}`
                    : `${porVencer.length} permisos por vencer · el primero el ${formatearFechaCalendario(porVencer[0].vencimiento)}`}
                </span>
              )}
              {permisos.length === 0 && <span className="text-n-500">Ningún permiso vencido ni por vencer.</span>}
            </span>
          )}
        </Tarjeta>

        <Tarjeta titulo="Pacientes y consultas">
          <span className="w-fit rounded-full bg-morado-suave px-2.5 py-1 text-xs font-semibold text-morado">Próximamente</span>
          <p>Todavía no está disponible. Llegará en las siguientes fases del módulo.</p>
        </Tarjeta>
      </div>
    </div>
  );
}
