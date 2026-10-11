import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogoExtra, ExtraFila, ZonaExtra } from "./tipos";

/** El catálogo de servicios extra del negocio, con sus zonas. */
export async function cargarCatalogoExtras(supabase: SupabaseClient, soloActivos: boolean): Promise<CatalogoExtra[]> {
  let q = supabase
    .from("servicios_extra")
    .select("id, nombre, descripcion, tipo, unidad, precio, clase_fiscal, clave_prod_serv, activo, paquete_servicio_id")
    .is("deleted_at", null)
    .order("orden")
    .order("nombre");
  if (soloActivos) q = q.eq("activo", true);
  const [{ data: extras }, { data: zonas }] = await Promise.all([
    q,
    supabase.from("servicios_extra_zonas").select("id, extra_id, nombre, km_hasta, precio, activo").is("deleted_at", null).order("orden").order("precio"),
  ]);
  const porExtra = new Map<string, ZonaExtra[]>();
  for (const z of zonas ?? []) {
    const lista = porExtra.get(z.extra_id as string) ?? [];
    lista.push({
      id: z.id as string,
      extra_id: z.extra_id as string,
      nombre: z.nombre as string,
      km_hasta: z.km_hasta === null ? null : Number(z.km_hasta),
      precio: Number(z.precio),
      activo: Boolean(z.activo),
    });
    porExtra.set(z.extra_id as string, lista);
  }
  return (extras ?? []).map((e) => ({
    id: e.id as string,
    nombre: e.nombre as string,
    descripcion: (e.descripcion as string | null) ?? null,
    tipo: e.tipo as CatalogoExtra["tipo"],
    unidad: e.unidad as CatalogoExtra["unidad"],
    precio: Number(e.precio),
    clase_fiscal: e.clase_fiscal as CatalogoExtra["clase_fiscal"],
    clave_prod_serv: (e.clave_prod_serv as string | null) ?? null,
    activo: Boolean(e.activo),
    paquete_servicio_id: (e.paquete_servicio_id as string | null) ?? null,
    zonas: (porExtra.get(e.id as string) ?? []).filter((z) => !soloActivos || z.activo),
  }));
}

/** Lo agregado a una estancia, o lo del día (con lo pendiente de días anteriores). */
export async function cargarExtras(
  supabase: SupabaseClient,
  filtro: { fecha?: string; estanciaId?: string; soloTraslados?: boolean }
): Promise<ExtraFila[]> {
  const { data } = await supabase.rpc("extras_listar", {
    p_fecha: filtro.fecha ?? null,
    p_estancia: filtro.estanciaId ?? null,
    p_solo_traslados: filtro.soloTraslados ?? false,
  });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as ExtraFila),
    cantidad: Number(r.cantidad),
    precio_unitario: Number(r.precio_unitario),
  }));
}
