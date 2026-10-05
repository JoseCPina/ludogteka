import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { InvitarStaff } from "./invitar-staff";
import { ListaCuentas, type Cuenta } from "./lista-cuentas";
import { DescuentoConfig } from "./descuento-config";
import { DiagnosticoGoogle } from "./diagnostico-google";
import { UbicacionNegocio } from "./ubicacion-negocio";
import { ConfiguracionNegocio, type ConfiguracionVigente } from "./configuracion-negocio";
import { HorarioNegocio } from "./horario-negocio";
import type { DiaHorario } from "./configuracion-actions";
import { TarifasFaltantes, type ServicioConHuecos } from "./tarifas-faltantes";
import { contarSinTarifa, type CeldaVigente } from "@/lib/tarifas/matriz";
import { TableroDia } from "../tablero-dia";
import { RecordatorioPago } from "./recordatorio-pago";
import { AvanceWeb } from "@/components/avance-web";
import { VideosInicio } from "@/components/ayuda/videos-inicio";
import Link from "next/link";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { ListaPersonal, type PersonaStaff } from "./lista-personal";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { resumenDeCobro } from "@/lib/pagos/conexion";

// Admin ve todo. Una persona de recepción con permisos extra llega aquí
// solo con las secciones que le tocan (el middleware la deja entrar con
// personal, configuración o tarifas); lo demás es de admin y ni se consulta.
export default async function AdminPage() {
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
  const [cobroIntegrado, ubicacion] = await Promise.all([
    esAdmin ? resumenDeCobro(await negocioActual()) : Promise.resolve(null),
    puedeUbicacion
      ? Promise.all([
          supabase.from("sucursales").select("direccion, lat").is("deleted_at", null).order("activo", { ascending: false }).limit(1).maybeSingle(),
          supabase.rpc("resolver_cupo_configuracion"),
          esAdmin ? supabase.rpc("maps_consumo_mes") : Promise.resolve({ data: null }),
        ])
      : Promise.resolve(null),
  ]);
  const cupoUbic = ubicacion ? ((Array.isArray(ubicacion[1].data) ? ubicacion[1].data[0] : ubicacion[1].data) as { base_direccion: string | null; base_lat: number | null } | null) : null;
  const nada = Promise.resolve({ data: null, error: null });
  const cobro = esAdmin
    ? ((await supabase.rpc("mi_cobro")).data as { toca_recordatorio?: boolean; solo_lectura_desde?: string | null } | null)
    : null;
  const [
    { data, error },
    { data: topeData },
    { data: configData },
    { data: serviciosCat },
    { data: gruposCat },
    { data: tamanosCat },
    { data: pelajesCat },
    { data: vigentesCat },
    { data: horarioVigente },
  ] = await Promise.all([
    esAdmin ? supabase.rpc("listar_cuentas") : nada,
    esAdmin ? supabase.rpc("resolver_tope_descuento_recepcion") : nada,
    supabase.rpc("resolver_cupo_configuracion"),
    supabase
      .from("servicios")
      .select("id, nombre, depende_grupo_raza, depende_tamano, depende_pelaje, depende_cantidad, monto_libre")
      .is("deleted_at", null)
      // Un cargo de monto libre no tiene celda que capturar: el importe
      // se pone al aplicarlo. No es un hueco.
      .eq("monto_libre", false)
      .order("orden"),
    supabase.from("grupos_raza").select("id, nombre, depende_tamano").is("deleted_at", null).order("orden"),
    supabase.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
    supabase.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden"),
    supabase
      .from("tarifas_vigentes")
      .select("servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, precio, no_aplica"),
    supabase.rpc("horario_semana_vigente"),
  ]);
  const { data: personal } = !esAdmin && puedePersonal ? await supabase.rpc("listar_personal") : { data: null };

  // Mismo cálculo que la matriz, del mismo módulo: si cada pantalla
  // derivara las combinaciones por su cuenta, el aviso y la matriz
  // dirían números distintos.
  const catalogosTarifas = {
    grupos: gruposCat ?? [],
    tamanos: tamanosCat ?? [],
    pelajes: pelajesCat ?? [],
  };
  const vigentesPorServicio = new Map<string, CeldaVigente[]>();
  for (const v of vigentesCat ?? []) {
    const lista = vigentesPorServicio.get(v.servicio_id) ?? [];
    lista.push(v);
    vigentesPorServicio.set(v.servicio_id, lista);
  }
  const serviciosSinTarifa: ServicioConHuecos[] = (serviciosCat ?? [])
    .map((s) => ({
      id: s.id as string,
      nombre: s.nombre as string,
      faltan: contarSinTarifa(s, catalogosTarifas, vigentesPorServicio.get(s.id) ?? []),
    }))
    .filter((s) => s.faltan > 0);
  const topeFila = Array.isArray(topeData) ? topeData[0] : topeData;
  const configVigente = (Array.isArray(configData) ? configData[0] : configData) as
    | ConfiguracionVigente
    | null;

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
        {cobro?.toca_recordatorio && <RecordatorioPago soloLecturaDesde={cobro.solo_lectura_desde ?? null} />}
        <TableroDia compacto />
      </section>

      {esAdmin && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-n-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-bold text-n-900">Permisos de recepción</h2>
            <p className="mt-1 text-sm text-n-600">
              Dale a una persona de recepción permisos extra para que te ayude a administrar.
            </p>
          </div>
          <Link href="/admin/permisos" className="font-semibold text-morado hover:underline">
            Administrar permisos →
          </Link>
        </section>
      )}

      {puedeConfig && (
        <section id="configuracion" className="scroll-mt-20 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-n-900">Configuración del negocio</h2>
          <ConfiguracionNegocio vigente={configVigente} />
        </section>
      )}

      {ubicacion && (
        <section id="ubicacion" className="scroll-mt-20 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-n-900">Ubicación para recolección</h2>
          <UbicacionNegocio
            direccion={(ubicacion[0].data?.direccion as string | null) ?? ""}
            base={cupoUbic?.base_direccion ?? ""}
            conCoordenadas={{ negocio: ubicacion[0].data?.lat != null, base: cupoUbic?.base_lat != null }}
            consumo={(ubicacion[2].data as { usadas: number; tope: number } | null) ?? null}
          />
        </section>
      )}

      {puedeConfig && (
        <section id="horario" className="scroll-mt-20 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-n-900">Horario de atención</h2>
          <HorarioNegocio vigente={(horarioVigente ?? []) as DiaHorario[]} />
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
          <Link href="/admin/pagos" className="font-semibold text-morado underline underline-offset-4">
            Configurar
          </Link>
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
          <ListaCuentas cuentas={(data as Cuenta[]) ?? []} />
        )}
      </section>
      )}
    </div>
  );
}
