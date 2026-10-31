"use server";

import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { avisarPerdida, type ResultadoAlerta } from "@/lib/app/perdida";
import { responderHallador } from "@/lib/app/publico";

type Resultado = { error: string | null; registros?: RegistroFinal[] };

export async function marcarPerdida(mascotaId: string, o: { lat: number | null; lng: number | null; nota: string }): Promise<Resultado & { alerta?: ResultadoAlerta }> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const lat = o.lat ?? s.dueno.lat, lng = o.lng ?? s.dueno.lng;
  const nota = o.nota.trim().slice(0, 200);
  if (lat == null || lng == null) return { error: "Necesitamos la zona donde se perdió para avisar a quien está cerca: toca «Usar mi ubicación»." };
  const supabase = await createSupabaseServerClient("portal");
  const { data, error } = await supabase.from("mascotas").update({ perdida_at: new Date().toISOString(), perdida_lat: lat, perdida_lng: lng, perdida_nota: nota || null, encontrada_at: null }).eq("id", mascotaId).is("deleted_at", null).select("id").maybeSingle();
  if (error || !data) return { error: "No pudimos marcarla. Intenta de nuevo." };
  if (s.dueno.lat == null) await supabase.from("duenos").update({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 }).eq("id", s.user.id);
  const alerta = await avisarPerdida(mascotaId);
  return { error: null, alerta, registros: await registrosDe(supabase, [{ t: "mascotas", i: mascotaId }]) };
}

export async function marcarEncontrada(mascotaId: string): Promise<Resultado> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const supabase = await createSupabaseServerClient("portal");
  const { error } = await supabase.from("mascotas").update({ encontrada_at: new Date().toISOString() }).eq("id", mascotaId).not("perdida_at", "is", null);
  if (error) return { error: "No pudimos marcarla." };
  return { error: null, registros: await registrosDe(supabase, [{ t: "mascotas", i: mascotaId }]) };
}

export async function responder(mascotaId: string, texto: string): Promise<Resultado & { entregado?: boolean; motivo?: string }> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const r = await responderHallador({ mascotaId, duenoId: s.user.id, texto });
  if (r.error) return { error: r.error };
  const supabase = await createSupabaseServerClient("portal");
  return { error: null, entregado: r.entregado, motivo: r.motivo, registros: await registrosDe(supabase, [{ t: "mascotas", i: mascotaId }]) };
}
