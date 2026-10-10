"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { usaVeterinaria } from "@/lib/plan/modulos";
import { leerCamposClinicos, mensajeErrorClinico } from "@/lib/perros/ficha-clinica";

export type EstadoFichaClinica = { error: string | null; ok?: boolean };

/**
 * Guarda la ficha clínica de una mascota. Solo toca las columnas clínicas
 * (y la esterilización, que ya existía): la base vuelve a comprobar el
 * permiso y el módulo en el trigger.
 */
export async function guardarFichaClinica(
  perroId: string,
  _estadoPrevio: EstadoFichaClinica,
  formData: FormData
): Promise<EstadoFichaClinica> {
  const sesion = await obtenerSesionConRol();
  if (!sesion || !usaVeterinaria(sesion.modulos) || !tienePermiso(sesion, "editar_ficha_clinica")) {
    return { error: mensajeErrorClinico({ code: "42501" }) };
  }

  const leido = leerCamposClinicos(formData);
  if ("error" in leido) return { error: leido.error };

  const esterilizado = String(formData.get("esterilizado") ?? "");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("perros")
    .update({
      ...leido.campos,
      esterilizado: esterilizado === "" ? null : esterilizado === "si",
    })
    .eq("id", perroId)
    .select("cliente_id")
    .single();

  if (error) return { error: mensajeErrorClinico(error) };

  revalidatePath(`/perros/${perroId}`);
  if (data?.cliente_id) revalidatePath(`/clientes/${data.cliente_id}`);
  return { error: null, ok: true };
}
