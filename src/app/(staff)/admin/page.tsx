import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { InvitarStaff } from "./invitar-staff";
import { ListaCuentas, type Cuenta } from "./lista-cuentas";
import { DescuentoConfig } from "./descuento-config";
import { DiagnosticoGoogle } from "./diagnostico-google";
import { UbicacionNegocio } from "./ubicacion-negocio";
import { usaEstancias } from "@/lib/plan/modulos";
import { ConfiguracionNegocio, type ConfiguracionVigente } from "./configuracion-negocio";
import { HorarioNegocio } from "./horario-negocio";
import type { DiaHorario } from "./configuracion-actions";
import { TarifasFaltantes } from "./tarifas-faltantes";
import { cargarServiciosConHuecos } from "@/lib/tarifas/huecos";
import { TableroDia } from "../tablero-dia";
import { ExtrasTablero } from "@/components/extras/extras-tablero";
import { RecordatorioPago } from "./recordatorio-pago";
import { AvanceWeb } from "@/components/avance-web";
import { VideosInicio } from "@/components/ayuda/videos-inicio";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { ListaPersonal, type PersonaStaff } from "./lista-personal";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { resumenDeCobro } from "@/lib/pagos/conexion";
import { leerTodo } from "@/lib/supabase/paginar";
import { Enlace } from "@/components/ui/enlace";
import { arrancarTodas } from "@/lib/supabase/arrancar";

// Admin ve todo. Una persona de recepción con permisos extra llega aquí
// solo con las secciones que le tocan (el middleware la deja entrar con
// personal, configuración o tarifas); lo demás es de admin y ni se consulta.
async function SeccionesAdmin() {
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const esAdmin = sesion?.rol === "admin";
  const puedeConfig = tienePermiso(sesion, "configuracion_negocio");
  const puedeTarifas = tienePermiso(sesion, "tarifas");
  const puedePersonal = tienePermiso(sesion, "personal");
  // Integraciones del negocio: con qué cobra (src/lib/pagos) y su ubicación
  // y consumo de Google Maps (la llave es de PeluDesk, con tope por mes).
  const puedeUbicacion = esAdmin || puedeConfig;
  const nada = Promise.resolve({ data: null, error: null });
  // Tiempo del panel (31 de octubre de 2026): lo que no depende de nada arranca A LA VEZ (antes eran cinco viajes a la
  // base uno tras otro: cobro, perfil, personal, huecos de tarifa…).
  const previas = arrancarTodas({
    // QA S16/R22 (N61): una sola dirección del negocio: negocio_perfil.direccion (la sucursal se sincroniza sola).
    perfil: supabase.from("negocio_perfil").select("direccion").is("deleted_at", null).maybeSingle(),
    personal: !esAdmin && puedePersonal ? supabase.rpc("listar_personal") : nada,
    // Mismo cálculo que la matriz y la lista de Servicios (src/lib/tarifas/huecos.ts) y solo de los
    // módulos que el negocio tiene prendidos: un servicio apagado no se cobra, no es un hueco.
    huecos: cargarServiciosConHuecos(supabase, sesion?.modulos ?? []),
  });
  const [cobroIntegrado, ubicacion] = await Promise.all([
    esAdmin ? resumenDeCobro(await negocioActual()) : Promise.resolve(null),
    puedeUbicacion
      ? Promise.all([
          supabase.from("sucursales").select("direccion, lat").is("deleted_at", null).order("activo", { ascending: false }).limit(1).maybeSingle(),
          esAdmin ? supabase.rpc("maps_consumo_mes") : Promise.resolve({ data: null }),
        ])
      : Promise.resolve(null),
  ]);
  const [
    { data, error },
    { data: topeData },
    { data: configData },
    { data: horarioVigente },
    { data: horarioUltimo },
  ] = await Promise.all([
    esAdmin ? leerTodo<Record<string, unknown>>(() => supabase.rpc("listar_cuentas").order("id")) : nada,
    esAdmin ? supabase.rpc("resolver_tope_descuento_recepcion") : nada,
    supabase.rpc("resolver_cupo_configuracion"),
    supabase.rpc("horario_semana_vigente"),
    supabase.from("horario_semana").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const { data: perfilDir } = await previas.perfil;
  const direccionNegocio = ((perfilDir?.direccion as string | null) ?? "").trim();
  const negocioIdActual = (await negocioActual()).id;
  const { data: personal } = await previas.personal;
  const serviciosSinTarifa = await previas.huecos;
  const topeFila = Array.isArray(topeData) ? topeData[0] : topeData;
  const configVigente = (Array.isArray(configData) ? configData[0] : configData) as
    | ConfiguracionVigente
    | null;
  // La misma configuración vigente sirve para la ubicación (antes se pedía dos veces).
  const cupoUbic = ubicacion ? (configVigente as unknown as { base_direccion: string | null; base_lat: number | null } | null) : null;

  return (
    <>

      {esAdmin && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-n-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-bold text-n-900">Permisos de recepción</h2>
            <p className="mt-1 text-sm text-n-600">
              Dale a una persona de recepción permisos extra para que te ayude a administrar.
            </p>
          </div>
          <Enlace href="/admin/permisos">
            Administrar permisos →
          </Enlace>
        </section>
      )}

      {esAdmin && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-n-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-bold text-n-900">Importar clientes y mascotas</h2>
            <p className="mt-1 text-sm text-n-600">
              Pasa tu lista de un Excel o CSV al sistema, con vista previa y con opción de deshacer.
            </p>
          </div>
          <Enlace href="/admin/importar">
            Importar →
          </Enlace>
        </section>
      )}

      {puedeConfig && (
        <section id="configuracion" className="scroll-mt-20 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-n-900">Configuración del negocio</h2>
          <ConfiguracionNegocio vigente={configVigente} conCupo={usaEstancias(sesion?.modulos ?? [])} />
        </section>
      )}

      {ubicacion && (
        <section id="ubicacion" className="scroll-mt-20 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-n-900">Ubicación para recolección</h2>
          <UbicacionNegocio
            direccion={direccionNegocio}
            base={cupoUbic?.base_direccion ?? ""}
            conCoordenadas={{ negocio: ubicacion[0].data?.lat != null, base: cupoUbic?.base_lat != null }}
            consumo={(ubicacion[1].data as { usadas: number; tope: number } | null) ?? null}
          />
        </section>
      )}

      {puedeConfig && (
        <section id="horario" className="scroll-mt-20 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-n-900">Horario de atención</h2>
          <HorarioNegocio vigente={(horarioVigente ?? []) as DiaHorario[]} negocioId={negocioIdActual} version={(horarioUltimo?.updated_at as string | undefined) ?? null} />
        </section>
      )}

      {puedeTarifas && (
        <section className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-n-900">Precios sin capturar</h2>
          <TarifasFaltantes servicios={serviciosSinTarifa} />
        </section>
      )}

      {puedePersonal && (
        <section id="invitar" className="scroll-mt-20 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-n-900">Invitar personal</h2>
          <InvitarStaff />
        </section>
      )}

      {!esAdmin && puedePersonal && (
        <section className="rounded-lg border border-n-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-n-900">Personal</h2>
          <ListaPersonal zona={zona} personas={(personal as PersonaStaff[] | null) ?? []} />
        </section>
      )}

      {esAdmin && (
      <>
      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-n-900">Tope de descuentos de recepción</h2>
        <DescuentoConfig
          topeActual={topeFila?.estado === "configurado" ? Number(topeFila.tope_recepcion) : null}
          vigenteDesde={topeFila?.vigencia_desde ?? null}
        />
      </section>

      {cobroIntegrado && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-n-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-bold text-n-900">Cobro con terminal</h2>
            <p className="mt-1 text-sm text-n-700">
              {cobroIntegrado.proveedor === "manual"
                ? "Hoy registras los cobros a mano."
                : cobroIntegrado.activo
                  ? `Cobras con ${cobroIntegrado.nombre}${cobroIntegrado.simulado ? " (simulación: no mueve dinero)" : ""}.`
                  : cobroIntegrado.motivo}
            </p>
          </div>
          <Enlace href="/admin/pagos" enTexto>
            Configurar
          </Enlace>
        </section>
      )}

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-n-900">Conexión con Google Maps</h2>
        <DiagnosticoGoogle />
      </section>
      </>
      )}

      {esAdmin && (
      <section>
        <h2 className="mb-4 text-lg font-bold text-n-900">Cuentas</h2>
        {error ? (
          <Alert variante="error" titulo="No pudimos cargar las cuentas">
            Recarga la página. Si el problema sigue, avísale al equipo técnico.
          </Alert>
        ) : (
          <ListaCuentas cuentas={(data as Cuenta[]) ?? []} miId={sesion?.user.id ?? null} />
        )}
      </section>
      )}
    </>
  );
}

