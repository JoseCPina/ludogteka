// Qué negocios son internos (pruebas y demos de venta de PeluDesk). Las listas de /plataforma que no traen la
// marca en su propia función la cruzan con plataforma_negocios(), que sí la trae.
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodo } from "@/lib/supabase/paginar";

export async function conInterno<T extends { negocio_id: string; plan?: string }>(supabase: SupabaseClient, filas: T[]): Promise<(T & { plan: string; interno: boolean })[]> {
  const { data } = await leerTodo<Record<string, unknown>>(() => supabase.rpc("plataforma_negocios").order("id"));
  const internos = new Set(((data ?? []) as { id: string; interno: boolean }[]).filter((n) => n.interno).map((n) => n.id));
  return filas.map((f) => ({ ...f, plan: f.plan ?? "activo", interno: internos.has(f.negocio_id) }));
}

export const ETIQUETA_INTERNO = "Interno";
