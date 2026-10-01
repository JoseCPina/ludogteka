import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfigReporte, ContenidoReporte, OpcionPlantilla, SeccionPlantilla } from "./tipos";

/**
 * Solo servidor. La plantilla del negocio con el cliente de SESIÓN (la RLS
 * deja leer a admin y a recepción con «Reportes de guardería»). Un negocio
 * nuevo todavía no tiene plantilla: se siembra con la RPC
 * `reporte_asegurar_plantilla` la primera vez.
 */
export async function cargarPlantilla(
  supabase: SupabaseClient,
  opciones: { incluirInactivas?: boolean } = {}
): Promise<{ config: ConfigReporte | null; secciones: SeccionPlantilla[] }> {
  const leer = async () => {
    const [{ data: cfg }, { data: secs }, { data: ops }] = await Promise.all([
      supabase.from("reporte_config").select("id, titulo, subtitulo, color_primario, color_secundario, color_acento, retencion_dias").is("deleted_at", null).maybeSingle(),
      supabase.from("reporte_secciones").select("*").is("deleted_at", null).order("orden").order("created_at"),
      supabase.from("reporte_opciones").select("*").is("deleted_at", null).order("orden").order("created_at"),
    ]);
    return { cfg: cfg as ConfigReporte | null, secs: (secs ?? []) as Omit<SeccionPlantilla, "opciones">[], ops: (ops ?? []) as OpcionPlantilla[] };
  };

  let { cfg, secs, ops } = await leer();
  if (secs.length === 0) {
    await supabase.rpc("reporte_asegurar_plantilla");
    ({ cfg, secs, ops } = await leer());
  }
  const incluir = opciones.incluirInactivas ?? false;
  const secciones = secs
    .filter((s) => incluir || s.activa)
    .map((s) => ({ ...s, opciones: ops.filter((o) => o.seccion_id === s.id && (incluir || o.activa)) }));
  return { config: cfg, secciones };
}

/**
 * Las secciones para llenar HOY: la plantilla vigente más, si el reporte ya
 * existe, lo que tenía marcado y la plantilla ya apagó (no se pierde).
 */
export function seccionesParaFormulario(secciones: SeccionPlantilla[], guardado: ContenidoReporte | null): SeccionPlantilla[] {
  if (!guardado) return secciones;
  return secciones.map((s) => {
    const previa = guardado.secciones.find((x) => x.clave === s.clave);
    if (!previa) return s;
    const claves = new Set(s.opciones.map((o) => o.clave));
    const extra: OpcionPlantilla[] = previa.opciones
      .filter((o) => o.marcada && !claves.has(o.clave))
      .map((o, i) => ({ id: `previa-${o.clave}`, seccion_id: s.id, clave: o.clave, texto: o.texto, icono: o.icono, orden: 1000 + i, activa: true, en_buen_dia: false }));
    return extra.length ? { ...s, opciones: [...s.opciones, ...extra] } : s;
  });
}

/** Las marcas del atajo «Buen día»: las opciones de la plantilla con en_buen_dia (una sola por sección «una»). */
export function respuestasBuenDia(secciones: SeccionPlantilla[]): Record<string, string[]> {
  const salida: Record<string, string[]> = {};
  for (const s of secciones) {
    const claves = s.opciones.filter((o) => o.en_buen_dia).map((o) => o.clave);
    if (claves.length) salida[s.clave] = s.seleccion === "una" ? claves.slice(0, 1) : claves;
  }
  return salida;
}
