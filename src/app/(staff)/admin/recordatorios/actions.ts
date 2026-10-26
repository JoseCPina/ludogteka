"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AjustesRecordatorios = {
  estetica: boolean;
  veterinaria: boolean;
  llegada: boolean;
  listo: boolean;
  vacuna: boolean;
  /** HH:MM */
  hora: string;
};

/** Qué recordatorios salen solos y a qué hora (admin o «Configuración del negocio»; la base lo decide). */
export async function guardarAjustesRecordatorios(a: AjustesRecordatorios): Promise<{ error: string | null; exito?: string }> {
  if (!/^\d{2}:\d{2}$/.test(a.hora)) return { error: "Escribe la hora de envío (por ejemplo 10:00)." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_recordatorios_ajustes", {
    p_estetica: a.estetica,
    p_veterinaria: a.veterinaria,
    p_llegada: a.llegada,
    p_listo: a.listo,
    p_vacuna: a.vacuna,
    p_hora: a.hora,
  });
  if (error) return { error: error.message };
  const algo = a.estetica || a.veterinaria || a.llegada || a.listo || a.vacuna;
  return { error: null, exito: algo ? "Guardado. Los recordatorios salen solos a partir de ahora." : "Guardado. Los recordatorios automáticos quedaron apagados." };
}

/** El tope mensual de recordatorios adicionales (solo el admin). `null` = sin tope. */
export async function guardarTopeRecordatorios(tope: number | null): Promise<{ error: string | null; exito?: string }> {
  if (tope !== null && (!Number.isFinite(tope) || tope < 0 || tope > 100000)) return { error: "El tope va de $0 a $100,000." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_tope_recordatorios", { p_tope: tope });
  if (error) return { error: error.message };
  return { error: null, exito: tope === null ? "Listo: sin tope. Los recordatorios no se pausan por gasto." : `Listo: el tope quedó en $${tope.toLocaleString("es-MX")} + IVA al mes.` };
}

/** Marcar como atendido un mensaje de un cliente (cambio de cita, solicitud, texto, baja). */
export async function marcarMensajeAtendido(id: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("recordatorio_mensaje_atendido", { p_id: id });
  if (error) return { error: error.message };
  return { error: null };
}
