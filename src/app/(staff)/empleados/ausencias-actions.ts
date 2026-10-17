"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mensajeDeError } from "@/lib/empleados/errores";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

function refrescar() {
  revalidatePath("/empleados", "layout");
  revalidatePath("/mi-trabajo");
  revalidatePath("/estetica");
  revalidatePath("/recepcion");
  revalidatePath("/admin");
}

// empleadoId NULL = para quien tiene la sesión.
export async function solicitarAusencia(empleadoId: string | null, fd: FormData): Promise<ResultadoAccion> {
  const tipo = String(fd.get("tipo") ?? "");
  const desde = String(fd.get("desde") ?? "");
  const hasta = String(fd.get("hasta") ?? "") || desde;
  if (!tipo) return { error: "Elige el tipo de ausencia." };
  if (!desde) return { error: "Pon desde qué día." };
  // Medio día: las dos horas juntas, y solo en un día.
  const horaDesde = String(fd.get("hora_desde") ?? "");
  const horaHasta = String(fd.get("hora_hasta") ?? "");
  if (Boolean(horaDesde) !== Boolean(horaHasta)) return { error: "Para una ausencia de medio día escribe la hora de inicio y la de fin." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("solicitar_ausencia", {
    p_empleado_id: empleadoId,
    p_tipo: tipo,
    p_desde: desde,
    p_hasta: hasta,
    p_motivo: String(fd.get("motivo") ?? ""),
    ...(horaDesde ? { p_hora_desde: horaDesde, p_hora_hasta: horaHasta } : {}),
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
  // La aprobación no se detiene por las citas que ya tenía: se avisa y se reasignan abajo.
  const { data: citas } = await supabase.rpc("citas_afectadas_por_ausencia", { p_ausencia_id: id });
  const n = Array.isArray(citas) ? citas.length : 0;
  return {
    error: null,
    exito: n > 0 ? `Aprobada. Tiene ${n} ${n === 1 ? "cita" : "citas"} de estética en ese periodo: reasígnalas en «Aprobadas y resueltas».` : "Aprobada",
  };
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
