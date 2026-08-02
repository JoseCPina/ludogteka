"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoServicioForm = { error: string | null; ok?: boolean };

const CATEGORIAS = ["guarderia", "hotel", "estetica", "cargo", "bono"] as const;
const UNIDADES = ["dia", "noche", "sesion", "evento", "km"] as const;

function leerCampos(formData: FormData) {
  const clave = String(formData.get("clave") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "");
  const unidad = String(formData.get("unidad") ?? "");
  const depende_tamano = formData.get("depende_tamano") === "on";
  const depende_pelaje = formData.get("depende_pelaje") === "on";
  const depende_cantidad = formData.get("depende_cantidad") === "on";
  const servicio_incluido_id = String(formData.get("servicio_incluido_id") ?? "").trim() || null;
  const cantidadCrudo = String(formData.get("cantidad_incluida") ?? "").trim();
  const vigenciaCrudo = String(formData.get("vigencia_dias") ?? "").trim();
  const ordenCrudo = String(formData.get("orden") ?? "").trim();

  return {
    clave,
    nombre,
    categoria,
    unidad,
    depende_tamano,
    depende_pelaje,
    depende_cantidad,
    servicio_incluido_id,
    cantidad_incluida: cantidadCrudo ? Number(cantidadCrudo) : null,
    vigencia_dias: vigenciaCrudo ? Number(vigenciaCrudo) : null,
    orden: ordenCrudo ? Number(ordenCrudo) : 0,
  };
}

function validar(campos: ReturnType<typeof leerCampos>): string | null {
  if (!campos.clave) return "Escribe una clave para el servicio.";
  if (!campos.nombre) return "Escribe un nombre.";
  if (!CATEGORIAS.includes(campos.categoria as (typeof CATEGORIAS)[number])) {
    return "Elige una categoría válida.";
  }
  if (!UNIDADES.includes(campos.unidad as (typeof UNIDADES)[number])) {
    return "Elige una unidad válida.";
  }
  if (campos.categoria === "bono") {
    if (!campos.servicio_incluido_id) return "Un bono debe indicar a qué servicio da acceso.";
    if (!campos.cantidad_incluida || campos.cantidad_incluida <= 0) {
      return "Un bono debe indicar cuántas unidades incluye.";
    }
  } else if (campos.servicio_incluido_id || campos.cantidad_incluida) {
    return "Solo un bono puede tener servicio incluido o cantidad incluida.";
  }
  return null;
}

export async function crearServicio(
  _estadoPrevio: EstadoServicioForm,
  formData: FormData
): Promise<EstadoServicioForm> {
  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return { error };

  const supabase = await createSupabaseServerClient();
  const { data, error: dbError } = await supabase
    .from("servicios")
    .insert(campos)
    .select("id")
    .single();

  if (dbError) {
    if (dbError.code === "23505") return { error: "Ya existe un servicio con esa clave." };
    return { error: "No pudimos guardar el servicio. Intenta de nuevo." };
  }

  revalidatePath("/servicios");
  redirect(`/servicios/${data.id}?creado=1`);
}

export async function actualizarServicio(
  id: string,
  _estadoPrevio: EstadoServicioForm,
  formData: FormData
): Promise<EstadoServicioForm> {
  const campos = leerCampos(formData);
  const error = validar(campos);
  if (error) return { error };

  const supabase = await createSupabaseServerClient();
  const { error: dbError } = await supabase.from("servicios").update(campos).eq("id", id);

  if (dbError) {
    if (dbError.code === "23505") return { error: "Ya existe un servicio con esa clave." };
    return { error: "No pudimos guardar los cambios. Intenta de nuevo." };
  }

  revalidatePath("/servicios");
  revalidatePath(`/servicios/${id}`);
  return { error: null, ok: true };
}

export async function darDeBajaServicio(id: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("servicios").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/servicios");
  revalidatePath(`/servicios/${id}`);
}
