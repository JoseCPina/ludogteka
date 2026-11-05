"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

export type EstadoPermiso = { error: string | null; registros?: RegistroFinal[]; activos?: string[] };

function mensaje(error: { code?: string; message: string }): string {
  return error.code === "P0001" || error.code === "42501" ? error.message : "No pudimos guardar el cambio. Intenta de nuevo.";
}

/** Los permisos vigentes de una persona, para que la pantalla pinte lo que la base tiene después de cada cambio. */
async function activosDe(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, profileId: string): Promise<string[]> {
  const { data } = await supabase.from("permisos_staff").select("permiso").eq("profile_id", profileId).is("revocado_at", null).is("deleted_at", null);
  return (data ?? []).map((f) => f.permiso as string);
}

// Dar o quitar un permiso. Solo admin: la base lo vuelve a revisar
// (otorgar_permiso / revocar_permiso usan is_admin(), nunca tiene_permiso).
export async function cambiarPermiso(profileId: string, permiso: string, activar: boolean): Promise<EstadoPermiso> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(activar ? "otorgar_permiso" : "revocar_permiso", { p_profile_id: profileId, p_permiso: permiso });
  if (error) return { error: mensaje(error) };
  const id = typeof data === "string" ? data : null;
  return { error: null, activos: await activosDe(supabase, profileId), registros: await registrosDe(supabase, [{ t: "permisos_staff", i: id }]) };
}

/** «Activar todo el grupo» / «Quitar todo el grupo»: uno por uno, en la base, y se devuelve lo que quedó. */
export async function cambiarPermisos(profileId: string, permisos: string[], activar: boolean): Promise<EstadoPermiso> {
  if (permisos.length === 0) return { error: "No hay permisos en ese grupo." };
  const supabase = await createSupabaseServerClient();
  const ids: (string | null)[] = [];
  for (const permiso of permisos) {
    const { data, error } = await supabase.rpc(activar ? "otorgar_permiso" : "revocar_permiso", { p_profile_id: profileId, p_permiso: permiso });
    if (error) return { error: mensaje(error), activos: await activosDe(supabase, profileId) };
    ids.push(typeof data === "string" ? data : null);
  }
  return { error: null, activos: await activosDe(supabase, profileId), registros: await registrosDe(supabase, ids.filter(Boolean).map((i) => ({ t: "permisos_staff", i }))) };
}
