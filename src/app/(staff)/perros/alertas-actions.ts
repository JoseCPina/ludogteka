"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoAlertaForm = { error: string | null; ok?: boolean };

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function activarAlerta(
  perroId: string,
  _estadoPrevio: EstadoAlertaForm,
  formData: FormData
): Promise<EstadoAlertaForm> {
  const alertaId = String(formData.get("alerta_id") ?? "");
  const notas = String(formData.get("notas") ?? "").trim() || null;
  if (!alertaId) return { error: "Elige qué alerta quieres registrar." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("perro_alertas")
    .insert({ perro_id: perroId, alerta_id: alertaId, notas });

  if (error) return { error: "No pudimos guardar la alerta. Intenta de nuevo." };

  revalidatePath(`/perros/${perroId}`);
  return { error: null, ok: true };
}

// Nunca se borra: se marca activa=false y el motivo queda escrito en las
// notas, con fecha — el historial de que un perro mordió alguna vez es
// respaldo legal del negocio, no algo que deba desaparecer.
export async function desactivarAlerta(
  perroAlertaId: string,
  perroId: string,
  motivo: string
): Promise<{ error: string | null }> {
  if (!motivo.trim()) return { error: "Escribe el motivo de la baja." };

  const supabase = await createSupabaseServerClient();
  const { data: actual } = await supabase
    .from("perro_alertas")
    .select("notas")
    .eq("id", perroAlertaId)
    .single();

  const notasNuevas = [actual?.notas, `Desactivada (${hoyISO()}): ${motivo.trim()}`]
    .filter(Boolean)
    .join("\n\n");

  const { error } = await supabase
    .from("perro_alertas")
    .update({ activa: false, notas: notasNuevas })
    .eq("id", perroAlertaId);

  if (error) return { error: "No pudimos desactivar la alerta. Intenta de nuevo." };

  revalidatePath(`/perros/${perroId}`);
  return { error: null };
}

export async function registrarAlergia(
  perroId: string,
  _estadoPrevio: EstadoAlertaForm,
  formData: FormData
): Promise<EstadoAlertaForm> {
  const alergeno = String(formData.get("alergeno") ?? "").trim();
  const gravedad = String(formData.get("gravedad") ?? "") || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!alergeno) return { error: "Escribe a qué es alérgico." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("perro_alergias")
    .insert({ perro_id: perroId, alergeno, gravedad, notas });

  if (error) return { error: "No pudimos guardar la alergia. Intenta de nuevo." };

  revalidatePath(`/perros/${perroId}`);
  return { error: null, ok: true };
}
