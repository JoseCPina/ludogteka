"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// Borradores de formularios largos: uno por persona, por formulario y por registro
// (la clave). Viven en la base (formulario_borradores), así que aparecen aunque se
// cambie de computadora. Nunca llevan contraseñas ni archivos: lo decide el
// componente que los arma, y la base limita el tamaño y el formato.

export type Borrador = { datos: Record<string, unknown>; guardadoAt: string };

export async function guardarBorrador(
  formulario: string,
  clave: string,
  datos: Record<string, unknown>
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("borrador_guardar", { p_formulario: formulario, p_clave: clave, p_datos: datos });
  // Un borrador es una comodidad: si no se pudo guardar (negocio en solo lectura, sesión
  // vencida) no se le grita a nadie; el formulario sigue igual.
  return { error: error ? "No se pudo guardar el borrador." : null };
}

export async function leerBorrador(formulario: string, clave: string): Promise<{ error: string | null; borrador: Borrador | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("borrador_leer", { p_formulario: formulario, p_clave: clave });
  if (error) return { error: "No se pudo leer el borrador.", borrador: null };
  const d = data as { datos?: Record<string, unknown>; guardado_at?: string } | null;
  return { error: null, borrador: d?.datos ? { datos: d.datos, guardadoAt: d.guardado_at ?? new Date().toISOString() } : null };
}

export async function descartarBorrador(formulario: string, clave: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("borrador_descartar", { p_formulario: formulario, p_clave: clave });
  return { error: error ? "No se pudo descartar el borrador." : null };
}
