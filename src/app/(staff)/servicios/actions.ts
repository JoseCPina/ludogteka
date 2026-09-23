"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoServicioForm = { error: string | null; ok?: boolean };

const CATEGORIAS = ["guarderia", "hotel", "estetica", "cargo", "bono"] as const;
const UNIDADES = ["dia", "noche", "sesion", "evento", "km", "hora"] as const;

function leerCampos(formData: FormData) {
  const clave = String(formData.get("clave") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "");
  const unidad = String(formData.get("unidad") ?? "");
  const depende_grupo_raza = formData.get("depende_grupo_raza") === "on";
  const depende_tamano = formData.get("depende_tamano") === "on";
  const depende_pelaje = formData.get("depende_pelaje") === "on";
  const depende_cantidad = formData.get("depende_cantidad") === "on";
  const servicio_incluido_id = String(formData.get("servicio_incluido_id") ?? "").trim() || null;
  // Ilimitado: consumo sin tope dentro de la vigencia (la mensualidad).
  // Un bono así no lleva cantidad incluida; la base la calcula al vender
  // como los días que abre guardería en la vigencia (según el horario).
  const ilimitado = categoria === "bono" && formData.get("ilimitado") === "on";
  // Monto libre: solo cargos. Sin celda en la matriz; el importe se
  // captura al aplicarlo (comida especial).
  const monto_libre = categoria === "cargo" && formData.get("monto_libre") === "on";
  const cantidadCrudo = String(formData.get("cantidad_incluida") ?? "").trim();
  const vigenciaCrudo = String(formData.get("vigencia_dias") ?? "").trim();
  const ordenCrudo = String(formData.get("orden") ?? "").trim();

  return {
    clave,
    nombre,
    categoria,
    unidad,
    depende_grupo_raza,
    depende_tamano,
    depende_pelaje,
    depende_cantidad,
    servicio_incluido_id,
    ilimitado,
    monto_libre,
    cantidad_incluida: cantidadCrudo && !ilimitado ? Number(cantidadCrudo) : null,
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
  // El grupo de raza YA decide por su cuenta si el tamaño cuenta
  // (grupos_raza.depende_tamano). Marcar las dos casillas pediría una
  // celda por grupo Y por talla en los siete grupos, y ninguna de esas
  // celdas empataría con lo que la base busca al cotizar: todo saldría
  // "sin tarifa" con los precios capturados.
  if (campos.depende_grupo_raza && campos.depende_tamano) {
    return "Un servicio que cotiza por grupo de raza no lleva además la dimensión de tamaño: cada grupo ya decide si se cobra por talla.";
  }
  if (campos.categoria === "bono") {
    if (!campos.servicio_incluido_id) return "Un bono debe indicar a qué servicio da acceso.";
    if (campos.ilimitado) {
      if (!campos.vigencia_dias || campos.vigencia_dias <= 0) {
        return "Un bono ilimitado necesita vigencia: sin tope de unidades, lo único que lo acota es el tiempo.";
      }
    } else if (!campos.cantidad_incluida || campos.cantidad_incluida <= 0) {
      return "Un bono debe indicar cuántas unidades incluye, o marcarse como ilimitado.";
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
