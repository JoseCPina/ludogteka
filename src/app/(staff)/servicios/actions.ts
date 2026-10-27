"use server";

import { registrosFinales } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { conControl, controlDeFormulario } from "@/lib/concurrencia/servidor";
import { conflictoDeError, type Conflicto } from "@/lib/concurrencia/tipos";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EstadoServicioForm = { error: string | null; ok?: boolean; conflicto?: Conflicto | null; registros?: RegistroFinal[] };

const CATEGORIAS = ["guarderia", "hotel", "estetica", "veterinaria", "cargo", "bono"] as const;
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
  // La base exige duración en todo servicio de estética (y ninguna en los demás): la agenda la usa.
  const duracionCrudo = String(formData.get("duracion_minutos") ?? "").trim();

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
    duracion_minutos: categoria === "estetica" ? (duracionCrudo ? Number(duracionCrudo) : null) : null,
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
  if (campos.categoria === "estetica" && (!campos.duracion_minutos || !Number.isFinite(campos.duracion_minutos) || campos.duracion_minutos <= 0)) {
    return "Escribe cuántos minutos dura la cita: un servicio de estética necesita duración para la agenda.";
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

// Lo que la base rechaza, dicho con su motivo real (QA R22 N84: antes salía «No pudimos guardar» sin decir por qué).
const MOTIVOS_RESTRICCION: Record<string, string> = {
  servicios_duracion_solo_estetica: "Un servicio de estética necesita su duración en minutos (y los demás no llevan duración).",
  servicios_bono_coherente: "Un bono necesita el servicio al que da acceso y su cantidad (o ser ilimitado con vigencia).",
  servicios_monto_libre_solo_cargos: "Solo un cargo adicional puede ser de monto libre.",
  servicios_categoria_check: "Elige una categoría válida.",
  servicios_unidad_check: "Elige una unidad válida.",
};

function motivoDeError(dbError: { code?: string; message?: string; details?: string | null }, generico: string): string {
  if (dbError.code === "23505") return "Ya existe un servicio con esa clave.";
  const texto = `${dbError.message ?? ""} ${dbError.details ?? ""}`;
  for (const [restriccion, motivo] of Object.entries(MOTIVOS_RESTRICCION)) if (texto.includes(restriccion)) return motivo;
  if (dbError.code === "42501") return `${generico} No tienes permiso para guardar servicios.`;
  // Un mensaje escrito por la base (un disparador o una validación) se muestra tal cual.
  if (dbError.code === "P0001" && dbError.message) return dbError.message;
  return `${generico} Motivo: ${dbError.message ?? "error desconocido"}.`;
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
    return { error: motivoDeError(dbError, "No pudimos guardar el servicio.") };
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
  const { error: dbError } = await conControl(supabase.from("servicios").update(campos).eq("id", id), controlDeFormulario(formData));

  if (dbError) {
    const conflicto = conflictoDeError(dbError);
    if (conflicto) return { error: null, conflicto };
    return { error: motivoDeError(dbError, "No pudimos guardar los cambios.") };
  }

  revalidatePath("/servicios");
  revalidatePath(`/servicios/${id}`);
  return { error: null, registros: await registrosFinales(supabase, controlDeFormulario(formData)), ok: true };
}

export async function darDeBajaServicio(id: string) {
  const supabase = await createSupabaseServerClient();
  await supabase.from("servicios").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/servicios");
  revalidatePath(`/servicios/${id}`);
}
