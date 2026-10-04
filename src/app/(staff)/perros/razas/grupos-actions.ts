"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { esErrorSoloLectura, MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";

export type ResultadoRaza = { error: string | null; exito?: string };

// Los RAISE de la base ya vienen en español (P0001 y los de permiso, 42501).
function limpio(e: { code?: string; message: string } | null) {
  if (!e) return null;
  if (esErrorSoloLectura(e)) return MENSAJE_SOLO_LECTURA;
  return e.code === "P0001" || e.code === "42501" ? e.message : "No pudimos guardar esto. Intenta de nuevo.";
}

/** «Es esta raza»: reasigna todos los perros de un texto normalizado, en un paso. */
export async function asignarTextoARaza(textoNorm: string, razaId: string): Promise<ResultadoRaza & { normalizacionId?: string }> {
  if (!textoNorm || !razaId) return { error: "Elige la raza." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("razas_asignar_texto", { p_texto_norm: textoNorm, p_raza_id: razaId });
  if (error) return { error: limpio(error) };
  const fila = (Array.isArray(data) ? data[0] : data) as { normalizacion_id: string; perros: number } | null;
  revalidatePath("/perros/razas");
  revalidatePath("/estetica");
  return { error: null, exito: `${fila?.perros ?? 0} perro(s) asignado(s). Puedes deshacerlo abajo, en «Asignaciones recientes».`, normalizacionId: fila?.normalizacion_id };
}

export async function revertirNormalizacion(id: string): Promise<ResultadoRaza> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("razas_revertir_normalizacion", { p_normalizacion_id: id });
  if (error) return { error: limpio(error) };
  revalidatePath("/perros/razas");
  return { error: null, exito: `${data ?? 0} perro(s) regresaron a la raza que tenían escrita.` };
}

/** «Es una raza nueva»: propone la raza a la plataforma, ligada a los perros que la usan. */
export async function proponerRaza(datos: { nombre: string; variantes: string; tamanoId: string; pelajeId: string; textoNorm: string }): Promise<ResultadoRaza> {
  const variantes = datos.variantes.split(",").map((v) => v.trim()).filter(Boolean);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("razas_proponer", {
    p_nombre: datos.nombre,
    p_variantes: variantes,
    p_tamano_id: datos.tamanoId || null,
    p_pelaje_id: datos.pelajeId || null,
    p_texto_norm: datos.textoNorm || null,
  });
  if (error) return { error: limpio(error) };
  revalidatePath("/perros/razas");
  return { error: null, exito: "Propuesta enviada. Cuando la plataforma la apruebe, los perros se ligan solos y aquí te pedimos su grupo de precio." };
}

/** El grupo de precio de una raza en ESTE negocio (admin o permiso de tarifas). */
export async function asignarGrupoDeRaza(razaId: string, grupoId: string): Promise<ResultadoRaza> {
  if (!razaId || !grupoId) return { error: "Elige el grupo de precio." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("asignar_grupo_raza", { p_raza_id: razaId, p_grupo_raza_id: grupoId });
  if (error) return { error: limpio(error) };
  revalidatePath("/perros/razas");
  revalidatePath("/perros/razas/grupos");
  revalidatePath("/estetica");
  revalidatePath("/recepcion");
  return { error: null, exito: "Grupo de precio guardado." };
}

/** El grupo de precio de una raza propuesta que sigue en revisión (admin o permiso de tarifas). */
export async function asignarGrupoDePropuesta(propuestaId: string, grupoId: string): Promise<ResultadoRaza> {
  if (!propuestaId || !grupoId) return { error: "Elige el grupo de precio." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("asignar_grupo_propuesta", { p_propuesta_id: propuestaId, p_grupo_raza_id: grupoId });
  if (error) return { error: limpio(error) };
  revalidatePath("/perros/razas/grupos");
  revalidatePath("/estetica");
  return { error: null, exito: "Grupo de precio guardado. Cuando PeluDesk apruebe la raza, queda como su grupo en este negocio." };
}
