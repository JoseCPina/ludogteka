"use server";

import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { lugaresCerca, type Giro, type LugarCerca } from "@/lib/app/cerca";

const valida = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Los lugares cerca de la ubicación que dio el celular. No escribe nada. */
export async function buscarCerca(lat: number, lng: number, giro: Giro): Promise<{ error: string | null; lugares?: LugarCerca[] }> {
  if (!valida(lat, lng)) return { error: "No pudimos leer tu ubicación." };
  if (!["veterinaria", "estetica", "guarderia", "hotel"].includes(giro)) return { error: "Escoge qué buscar." };
  return { error: null, lugares: await lugaresCerca(lat, lng, giro) };
}

/** Guardar la zona del dueño (redondeada a ~1 km) para avisarle de mascotas perdidas cerca. */
export async function guardarZona(lat: number, lng: number): Promise<{ error: string | null; registros?: RegistroFinal[] }> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  if (!valida(lat, lng)) return { error: "No pudimos leer tu ubicación." };
  const supabase = await createSupabaseServerClient("portal");
  const { error } = await supabase.from("duenos").update({ lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 }).eq("id", s.user.id);
  if (error) return { error: "No pudimos guardar tu zona." };
  return { error: null, registros: await registrosDe(supabase, [{ t: "duenos", i: s.user.id }]) };
}
