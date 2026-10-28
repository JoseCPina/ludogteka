"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mensajeDeError } from "@/lib/empleados/errores";
import type { ResultadoAccion } from "@/lib/empleados/tipos";
import { registrosDe } from "@/lib/concurrencia/registro-final";

// empleadoId NULL = el propio empleado de la sesión. La base decide quién
// puede registrar por quién y deja dicho quién lo capturó.
export async function registrarEntrada(empleadoId: string | null): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_entrada", { p_empleado_id: empleadoId });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath("/empleados");
  revalidatePath("/mi-trabajo");
  return { error: null, exito: "Entrada registrada", registros: await registrosDe(supabase, [{ t: "asistencias", i: data as string | null }]) };
}

export async function registrarSalida(empleadoId: string | null): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_salida", { p_empleado_id: empleadoId });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath("/empleados");
  revalidatePath("/mi-trabajo");
  // La asistencia que se cerró: la más reciente del empleado (el de la sesión si no viene).
  const empleado = empleadoId ?? ((await supabase.rpc("mi_empleado_id")).data as string | null);
  const { data: asistencia } = empleado
    ? await supabase.from("asistencias").select("id").eq("empleado_id", empleado).is("deleted_at", null).order("entrada_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  return { error: null, exito: "Salida registrada", registros: await registrosDe(supabase, [{ t: "asistencias", i: asistencia?.id }]) };
}

// Solo admin, con motivo; el original queda en asistencia_correcciones.
// Entrada vacía = anular el registro de ese día.
export async function corregirAsistencia(empleadoId: string, fecha: string, fd: FormData): Promise<ResultadoAccion> {
  const entrada = String(fd.get("entrada") ?? "").trim() || null;
  const salida = String(fd.get("salida") ?? "").trim() || null;
  const motivo = String(fd.get("motivo") ?? "").trim();
  if (!motivo) return { error: "Escribe el motivo de la corrección." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("corregir_asistencia", {
    p_empleado_id: empleadoId,
    p_fecha: fecha,
    p_entrada: entrada,
    p_salida: salida,
    p_motivo: motivo,
  });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath(`/empleados/${empleadoId}`);
  // El registro de ese día (también si quedó anulado) y el empleado.
  const { data: asistencia } = await supabase.from("asistencias").select("id").eq("empleado_id", empleadoId).eq("fecha", fecha).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return {
    error: null,
    exito: entrada ? "Corrección guardada" : "Registro anulado",
    registros: await registrosDe(supabase, [{ t: "asistencias", i: asistencia?.id }, { t: "empleados", i: empleadoId }]),
  };
}
