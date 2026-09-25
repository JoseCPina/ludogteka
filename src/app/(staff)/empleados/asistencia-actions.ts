"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mensajeDeError } from "@/lib/empleados/errores";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

// empleadoId NULL = el propio empleado de la sesión. La base decide quién
// puede registrar por quién y deja dicho quién lo capturó.
export async function registrarEntrada(empleadoId: string | null): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_entrada", { p_empleado_id: empleadoId });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath("/empleados");
  revalidatePath("/mi-trabajo");
  return { error: null, exito: "Entrada registrada" };
}

export async function registrarSalida(empleadoId: string | null): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_salida", { p_empleado_id: empleadoId });
  if (error) return { error: mensajeDeError(error) };
  revalidatePath("/empleados");
  revalidatePath("/mi-trabajo");
  return { error: null, exito: "Salida registrada" };
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
  return { error: null, exito: entrada ? "Corrección guardada" : "Registro anulado" };
}
