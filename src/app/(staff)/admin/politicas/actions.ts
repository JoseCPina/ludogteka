"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { esErrorSoloLectura, MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import { CATALOGO_POLITICAS, LARGO_MAXIMO_POLITICA, type TextosPoliticas } from "@/lib/politicas/catalogo";

export type ResultadoPoliticas = { error: string | null; exito?: string };

/**
 * Guardar las políticas y reglas del negocio. La base decide quién puede
 * (admin o «Configuración del negocio») y valida las claves; aquí solo se
 * recorta y se acota el largo antes de mandarlas.
 */
export async function guardarPoliticas(textos: TextosPoliticas): Promise<ResultadoPoliticas> {
  const limpio: Record<string, string> = {};
  for (const p of CATALOGO_POLITICAS) {
    const v = textos[p.clave];
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t.length > LARGO_MAXIMO_POLITICA) return { error: `«${p.etiqueta}» pasa de ${LARGO_MAXIMO_POLITICA} caracteres.` };
    limpio[p.clave] = t;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_politicas_negocio", { p_textos: limpio });
  if (error) return { error: esErrorSoloLectura(error) ? MENSAJE_SOLO_LECTURA : error.message };
  revalidatePath("/admin/politicas");
  revalidatePath("/portal");
  return { error: null, exito: "Políticas guardadas" };
}