/** El recordatorio de pago del admin (cobro fallido): su propia consulta, para no detener al resto. */
async function RecordatorioPagoSiToca() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("mi_cobro");
  const cobro = data as { toca_recordatorio?: boolean; solo_lectura_desde?: string | null } | null;
  if (!cobro?.toca_recordatorio) return null;
  return <RecordatorioPago soloLecturaDesde={cobro.solo_lectura_desde ?? null} />;
}

// Tiempo del panel, segunda vuelta (1 de noviembre de 2026): la página no espera nada antes de pintar. El tablero del
// día, los videos, el avance de la web, el recordatorio de pago y las secciones de configuración son hijos que se arman
// A LA VEZ (antes el tablero arrancaba hasta que la página terminaba sus propias tandas: 300–400 ms después).
export default async function AdminPage() {
  const sesion = await obtenerSesionConRol();
  const esAdmin = sesion?.rol === "admin";
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-n-900">{esAdmin ? "Panel de admin" : "Administración"}</h1>
        <p className="mt-1 text-n-600">
          {esAdmin
            ? "Cómo va el día, qué falta por capturar, y la configuración del negocio."
            : "Lo que admin te dio permiso de administrar."}
        </p>
      </div>

      {esAdmin && <AvanceWeb compacto />}
      {esAdmin && <VideosInicio />}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-n-900">Hoy</h2>
        {esAdmin && <RecordatorioPagoSiToca />}
        <TableroDia compacto />
        <ExtrasTablero />
      </section>

      <SeccionesAdmin />
    </div>
  );
}
