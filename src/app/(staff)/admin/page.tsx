import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { InvitarStaff } from "./invitar-staff";
import { ListaCuentas, type Cuenta } from "./lista-cuentas";
import { DescuentoConfig } from "./descuento-config";
import { DiagnosticoGoogle } from "./diagnostico-google";
import { ConfiguracionNegocio, type ConfiguracionVigente } from "./configuracion-negocio";
import { TarifasFaltantes, type ServicioConHuecos } from "./tarifas-faltantes";
import { contarSinTarifa, type CeldaVigente } from "@/lib/tarifas/matriz";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const [
    { data, error },
    { data: topeData },
    { data: configData },
    { data: serviciosCat },
    { data: gruposCat },
    { data: tamanosCat },
    { data: pelajesCat },
    { data: vigentesCat },
  ] = await Promise.all([
    supabase.rpc("listar_cuentas"),
    supabase.rpc("resolver_tope_descuento_recepcion"),
    supabase.rpc("resolver_cupo_configuracion"),
    supabase
      .from("servicios")
      .select("id, nombre, depende_grupo_raza, depende_tamano, depende_pelaje, depende_cantidad")
      .is("deleted_at", null)
      .order("orden"),
    supabase.from("grupos_raza").select("id, nombre, depende_tamano").is("deleted_at", null).order("orden"),
    supabase.from("tamanos_categoria").select("id, etiqueta").is("deleted_at", null).order("orden"),
    supabase.from("tipos_pelaje").select("id, etiqueta").is("deleted_at", null).order("orden"),
    supabase
      .from("tarifas_vigentes")
      .select("servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, precio, no_aplica"),
  ]);

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
        <h1 className="text-2xl font-bold text-n-900">Panel de admin</h1>
        <p className="mt-1 text-n-600">Invita personal y revisa quién tiene cuenta.</p>
      </div>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-n-900">Configuración del negocio</h2>
        <ConfiguracionNegocio vigente={configVigente} />
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-n-900">Precios sin capturar</h2>
        <TarifasFaltantes servicios={serviciosSinTarifa} />
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-n-900">Invitar personal</h2>
        <InvitarStaff />
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-n-900">Tope de descuentos de recepción</h2>
        <DescuentoConfig
          topeActual={topeFila?.estado === "configurado" ? Number(topeFila.tope_recepcion) : null}
          vigenteDesde={topeFila?.vigencia_desde ?? null}
        />
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-n-900">Conexión con Google Maps</h2>
        <DiagnosticoGoogle />
      </section>

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
    </div>
  );
}
