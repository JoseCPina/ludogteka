"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

export type EstadoMiPerroForm = { error: string | null; ok?: boolean; registros?: RegistroFinal[] };

export async function actualizarMiPerro(
  perroId: string,
  _estadoPrevio: EstadoMiPerroForm,
  formData: FormData
): Promise<EstadoMiPerroForm> {
  const supabase = await createSupabaseServerClient();

  // Un campo que la pantalla no mostró (módulo apagado) no viene en el formulario: se conserva lo guardado.
  const { data: actual } = await supabase
    .from("perros")
    .select("veterinario_nombre, veterinario_telefono, veterinario_clinica, autorizacion_medica_notas, tope_gasto_autorizado, alimentacion_notas")
    .eq("id", perroId)
    .maybeSingle();
  const campo = (nombre: string): string | null =>
    formData.has(nombre) ? String(formData.get(nombre) ?? "").trim() || null : ((actual as Record<string, unknown> | null)?.[nombre] as string | null) ?? null;

  const topeCrudo = String(formData.get("tope_gasto_autorizado") ?? "").trim();
  const tope = !formData.has("tope_gasto_autorizado")
    ? ((actual?.tope_gasto_autorizado as number | null) ?? null)
    : topeCrudo ? Number(topeCrudo.replace(",", ".")) : null;
  if (topeCrudo && Number.isNaN(tope)) {
    return { error: "El tope de gasto debe ser un número." };
  }

  const { error } = await supabase.rpc("actualizar_mi_perro", {
    p_perro_id: perroId,
    p_contacto_emergencia_nombre:
      String(formData.get("contacto_emergencia_nombre") ?? "").trim() || null,
    p_contacto_emergencia_telefono:
      String(formData.get("contacto_emergencia_telefono") ?? "").trim() || null,
    p_veterinario_nombre: campo("veterinario_nombre"),
    p_veterinario_telefono: campo("veterinario_telefono"),
    p_veterinario_clinica: campo("veterinario_clinica"),
    p_autorizacion_medica_notas: campo("autorizacion_medica_notas"),
    p_tope_gasto_autorizado: tope,
    p_alimentacion_notas: campo("alimentacion_notas"),
  });

  if (error) return { error: "No pudimos guardar los cambios. Intenta de nuevo." };

  revalidatePath("/portal");
  revalidatePath(`/portal/perros/${perroId}`);
  return { error: null, ok: true, registros: await registrosDe(supabase, [{ t: "perros", i: perroId }]) };
}
