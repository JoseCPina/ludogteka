"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

export type EstadoPublicarPlantilla = { error: string | null; plantillaId?: string };

export async function publicarPlantilla(
  titulo: string,
  cuerpo: string,
  requiereRefirma: boolean
): Promise<EstadoPublicarPlantilla> {
  if (!titulo.trim()) return { error: "El título no puede estar vacío." };
  if (!cuerpo.trim()) return { error: "El cuerpo del contrato no puede estar vacío." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("publicar_plantilla", {
    p_titulo: titulo,
    p_cuerpo: cuerpo,
    p_requiere_refirma: requiereRefirma,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/contratos");
  return { error: null, plantillaId: data as string };
}

export async function marcarRequiereRefirma(
  plantillaId: string,
  valor: boolean
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("marcar_requiere_refirma", {
    p_plantilla_id: plantillaId,
    p_valor: valor,
  });

  if (error) return { error: traducirError(error) };

  revalidatePath("/contratos");
  return { error: null };
}
