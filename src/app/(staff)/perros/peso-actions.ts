"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoPesoForm = { error: string | null; ok?: boolean };

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function registrarPeso(
  perroId: string,
  _estadoPrevio: EstadoPesoForm,
  formData: FormData
): Promise<EstadoPesoForm> {
  const pesoCrudo = String(formData.get("peso_kg") ?? "").replace(",", ".");
  const peso = Number(pesoCrudo);
  const fecha = String(formData.get("fecha") ?? "") || hoyISO();
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!pesoCrudo || Number.isNaN(peso) || peso <= 0) {
    return { error: "Escribe un peso válido en kilos." };
  }
  if (fecha > hoyISO()) {
    return { error: "La fecha no puede ser futura." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("pesos_registrados")
    .insert({ perro_id: perroId, peso_kg: peso, fecha, notas });

  if (error) return { error: "No pudimos guardar el peso. Intenta de nuevo." };

  revalidatePath(`/perros/${perroId}`);
  return { error: null, ok: true };
}
