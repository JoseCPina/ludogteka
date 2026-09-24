"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoPermiso = { error: string | null };

// Dar o quitar un permiso. Solo admin: la base lo vuelve a revisar
// (otorgar_permiso / revocar_permiso usan is_admin(), nunca tiene_permiso).
export async function cambiarPermiso(
  profileId: string,
  permiso: string,
  activar: boolean
): Promise<EstadoPermiso> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(activar ? "otorgar_permiso" : "revocar_permiso", {
    p_profile_id: profileId,
    p_permiso: permiso,
  });
  if (error) return { error: error.code === "P0001" ? error.message : "No pudimos guardar el cambio. Intenta de nuevo." };
  revalidatePath("/admin/permisos");
  return { error: null };
}
