import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { firmarRutas } from "./enlaces";
import type { MetaReporte } from "@/app/(staff)/guarderia/reportes/tipos";
import type { EstadoReporte } from "./tipos";

const COLUMNAS =
  "id, estado, version, contenido_at, llenado_por_nombre, enviado_at, enviado_por_nombre, envios, tarjeta_path, tarjeta_at, tarjeta_expira_at, tarjeta_vencida_at";

type Fila = {
  id: string;
  estado: EstadoReporte;
  version: number;
  contenido_at: string;
  llenado_por_nombre: string | null;
  enviado_at: string | null;
  enviado_por_nombre: string | null;
  envios: number;
  tarjeta_path: string | null;
  tarjeta_at: string | null;
  tarjeta_expira_at: string | null;
  tarjeta_vencida_at: string | null;
};

export const META_VACIA: MetaReporte = {
  id: null,
  estado: null,
  version: 1,
  llenadoPor: null,
  enviadoAt: null,
  enviadoPor: null,
  envios: 0,
  tarjetaVigente: false,
  tarjetaVencida: false,
  tarjetaUrl: null,
  descargaUrl: null,
  tarjetaExpiraAt: null,
};

/** Solo servidor. Lee el reporte de un perro en un día y firma su imagen (URL de corta vida). */
export async function metaDeReporte(
  supabase: SupabaseClient,
  negocioId: string,
  filtro: { reporteId: string } | { perroId: string; fecha: string },
  nombreDescarga: string
): Promise<MetaReporte> {
  let q = supabase.from("reportes_guarderia").select(COLUMNAS).is("deleted_at", null);
  q = "reporteId" in filtro ? q.eq("id", filtro.reporteId) : q.eq("perro_id", filtro.perroId).eq("fecha", filtro.fecha);
  const { data } = await q.maybeSingle();
  const r = data as Fila | null;
  if (!r) return META_VACIA;
  const hayArchivo = Boolean(r.tarjeta_path) && !r.tarjeta_vencida_at;
  const actual = hayArchivo && r.tarjeta_at !== null && new Date(r.tarjeta_at) >= new Date(r.contenido_at);
  let tarjetaUrl: string | null = null;
  let descargaUrl: string | null = null;
  if (actual && r.tarjeta_path) {
    const admin = createSupabaseAdminClient(negocioId);
    const [ver, bajar] = await Promise.all([
      firmarRutas(admin, [r.tarjeta_path]),
      firmarRutas(admin, [r.tarjeta_path], { descargar: nombreDescarga }),
    ]);
    tarjetaUrl = ver.get(r.tarjeta_path) ?? null;
    descargaUrl = bajar.get(r.tarjeta_path) ?? null;
  }
  return {
    id: r.id,
    estado: r.estado,
    version: r.version,
    llenadoPor: r.llenado_por_nombre,
    enviadoAt: r.enviado_at,
    enviadoPor: r.enviado_por_nombre,
    envios: r.envios,
    tarjetaVigente: actual,
    tarjetaVencida: !actual && (Boolean(r.tarjeta_path) || Boolean(r.tarjeta_vencida_at)),
    tarjetaUrl,
    descargaUrl,
    tarjetaExpiraAt: r.tarjeta_expira_at,
  };
}
