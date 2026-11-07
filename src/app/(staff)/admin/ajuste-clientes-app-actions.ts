"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mensajeDeError } from "@/lib/empleados/errores";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

/** La base comprueba que sea un admin. Vuelve a Inicio, que lee el ajuste de nuevo. */
export async function fijarAceptaClientesApp(acepta: boolean): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("negocio_fijar_acepta_clientes_app", { p_acepta: acepta });
  if (error) return { error: mensajeDeError(error) };
  return { error: null, ir: `/admin?ajuste=${Date.now()}` };
}
