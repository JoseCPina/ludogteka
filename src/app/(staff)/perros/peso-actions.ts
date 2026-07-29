"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoPesoForm = { error: string | null; ok?: boolean };

export async function registrarPeso(
  perroId: string,
  _estadoPrevio: EstadoPesoForm,
  formData: FormData
): Promise<EstadoPesoForm> {
  const pesoCrudo = String(formData.get("peso_kg") ?? "").replace(",", ".");
  const peso = Number(pesoCrudo);
  const notas = String(formData.get("notas") ?? "").trim() || null;

  if (!pesoCrudo || Number.isNaN(peso) || peso <= 0) {
    return { error: "Escribe un peso válido en kilos." };
  }

  const supabase = await createSupabaseServerClient();
  // fecha_negocio(), no new Date() — "hoy" es la fecha de San Luis
  // Potosí, no la del servidor (barrido de zona horaria, Fase 4).
  const { data: hoyData } = await supabase.rpc("fecha_negocio");
  const hoy = hoyData as string;
  const fecha = String(formData.get("fecha") ?? "") || hoy;

  if (fecha > hoy) {
    return { error: "La fecha no puede ser futura." };
  }

  const { error } = await supabase
    .from("pesos_registrados")
    .insert({ perro_id: perroId, peso_kg: peso, fecha, notas });

  if (error) return { error: "No pudimos guardar el peso. Intenta de nuevo." };

  revalidatePath(`/perros/${perroId}`);
  return { error: null, ok: true };
}
