"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../../reservas/traducir-error";

export type EstadoEquipo = { error: string | null; ok?: boolean };

function leerCampos(formData: FormData) {
  const frecuencia = String(formData.get("frecuencia_mantenimiento_dias") ?? "").trim();
  const ultimo = String(formData.get("ultimo_mantenimiento") ?? "").trim();
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    area_id: String(formData.get("area_id") ?? ""),
    frecuencia_mantenimiento_dias: frecuencia ? Number(frecuencia) : null,
    que_mantenimiento: String(formData.get("que_mantenimiento") ?? "").trim() || null,
    ultimo_mantenimiento: ultimo || null,
    notas: String(formData.get("notas") ?? "").trim() || null,
  };
}

function validar(c: ReturnType<typeof leerCampos>): string | null {
  if (!c.nombre) return "Escribe el nombre.";
  if (!c.area_id) return "Elige el área.";
  if (c.frecuencia_mantenimiento_dias !== null && !(c.frecuencia_mantenimiento_dias > 0)) {
    return "Cada cuántos días toca el mantenimiento tiene que ser mayor a cero.";
  }
  return null;
}

// Alta rápida: admin y recepción (la base lo aplica). Sin proveedor ni costo.
export async function crearEquipo(_prev: EstadoEquipo, formData: FormData): Promise<EstadoEquipo> {
  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return { error };
  const cantidad = Number(formData.get("cantidad") ?? 0);
  if (!(cantidad >= 0) || !Number.isInteger(cantidad)) return { error: "La cantidad tiene que ser un número entero." };
  const estado = String(formData.get("estado") ?? "bueno");

  const supabase = await createSupabaseServerClient();
  const { error: dbError } = await supabase.from("equipos").insert({ ...campos, cantidad, estado });
  if (dbError) return { error: traducirError(dbError) };

  revalidatePath("/inventario");
  redirect("/inventario?ver=equipo&creado=equipo");
}

export async function actualizarEquipo(id: string, _prev: EstadoEquipo, formData: FormData): Promise<EstadoEquipo> {
  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return { error };

  const supabase = await createSupabaseServerClient();
  const { data, error: dbError } = await supabase.from("equipos").update(campos).eq("id", id).select("id");
  if (dbError) return { error: traducirError(dbError) };
  if (!data || data.length === 0) return { error: "No tienes permiso para editar el equipo." };

  revalidatePath("/inventario");
  revalidatePath(`/inventario/equipo/${id}`);
  return { error: null, ok: true };
}

// Estado, mantenimiento o cantidad: todo el personal (queda en la bitácora).
export async function registrarEventoEquipo(
  id: string,
  tipo: "estado" | "mantenimiento" | "cantidad",
  datos: { estado?: string; cantidad?: number; fecha?: string | null; nota?: string | null }
): Promise<EstadoEquipo> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_evento_equipo", {
    p_equipo_id: id,
    p_tipo: tipo,
    p_estado: datos.estado ?? null,
    p_cantidad: datos.cantidad ?? null,
    p_fecha: datos.fecha || null,
    p_nota: datos.nota || null,
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/inventario");
  revalidatePath(`/inventario/equipo/${id}`);
  return { error: null, ok: true };
}

export async function darDeBajaEquipo(id: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("equipos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/inventario");
}
