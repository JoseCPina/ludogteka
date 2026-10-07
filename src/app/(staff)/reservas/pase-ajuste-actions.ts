"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";
import type { RenglonHistorialPase } from "@/lib/bonos/ajuste";

export type ResultadoAjustePase = {
  error: string | null;
  usadosAntes?: number;
  usadosDespues?: number;
  reabre?: boolean;
  sigueVencido?: boolean;
};

function refrescar(perroId?: string | null) {
  if (perroId) revalidatePath(`/perros/${perroId}`);
  revalidatePath("/clientes", "layout");
  revalidatePath("/guarderia/pases");
  revalidatePath("/caja/pases");
  revalidatePath("/guarderia");
}

// Ajusta los días usados de UN pase. Quién puede lo decide la base
// (permiso «ajustar_pases»; la vigencia solo la cambia un admin).
export async function ajustarDiasPase(
  bonoId: string,
  usados: number,
  fechas: string[],
  motivo: string,
  motivoTexto: string,
  nuevaVigencia: string | null
): Promise<ResultadoAjustePase> {
  if (!Number.isInteger(usados)) return { error: "Escribe cuántos días usados debe llevar." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("ajustar_dias_pase", {
    p_bono_id: bonoId,
    p_usados: usados,
    p_fechas: fechas.filter(Boolean),
    p_motivo: motivo,
    p_motivo_texto: motivoTexto.trim() || null,
    p_nueva_vigencia: nuevaVigencia || null,
  });
  if (error) return { error: traducirError(error) };
  refrescar();
  const r = data as { usados_antes: number; usados_despues: number; reabre: boolean; sigue_vencido: boolean };
  return { error: null, usadosAntes: r.usados_antes, usadosDespues: r.usados_despues, reabre: r.reabre, sigueVencido: r.sigue_vencido };
}

export async function deshacerCheckin(
  estanciaId: string,
  motivo: string,
  motivoTexto: string
): Promise<{ error: string | null; devueltos?: number }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("deshacer_checkin_estancia", {
    p_estancia_id: estanciaId,
    p_motivo: motivo,
    p_motivo_texto: motivoTexto.trim() || null,
  });
  if (error) return { error: traducirError(error) };
  refrescar();
  revalidatePath(`/reservas/estancias/${estanciaId}/checkin`);
  revalidatePath("/guarderia/checkin");
  revalidatePath("/hotel/checkin");
  return { error: null, devueltos: (data as { devueltos: number }).devueltos };
}

export async function cargarHistorialPase(
  bonoId: string
): Promise<{ error: string | null; renglones: RenglonHistorialPase[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("historial_ajustes_pase", { p_bono_id: bonoId });
  if (error) return { error: "No pudimos cargar el historial.", renglones: [] };
  return {
    error: null,
    renglones: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      cuando: r.cuando as string,
      origen: r.origen as RenglonHistorialPase["origen"],
      motivo: r.motivo as string,
      motivo_texto: (r.motivo_texto as string | null) ?? null,
      usados_antes: r.usados_antes as number,
      usados_despues: r.usados_despues as number,
      total: r.total as number,
      disponibles_antes: r.disponibles_antes as number,
      disponibles_despues: r.disponibles_despues as number,
      vencimiento_antes: (r.vencimiento_antes as string | null) ?? null,
      vencimiento_despues: (r.vencimiento_despues as string | null) ?? null,
      fechas: (r.fechas as string[] | null) ?? [],
      estancia_id: (r.estancia_id as string | null) ?? null,
      por_nombre: r.por_nombre as string,
    })),
  };
}
