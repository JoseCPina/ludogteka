"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserConReintento } from "@/lib/supabase/get-user";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

/** N24: la cuenta del personal sin nombre lo escribe una sola vez; se guarda en SU perfil (la base valida). */
export async function guardarMiNombre(nombre: string): Promise<{ error: string | null; registros?: RegistroFinal[] }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_mi_nombre_personal", { p_nombre: nombre });
  if (error) {
    return { error: error.code === "22023" || error.code === "42501" ? error.message : "No pudimos guardar tu nombre. Intenta de nuevo." };
  }
  revalidatePath("/", "layout");
  const { data } = await getUserConReintento(supabase);
  return { error: null, registros: await registrosDe(supabase, [{ t: "profiles", i: data.user?.id }]) };
}
