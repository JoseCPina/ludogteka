"use server";

import { esErrorSoloLectura, MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../reservas/traducir-error";

export type EstadoArea = { error: string | null; ok?: boolean };

function claveDe(nombre: string) {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// Áreas del inventario: solo admin (la base lo aplica).
export async function crearArea(nombre: string): Promise<EstadoArea> {
  const limpio = nombre.trim();
  if (!limpio) return { error: "Escribe el nombre del área." };
  const supabase = await createSupabaseServerClient();
  const { data: ultima } = await supabase.from("areas_inventario").select("orden").order("orden", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase
    .from("areas_inventario")
    .insert({ nombre: limpio, clave: `${claveDe(limpio)}_${Date.now().toString(36)}`, orden: (ultima?.orden ?? 0) + 1 });
  if (error) return { error: esErrorSoloLectura(error) ? MENSAJE_SOLO_LECTURA : error.code === "42501" ? "Solo un admin puede editar las áreas." : traducirError(error) };
  revalidatePath("/inventario");
  revalidatePath("/inventario/areas");
  return { error: null, ok: true };
}

export async function renombrarArea(id: string, nombre: string): Promise<EstadoArea> {
  const limpio = nombre.trim();
  if (!limpio) return { error: "Escribe el nombre del área." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("areas_inventario").update({ nombre: limpio }).eq("id", id).select("id");
  if (error) return { error: traducirError(error) };
  if (!data || data.length === 0) return { error: "Solo un admin puede editar las áreas." };
  revalidatePath("/inventario");
  revalidatePath("/inventario/areas");
  return { error: null, ok: true };
}

export async function moverArea(id: string, direccion: -1 | 1): Promise<EstadoArea> {
  const supabase = await createSupabaseServerClient();
  const { data: areas } = await supabase.from("areas_inventario").select("id, orden").is("deleted_at", null).order("orden");
  const lista = areas ?? [];
  const i = lista.findIndex((a) => a.id === id);
  const j = i + direccion;
  if (i < 0 || j < 0 || j >= lista.length) return { error: null, ok: true };
  const [a, b] = [lista[i], lista[j]];
  const r1 = await supabase.from("areas_inventario").update({ orden: b.orden }).eq("id", a.id).select("id");
  const r2 = await supabase.from("areas_inventario").update({ orden: a.orden }).eq("id", b.id).select("id");
  if (r1.error || r2.error || !r1.data?.length) return { error: "Solo un admin puede editar las áreas." };
  revalidatePath("/inventario");
  revalidatePath("/inventario/areas");
  return { error: null, ok: true };
}

// Solo se puede quitar un área vacía: nada vivo de consumibles ni de equipo.
export async function quitarArea(id: string): Promise<EstadoArea> {
  const supabase = await createSupabaseServerClient();
  const [{ count: consumibles }, { count: equipos }] = await Promise.all([
    supabase.from("insumos").select("id", { count: "exact", head: true }).eq("area_id", id).is("deleted_at", null),
    supabase.from("equipos").select("id", { count: "exact", head: true }).eq("area_id", id).is("deleted_at", null),
  ]);
  if ((consumibles ?? 0) + (equipos ?? 0) > 0) {
    return { error: "Esta área todavía tiene consumibles o equipo. Muévelos a otra área o dalos de baja primero." };
  }
  const { data, error } = await supabase
    .from("areas_inventario")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: traducirError(error) };
  if (!data || data.length === 0) return { error: "Solo un admin puede editar las áreas." };
  revalidatePath("/inventario");
  revalidatePath("/inventario/areas");
  return { error: null, ok: true };
}
