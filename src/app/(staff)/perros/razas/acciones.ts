"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AsignacionRaza = {
  perro_id: string;
  raza_id: string;
  // El nombre del catálogo. Se guarda también en el texto libre para que
  // la ficha y el precio no digan cosas distintas: un perro con el id de
  // bóxer y la palabra "Beagle" escrita es peor que cualquiera de las dos
  // por separado.
  raza: string;
  // Solo cuando el grupo de esa raza cobra por talla y el perro no la
  // tenía registrada. Sin ella, su cita de estética se rechaza al
  // agendarse aunque la raza ya esté puesta.
  tamano_id?: string | null;
};

export type ResultadoNormalizacion = {
  error: string | null;
  guardados?: number;
  fallidos?: number;
};

/**
 * Asigna razas del catálogo a varios perros de una vez.
 *
 * Existe porque los perros capturados antes del catálogo tienen la raza
 * escrita a mano y `raza_id` vacío, y eso NO es un hueco cosmético: sin
 * `raza_id`, la vista `perro_grupo_raza` los manda al grupo
 * predeterminado (pelo corto, el más barato) y cada baño se cotiza mal.
 * Esperar a que cada dueño pase por el mostrador es dejar el error
 * corriendo mientras tanto.
 *
 * Va renglón por renglón y no en una transacción: cada asignación es
 * independiente e idempotente, así que si una falla las demás siguen
 * siendo correctas y la pantalla vuelve a listar solo lo que quedó
 * pendiente. Se reporta el conteo real, no un "listo" que esconda una
 * falla parcial.
 */
export async function asignarRazasEnLote(
  asignaciones: AsignacionRaza[]
): Promise<ResultadoNormalizacion> {
  if (asignaciones.length === 0) {
    return { error: "No hay razas que asignar." };
  }
  if (asignaciones.length > 300) {
    return { error: "Son demasiados de una vez. Guarda por partes." };
  }
  if (asignaciones.some((a) => !a.perro_id || !a.raza_id)) {
    return { error: "Falta el perro o la raza en alguna de las asignaciones." };
  }

  const supabase = await createSupabaseServerClient();

  const resultados = await Promise.all(
    asignaciones.map(async (a) => {
      const cambios: Record<string, unknown> = { raza_id: a.raza_id, raza: a.raza };
      if (a.tamano_id) cambios.tamano_id = a.tamano_id;

      const { error } = await supabase.from("perros").update(cambios).eq("id", a.perro_id);
      return !error;
    })
  );

  const guardados = resultados.filter(Boolean).length;
  const fallidos = resultados.length - guardados;

  revalidatePath("/perros/razas");
  revalidatePath("/estetica");
  revalidatePath("/servicios");

  if (guardados === 0) {
    return { error: "No pudimos guardar ninguna. Revisa tus permisos e intenta de nuevo." };
  }
  return { error: null, guardados, fallidos };
}
