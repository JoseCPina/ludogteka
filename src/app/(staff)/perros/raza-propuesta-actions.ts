"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { esErrorSoloLectura, MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import type { DatosRazaPropuesta } from "@/lib/razas-propuesta";

// Los RAISE de la base ya vienen en español (P0001 y los de permiso, 42501).
function limpio(e: { code?: string; message: string }) {
  if (esErrorSoloLectura(e)) return MENSAJE_SOLO_LECTURA;
  return e.code === "P0001" || e.code === "42501" ? e.message : "No pudimos guardar la raza. Intenta de nuevo.";
}

/**
 * «No la encuentro: agregar esta raza», desde el formulario del perro.
 * Con `perroId` (el perro ya existe) lo liga a la propuesta en el momento; sin
 * él, el formulario guarda la propuesta junto con el perro nuevo
 * (`ligarRazaPropuesta`, que usa la misma función de la base).
 */
export async function proponerRazaDesdeFormulario(
  datos: DatosRazaPropuesta & { perroId: string | null }
): Promise<{ error: string | null; propuestaId?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("razas_proponer_formulario", paramsRpc(datos, datos.perroId));
  if (error) return { error: limpio(error) };
  return { error: null, propuestaId: data as string };
}

function paramsRpc(d: DatosRazaPropuesta, perroId: string | null) {
  return {
    p_nombre: d.nombre,
    p_variantes: d.variantes.split(",").map((v) => v.trim()).filter(Boolean),
    p_tamano_id: d.tamanoId || null,
    p_pelaje_id: d.pelajeId || null,
    p_notas: d.notas || null,
    p_perro_id: perroId,
    p_grupo_raza_id: d.grupoId || null,
  };
}

/** Una propuesta que viajó en el formulario de un perro nuevo, ya con su id. */
export async function ligarRazaPropuesta(
  perroId: string,
  d: DatosRazaPropuesta
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("razas_proponer_formulario", paramsRpc(d, perroId));
  return { error: error ? limpio(error) : null };
}
