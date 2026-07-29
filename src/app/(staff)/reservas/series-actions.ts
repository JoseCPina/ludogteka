"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "./traducir-error";

export type ResultadoFecha = { fecha: string; exito: boolean; motivo: string | null };

async function obtenerHoy(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<string> {
  const { data } = await supabase.rpc("fecha_negocio");
  return data as string;
}

export type EstadoCrearSerie = { error: string | null; serieId?: string; resultados?: ResultadoFecha[] };

export async function crearSerie(
  perroId: string,
  servicioId: string,
  diasSemana: number[],
  fechaInicio: string,
  fechaFin: string | null
): Promise<EstadoCrearSerie> {
  if (!perroId) return { error: "Elige un perro." };
  if (diasSemana.length === 0) return { error: "Elige al menos un día de la semana." };

  const supabase = await createSupabaseServerClient();
  const { data: serie, error: errorSerie } = await supabase
    .from("series_recurrentes")
    .insert({
      perro_id: perroId,
      servicio_id: servicioId,
      dias_semana: diasSemana,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
    })
    .select("id")
    .single();

  if (errorSerie || !serie) {
    return { error: traducirError(errorSerie ?? { message: "No pudimos crear la serie." }) };
  }

  const { data: resultados, error: errorGen } = await supabase.rpc("generar_estancias_serie", {
    p_serie_id: serie.id,
  });

  revalidatePath("/reservas/series");
  return {
    error: errorGen ? traducirError(errorGen) : null,
    serieId: serie.id,
    resultados: (resultados as ResultadoFecha[] | null) ?? [],
  };
}

export type EstadoRenovar = { error: string | null; resultados: ResultadoFecha[] };

export async function renovarHorizonte(serieId: string, semanas = 8): Promise<EstadoRenovar> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("generar_estancias_serie", {
    p_serie_id: serieId,
    p_horizonte_semanas: semanas,
  });
  if (error) return { error: traducirError(error), resultados: [] };
  revalidatePath(`/reservas/series/${serieId}`);
  return { error: null, resultados: (data as ResultadoFecha[] | null) ?? [] };
}

export type EstadoEditarSerie = { error: string | null; canceladas: number; resultados: ResultadoFecha[] };

// Cambiar el patrón (días, servicio o fecha_fin) nunca toca una estancia
// que ya tiene check-in o que ya pasó — solo las futuras que siguen en
// reservada/confirmada. Esas se BORRAN (deleted_at), no solo se cancelan,
// para que generar_estancias_serie no las cuente como "ya existentes" y
// pueda rellenar esas fechas con el patrón nuevo. Una cancelación suelta
// (cancelarEstancia) en cambio nunca toca deleted_at — así una fecha que
// el staff dio de baja a propósito no revive sola en la siguiente
// renovación. Ver la migración fix_generar_estancias_serie_* para el
// razonamiento completo.
export async function editarSerie(
  serieId: string,
  diasSemana: number[],
  servicioId: string,
  fechaFin: string | null
): Promise<EstadoEditarSerie> {
  if (diasSemana.length === 0) return { error: "Elige al menos un día de la semana.", canceladas: 0, resultados: [] };

  const supabase = await createSupabaseServerClient();

  const { error: errorUpdate } = await supabase
    .from("series_recurrentes")
    .update({ dias_semana: diasSemana, servicio_id: servicioId, fecha_fin: fechaFin })
    .eq("id", serieId);
  if (errorUpdate) return { error: traducirError(errorUpdate), canceladas: 0, resultados: [] };

  const hoy = await obtenerHoy(supabase);

  const { data: futuras, error: errorLectura } = await supabase
    .from("estancias")
    .select("id")
    .eq("serie_id", serieId)
    .is("deleted_at", null)
    .in("estado", ["reservada", "confirmada"])
    .gte("fecha_entrada", hoy);

  if (errorLectura) {
    return { error: "No pudimos leer las estancias de la serie.", canceladas: 0, resultados: [] };
  }

  let canceladas = 0;
  for (const e of futuras ?? []) {
    const { error } = await supabase
      .from("estancias")
      .update({ estado: "cancelada", deleted_at: new Date().toISOString() })
      .eq("id", e.id);
    if (!error) canceladas++;
  }

  const { data: resultados, error: errorGen } = await supabase.rpc("generar_estancias_serie", {
    p_serie_id: serieId,
  });

  revalidatePath(`/reservas/series/${serieId}`);
  return {
    error: errorGen ? traducirError(errorGen) : null,
    canceladas,
    resultados: (resultados as ResultadoFecha[] | null) ?? [],
  };
}

export type EstadoPausarSerie = { error: string | null; canceladas: number };

export async function pausarSerie(
  serieId: string,
  desde: string,
  hasta: string,
  motivo: string
): Promise<EstadoPausarSerie> {
  const supabase = await createSupabaseServerClient();

  const { error: errorInsert } = await supabase
    .from("series_pausas")
    .insert({ serie_id: serieId, desde, hasta, motivo: motivo.trim() || null });
  if (errorInsert) return { error: traducirError(errorInsert), canceladas: 0 };

  const { data: afectadas, error: errorLectura } = await supabase
    .from("estancias")
    .select("id")
    .eq("serie_id", serieId)
    .is("deleted_at", null)
    .in("estado", ["reservada", "confirmada"])
    .gte("fecha_entrada", desde)
    .lte("fecha_entrada", hasta);

  if (errorLectura) return { error: "No pudimos leer las estancias del rango.", canceladas: 0 };

  let canceladas = 0;
  for (const e of afectadas ?? []) {
    const { error } = await supabase.from("estancias").update({ estado: "cancelada" }).eq("id", e.id);
    if (!error) canceladas++;
  }

  revalidatePath(`/reservas/series/${serieId}`);
  return { error: null, canceladas };
}

export type EstadoAccionSimple = { error: string | null };

export async function quitarPausa(serieId: string, pausaId: string): Promise<EstadoAccionSimple> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("series_pausas")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", pausaId);
  if (error) return { error: traducirError(error) };
  revalidatePath(`/reservas/series/${serieId}`);
  return { error: null };
}

export type EstadoCancelarSerie = { error: string | null; canceladas: number };

export async function cancelarSerie(serieId: string): Promise<EstadoCancelarSerie> {
  const supabase = await createSupabaseServerClient();

  const { error: errorUpdate } = await supabase
    .from("series_recurrentes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", serieId);
  if (errorUpdate) return { error: traducirError(errorUpdate), canceladas: 0 };

  const { data: pendientes, error: errorLectura } = await supabase
    .from("estancias")
    .select("id")
    .eq("serie_id", serieId)
    .is("deleted_at", null)
    .in("estado", ["reservada", "confirmada"]);

  if (errorLectura) return { error: "No pudimos leer las estancias de la serie.", canceladas: 0 };

  let canceladas = 0;
  for (const e of pendientes ?? []) {
    const { error } = await supabase.from("estancias").update({ estado: "cancelada" }).eq("id", e.id);
    if (!error) canceladas++;
  }

  revalidatePath("/reservas/series");
  revalidatePath(`/reservas/series/${serieId}`);
  return { error: null, canceladas };
}
