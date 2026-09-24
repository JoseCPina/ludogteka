import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { formatearFechaCalendario } from "@/lib/formato";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AVISOS_EQUIPO, ESTADOS_EQUIPO, abreviarUnidad, cargarAreas, puedeDarDeAlta } from "./comun";

// Inventario en dos listas que no se mezclan: CONSUMIBLES (se gastan y se
// reponen: existencia y stock mínimo) y EQUIPO (no se gasta: cuántos hay, en
// qué estado y cuándo toca mantenimiento). Las dos, agrupadas por área.
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; creado?: string }>;
}) {
  const { ver, creado } = await searchParams;
  const vista = ver === "equipo" ? "equipo" : "consumibles";
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const puedeAlta = puedeDarDeAlta(sesion?.rol);
  const puedeCostos = tienePermiso(sesion, "inventario_costos");
  const esAdmin = sesion?.rol === "admin";

  const [areas, { data: insumos, error: errorInsumos }, { data: existencias }, { data: caducidades }, { data: equipos, error: errorEquipos }] =
    await Promise.all([
      cargarAreas(supabase),
      supabase
        .from("insumos")
        .select("id, nombre, area_id, unidades_medida!unidad_consumo_id(clave, equivalencia_en_base)")
        .is("deleted_at", null)
        .order("nombre"),
      supabase.from("insumos_existencia_actual").select("insumo_id, existencia_actual, stock_minimo, bajo_minimo"),
      supabase.from("insumos_proxima_caducidad").select("insumo_id, estado"),
      supabase.from("equipos_estado").select("*").order("nombre"),
    ]);
  const { data: sinCosto } = puedeCostos ? await supabase.rpc("insumos_sin_costo") : { data: null };

  const existenciaDe = new Map((existencias ?? []).map((e) => [e.insumo_id as string, e]));
  const caducidadDe = new Map((caducidades ?? []).map((c) => [c.insumo_id as string, c.estado as string]));
  const bajoMinimo = (existencias ?? []).filter((e) => e.bajo_minimo).length;
  const porCaducar = (caducidades ?? []).filter((c) => c.estado === "por_vencer" || c.estado === "vencida").length;
  const equiposConAviso = (equipos ?? []).filter((e) => e.aviso).length;
  const cuantosSinCosto = ((sinCosto as unknown[] | null) ?? []).length;

  const pestana = (clave: "consumibles" | "equipo", etiqueta: string, avisos: number) => (
    <Link
      href={clave === "equipo" ? "/inventario?ver=equipo" : "/inventario"}
      className={`rounded-t-md border-b-[3px] px-4 py-2 font-semibold ${
        vista === clave ? "border-azul text-azul" : "border-transparent text-n-600 hover:text-n-900"
      }`}
    >
      {etiqueta}
      {avisos > 0 && (
        <span className="ml-2 rounded-full bg-amarillo-suave px-2 py-0.5 text-xs text-amarillo-oscuro">{avisos}</span>
      )}
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-n-900">Inventario</h1>
          <p className="mt-1 text-n-600">Lo que se gasta y lo que se usa, por área.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventario/proveedores">
            <Button type="button" variante="secundario">
              Proveedores
            </Button>
          </Link>
          {esAdmin && (
            <Link href="/inventario/areas">
              <Button type="button" variante="secundario">
                Áreas
              </Button>
            </Link>
          )}
          {puedeAlta && (
            <Link href={vista === "equipo" ? "/inventario/equipo/nuevo" : "/inventario/nuevo"}>
              <Button type="button">{vista === "equipo" ? "Nuevo equipo" : "Nuevo consumible"}</Button>
            </Link>
          )}
        </div>
      </div>

      {creado === "consumible" && <Alert variante="exito" titulo="Consumible dado de alta" />}
      {creado === "equipo" && <Alert variante="exito" titulo="Equipo dado de alta" />}

      {puedeCostos && cuantosSinCosto > 0 && (
        <Alert variante="advertencia" titulo={`${cuantosSinCosto} ${cuantosSinCosto === 1 ? "consumible sin costo" : "consumibles sin costo"}`}>
          No tienen costo de referencia ni compras registradas, así que los reportes no los pueden costear.{" "}
          <Link href="/inventario/sin-costo" className="font-semibold underline">
            Completarlos
          </Link>
        </Alert>
      )}

      <nav className="flex gap-1 border-b border-n-200" aria-label="Tipo de inventario">
        {pestana("consumibles", "Consumibles", bajoMinimo + porCaducar)}
        {pestana("equipo", "Equipo", equiposConAviso)}
      </nav>

      {vista === "consumibles" ? (
        errorInsumos ? (
          <Alert variante="error" titulo="No pudimos cargar los consumibles">
            Recarga la página. Si el problema sigue, avísale al equipo técnico.
          </Alert>
        ) : (
          areas.map((area) => {
            const delArea = (insumos ?? []).filter((i) => i.area_id === area.id);
            if (delArea.length === 0) return null;
            return (
              <section key={area.id} className="flex flex-col gap-2">
                <h2 className="text-lg font-bold text-n-900">{area.nombre}</h2>
                <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
                  {delArea.map((i) => {
                    const unidad = i.unidades_medida as unknown as { clave: string; equivalencia_en_base: number } | null;
                    const eq = unidad ? Number(unidad.equivalencia_en_base) : 1;
                    const ex = existenciaDe.get(i.id as string);
                    const actual = ex ? Number(ex.existencia_actual) / eq : 0;
                    const minimo = ex ? Number(ex.stock_minimo) / eq : 0;
                    const caducidad = caducidadDe.get(i.id as string);
                    return (
                      <li key={i.id as string}>
                        <Link
                          href={`/inventario/${i.id}`}
                          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50"
                        >
                          <span className="font-semibold text-n-900">{i.nombre as string}</span>
                          <span className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="tabular-nums text-n-700">
                              {actual.toLocaleString("es-MX")} {unidad ? abreviarUnidad(unidad.clave) : ""}
                              {minimo > 0 && <span className="text-n-500"> · mínimo {minimo.toLocaleString("es-MX")}</span>}
                            </span>
                            {ex?.bajo_minimo && (
                              <span className="rounded-full bg-amarillo-suave px-2 py-0.5 text-xs font-semibold text-amarillo-oscuro">
                                Bajo mínimo
                              </span>
                            )}
                            {caducidad === "por_vencer" && (
                              <span className="rounded-full bg-amarillo-suave px-2 py-0.5 text-xs font-semibold text-amarillo-oscuro">
                                Por caducar
                              </span>
                            )}
                            {caducidad === "vencida" && (
                              <span className="rounded-full bg-naranja-suave px-2 py-0.5 text-xs font-semibold text-naranja-oscuro">
                                Caducado
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )
      ) : errorEquipos ? (
        <Alert variante="error" titulo="No pudimos cargar el equipo">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        areas.map((area) => {
          const delArea = (equipos ?? []).filter((e) => e.area_id === area.id);
          if (delArea.length === 0) return null;
          return (
            <section key={area.id} className="flex flex-col gap-2">
              <h2 className="text-lg font-bold text-n-900">{area.nombre}</h2>
              <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
                {delArea.map((e) => {
                  const estado = ESTADOS_EQUIPO[e.estado as string];
                  const aviso = e.aviso ? AVISOS_EQUIPO[e.aviso as string] : null;
                  return (
                    <li key={e.equipo_id as string}>
                      <Link
                        href={`/inventario/equipo/${e.equipo_id}`}
                        className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50 ${e.estado === "baja" ? "opacity-60" : ""}`}
                      >
                        <span className="flex flex-col">
                          <span className="font-semibold text-n-900">{e.nombre as string}</span>
                          <span className="text-xs text-n-500">
                            {e.proximo_mantenimiento
                              ? `${(e.que_mantenimiento as string | null) ?? "Mantenimiento"}: toca el ${formatearFechaCalendario(e.proximo_mantenimiento as string)}`
                              : e.frecuencia_mantenimiento_dias
                                ? `${(e.que_mantenimiento as string | null) ?? "Mantenimiento"} cada ${e.frecuencia_mantenimiento_dias} días`
                                : "Sin mantenimiento programado"}
                          </span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="tabular-nums text-n-700">{(e.cantidad as number) > 0 ? `${e.cantidad} en total` : "Sin contar"}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estado?.estilo ?? ""}`}>{estado?.etiqueta}</span>
                          {aviso && e.aviso !== e.estado && e.aviso !== "necesita_mantenimiento" && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${aviso.estilo}`}>{aviso.etiqueta}</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
