"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { esErrorSoloLectura, MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";

export type ResultadoEstablecimiento = { error: string | null; exito?: string };

const MENSAJE_PERMISO = "Solo un admin, o quien tenga el permiso «Configuración del negocio», edita los datos del establecimiento.";

function mensaje(error: { code?: string; message?: string }): string {
  if (esErrorSoloLectura(error)) return MENSAJE_SOLO_LECTURA;
  if (error.code === "42501") return MENSAJE_PERMISO;
  // Los mensajes que escribe la base para la persona (sin código técnico) se muestran tal cual.
  if (error.code === "P0001" && error.message) return error.message;
  return "No se pudo guardar. Intenta de nuevo.";
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
function texto(fd: FormData, k: string, max = 300): string | null {
  return String(fd.get(k) ?? "").trim().slice(0, max) || null;
}
function fecha(fd: FormData, k: string): string | null {
  const v = String(fd.get(k) ?? "").trim();
  return FECHA.test(v) ? v : null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function guardarEstablecimiento(fd: FormData): Promise<ResultadoEstablecimiento> {
  const medico = String(fd.get("mvra_medico_id") ?? "");
  const medicoId = UUID.test(medico) ? medico : null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_establecimiento", {
    p_aviso: texto(fd, "aviso", 120),
    p_aviso_fecha: fecha(fd, "aviso_fecha"),
    p_mvra_medico_id: medicoId,
    // Si se escoge a alguien del personal, su nombre y cédula salen de su designación.
    p_mvra_nombre: medicoId ? null : texto(fd, "mvra_nombre", 150),
    p_mvra_cedula: medicoId ? null : texto(fd, "mvra_cedula", 40),
    p_notas: texto(fd, "notas", 600),
  });
  if (error) return { error: mensaje(error) };
  revalidatePath("/admin/perfil");
  return { error: null, exito: "Datos del establecimiento guardados" };
}

export async function guardarPermisoEstablecimiento(fd: FormData): Promise<ResultadoEstablecimiento> {
  const id = String(fd.get("id") ?? "");
  const tipo = texto(fd, "tipo", 150);
  if (!tipo) return { error: "Escribe de qué es el permiso (licencia de funcionamiento, aviso, etc.)." };
  const nivel = String(fd.get("nivel") ?? "");
  if (!["federal", "estatal", "municipal"].includes(nivel)) return { error: "Escoge el nivel: federal, estatal o municipal." };
  const emision = fecha(fd, "emision");
  const vencimiento = fecha(fd, "vencimiento");
  if (emision && vencimiento && vencimiento < emision) return { error: "El vencimiento no puede ser antes de la emisión." };
  const avisoDias = Number(fd.get("aviso_dias") ?? 60);
  if (!Number.isInteger(avisoDias) || avisoDias < 0 || avisoDias > 730) return { error: "Los días de aviso van de 0 a 730." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_permiso_establecimiento", {
    p_id: UUID.test(id) ? id : null,
    p_tipo: tipo,
    p_numero: texto(fd, "numero", 120),
    p_autoridad: texto(fd, "autoridad", 150),
    p_nivel: nivel,
    p_emision: emision,
    p_vencimiento: vencimiento,
    p_aviso_dias: avisoDias,
    p_notas: texto(fd, "notas", 600),
  });
  if (error) return { error: mensaje(error) };
  revalidatePath("/admin/perfil");
  revalidatePath("/recepcion");
  return { error: null, exito: id ? "Permiso actualizado" : "Permiso agregado" };
}

export async function quitarPermisoEstablecimiento(id: string): Promise<ResultadoEstablecimiento> {
  if (!UUID.test(id)) return { error: "Ese permiso no existe." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("quitar_permiso_establecimiento", { p_id: id });
  if (error) return { error: mensaje(error) };
  revalidatePath("/admin/perfil");
  revalidatePath("/recepcion");
  return { error: null, exito: "Permiso quitado" };
}
