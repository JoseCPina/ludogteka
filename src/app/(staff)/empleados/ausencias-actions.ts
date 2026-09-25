"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mensajeDeError } from "@/lib/empleados/errores";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

function refrescar() {
  revalidatePath("/empleados", "layout");
  revalidatePath("/mi-trabajo");
}

// empleadoId NULL = para quien tiene la sesión.
export async function solicitarAusencia(empleadoId: string | null, fd: FormData): Promise<ResultadoAccion> {
  const tipo = String(fd.get("tipo") ?? "");
  const desde = String(fd.get("desde") ?? "");
  const hasta = String(fd.get("hasta") ?? "") || desde;
  if (!tipo) return { error: "Elige el tipo de ausencia." };
  if (!desde) return { error: "Pon desde qué día." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("solicitar_ausencia", {
    p_empleado_id: empleadoId,
    p_tipo: tipo,
    p_desde: desde,
    p_hasta: hasta,
    p_motivo: String(fd.get("motivo") ?? ""),
  });
  if (error) return { error: mensajeDeError(error) };
  refrescar();
  return { error: null, exito: "Solicitud enviada: queda por aprobar" };
}

export async function aprobarAusencia(id: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolver_ausencia", { p_ausencia_id: id, p_aprobar: true, p_motivo: null });
  if (error) return { error: mensajeDeError(error) };
  refrescar();
  return { error: null, exito: "Aprobada" };
}

export async function rechazarAusencia(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolver_ausencia", { p_ausencia_id: id, p_aprobar: false, p_motivo: String(fd.get("motivo") ?? "") });
  if (error) return { error: mensajeDeError(error) };
  refrescar();
  return { error: null, exito: "Rechazada" };
}

export async function cancelarAusencia(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancelar_ausencia", { p_ausencia_id: id, p_motivo: String(fd.get("motivo") ?? "") });
  if (error) return { error: mensajeDeError(error) };
  refrescar();
  return { error: null, exito: "Cancelada" };
}

export async function ajustarVacaciones(empleadoId: string, fd: FormData): Promise<ResultadoAccion> {
  const dias = Number(String(fd.get("dias") ?? "").replace(",", "."));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("ajustar_vacaciones", {
    p_empleado_id: empleadoId,
    p_dias: dias,
    p_tipo: String(fd.get("tipo") ?? "asignacion"),
    p_motivo: String(fd.get("motivo") ?? ""),
  });
  if (error) return { error: mensajeDeError(error) };
  refrescar();
  return { error: null, exito: "Saldo actualizado" };
}
