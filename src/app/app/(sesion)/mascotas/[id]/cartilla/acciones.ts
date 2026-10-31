"use server";

import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { guardarRegistros, programarRecordatorios } from "@/lib/app/cartilla";
import type { RegistroLeido } from "@/lib/app/cartilla-ia";

type Resultado = { error: string | null; registros?: RegistroFinal[] };

async function miMascota(id: string) {
  const s = await sesionApp();
  if (!s) return { s: null, supabase: null, ok: false };
  const supabase = await createSupabaseServerClient("portal");
  const { data } = await supabase.from("mascotas").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  return { s, supabase, ok: Boolean(data) };
}

/** Lo que el dueño confirmó de la lectura de la foto (ya revisado y corregido en pantalla). */
export async function confirmarLectura(mascotaId: string, fotoId: string | null, registros: RegistroLeido[], pesoKg: number | null): Promise<Resultado & { ids?: string[] }> {
  const { supabase, ok } = await miMascota(mascotaId);
  if (!supabase || !ok) return { error: "No encontramos esa mascota." };
  const r = await guardarRegistros(mascotaId, registros, "foto", fotoId);
  if (r.error) return { error: r.error };
  if (pesoKg && pesoKg > 0 && pesoKg < 200) await supabase.from("mascotas_pesos").insert({ mascota_id: mascotaId, peso_kg: pesoKg, notas: "De la cartilla", updated_at: new Date().toISOString() });
  return { error: null, ids: r.ids, registros: await registrosDe(supabase, r.ids.map((i) => ({ t: "mascotas_cartilla", i }))) };
}

/** Un registro capturado a mano. */
export async function agregarRegistro(mascotaId: string, r: { tipo: "vacuna" | "desparasitacion"; nombre: string; fecha_aplicacion: string | null; proxima_dosis: string | null; lote?: string | null; subtipo?: "interna" | "externa" | "ambas" | null; notas?: string | null }): Promise<Resultado & { ids?: string[] }> {
  const { supabase, ok } = await miMascota(mascotaId);
  if (!supabase || !ok) return { error: "No encontramos esa mascota." };
  if (!r.nombre?.trim()) return { error: "Escribe qué vacuna o producto fue." };
  for (const f of [r.fecha_aplicacion, r.proxima_dosis]) if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) return { error: "Una fecha no se entiende." };
  const g = await guardarRegistros(mascotaId, [{ ...r, confianza: 1 }], "manual", null);
  if (g.error) return { error: g.error };
  return { error: null, ids: g.ids, registros: await registrosDe(supabase, g.ids.map((i) => ({ t: "mascotas_cartilla", i }))) };
}

export async function quitarRegistro(mascotaId: string, id: string): Promise<Resultado> {
  const { supabase, ok } = await miMascota(mascotaId);
  if (!supabase || !ok) return { error: "No encontramos esa mascota." };
  const { error } = await supabase.from("mascotas_cartilla").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("mascota_id", mascotaId).in("fuente", ["foto", "manual"]);
  if (error) return { error: "No se pudo quitar." };
  await programarRecordatorios(mascotaId);
  return { error: null, registros: await registrosDe(supabase, [{ t: "mascotas_cartilla", i: id }]) };
}

export async function recordatoriosDeMascota(mascotaId: string, apagados: boolean): Promise<Resultado> {
  const { supabase, ok } = await miMascota(mascotaId);
  if (!supabase || !ok) return { error: "No encontramos esa mascota." };
  const { error } = await supabase.from("mascotas").update({ recordatorios_apagados: apagados }).eq("id", mascotaId);
  if (error) return { error: "No se pudo cambiar." };
  await programarRecordatorios(mascotaId);
  return { error: null, registros: await registrosDe(supabase, [{ t: "mascotas", i: mascotaId }]) };
}
