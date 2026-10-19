"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** N24: la cuenta del personal sin nombre lo escribe una sola vez; se guarda en SU perfil (la base valida). */
export async function guardarMiNombre(nombre: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_mi_nombre_personal", { p_nombre: nombre });
  if (error) {
    return { error: error.code === "22023" || error.code === "42501" ? error.message : "No pudimos guardar tu nombre. Intenta de nuevo." };
  }
  revalidatePath("/", "layout");
  return { error: null };
}
