import type { SupabaseClient } from "@supabase/supabase-js";
import { esEtapa, esGiro } from "./textos";

// Filtros de la lista de /plataforma/prospectos: los mismos para la pantalla y para el Excel.
export type Filtros = { ciudad: string; giro: string; etapa: string; q: string; clientes: boolean };

export const COLUMNAS =
  "id, nombre, giro, ciudad, direccion, telefono, whatsapp, correo, instagram, facebook, web, calificacion, resenas, fuente, etapa, canal_ultimo_contacto, ultimo_contacto_at, notas, negocio_cliente_id, cliente_por, created_at";

export type Prospecto = {
  id: string;
  nombre: string;
  giro: string;
  ciudad: string;
  direccion: string | null;
  telefono: string | null;
  whatsapp: string | null;
  correo: string | null;
  instagram: string | null;
  facebook: string | null;
  web: string | null;
  calificacion: number | null;
  resenas: number | null;
  fuente: string;
  etapa: string;
  canal_ultimo_contacto: string | null;
  ultimo_contacto_at: string | null;
  notas: string | null;
  negocio_cliente_id: string | null;
  cliente_por: string | null;
  created_at: string;
};

export function leerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const uno = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const giro = uno("giro");
  const etapa = uno("etapa");
  return { ciudad: uno("ciudad").slice(0, 80), giro: esGiro(giro) ? giro : "", etapa: esEtapa(etapa) ? etapa : "", q: uno("q").trim().slice(0, 80), clientes: uno("clientes") === "1" };
}

export function consultaProspectos(supabase: SupabaseClient, f: Filtros, columnas = COLUMNAS) {
  let q = supabase.from("prospectos").select(columnas, { count: "exact" }).is("deleted_at", null);
  q = f.clientes ? q.not("negocio_cliente_id", "is", null) : q.is("negocio_cliente_id", null);
  if (f.ciudad) q = q.eq("ciudad", f.ciudad);
  if (f.giro) q = q.eq("giro", f.giro);
  if (f.etapa) q = q.eq("etapa", f.etapa);
  if (f.q) {
    const t = f.q.replace(/[%,()*]/g, " ");
    q = q.or(`nombre.ilike.%${t}%,telefono.ilike.%${t}%,correo.ilike.%${t}%`);
  }
  return q.order("created_at", { ascending: false }).order("id");
}

export const parametros = (f: Filtros, extra: Record<string, string> = {}) => {
  const p = new URLSearchParams();
  if (f.ciudad) p.set("ciudad", f.ciudad);
  if (f.giro) p.set("giro", f.giro);
  if (f.etapa) p.set("etapa", f.etapa);
  if (f.q) p.set("q", f.q);
  if (f.clientes) p.set("clientes", "1");
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};
