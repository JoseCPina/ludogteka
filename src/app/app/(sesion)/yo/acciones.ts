"use server";

import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

export async function guardarNombre(nombre: string): Promise<{ error: string | null; registros?: RegistroFinal[] }> {
  const s = await sesionApp();
  if (!s) return { error: "Tu sesión se cerró. Vuelve a entrar." };
  const limpio = nombre.trim().replace(/\s+/g, " ").slice(0, 80);
  if (limpio.length < 2) return { error: "Escribe tu nombre." };
  const supabase = await createSupabaseServerClient("portal");
  const { error } = await supabase.from("duenos").update({ nombre: limpio }).eq("id", s.user.id);
  if (error) return { error: "No pudimos guardar tu nombre. Intenta de nuevo." };
  return { error: null, registros: await registrosDe(supabase, [{ t: "duenos", i: s.user.id }]) };
}
