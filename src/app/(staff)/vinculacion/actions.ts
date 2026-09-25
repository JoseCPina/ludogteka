"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoVinculacion = { error: string | null; ok?: boolean };

export async function vincularCuenta(
  profileId: string,
  clienteId: string
): Promise<EstadoVinculacion> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Recarga la página." };

  // La vinculación vive en la membresía de cliente de ESTE negocio (la
  // base la limita al negocio del dominio). .is("cliente_id", null): no
  // reescribe una vinculación existente; el índice único de
  // membresias.cliente_id cubre el otro sentido (cliente ya tomado).
  const { data, error } = await supabase
    .from("membresias")
    .update({ cliente_id: clienteId })
    .eq("profile_id", profileId)
    .eq("rol", "cliente")
    .is("cliente_id", null)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { error: "Ese cliente ya tiene una cuenta vinculada." };
    }
    return { error: "No pudimos vincular la cuenta. Intenta de nuevo." };
  }

  if (!data) {
    return { error: "Esta cuenta ya no está pendiente de vincular. Recarga la página." };
  }

  await supabase.from("vinculacion_eventos").insert({
    profile_id: profileId,
    cliente_id: clienteId,
    accion: "vincular",
    actor_id: user.id,
    automatico: false,
  });

  revalidatePath("/vinculacion");
  return { error: null, ok: true };
}

export async function desvincularCuenta(
  profileId: string,
  clienteId: string
): Promise<EstadoVinculacion> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión expiró. Recarga la página." };

  const { data, error } = await supabase
    .from("membresias")
    .update({ cliente_id: null })
    .eq("profile_id", profileId)
    .eq("cliente_id", clienteId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: "No pudimos desvincular la cuenta. Intenta de nuevo." };
  }

  if (!data) {
    return { error: "Esta cuenta ya no estaba vinculada a ese cliente. Recarga la página." };
  }

  await supabase.from("vinculacion_eventos").insert({
    profile_id: profileId,
    cliente_id: clienteId,
    accion: "desvincular",
    actor_id: user.id,
    automatico: false,
  });

  revalidatePath("/vinculacion");
  return { error: null, ok: true };
}
