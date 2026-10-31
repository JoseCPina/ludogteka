"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MENSAJE_DEMO } from "@/lib/solo-lectura";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

export async function darPorRevisada(id: string, nota: string): Promise<{ error: string | null; registros?: RegistroFinal[] }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("conciliacion_dar_por_revisada", { p_id: id, p_nota: nota });
  if (error) return { error: error.message.replace(/^.*?ERROR:\s*/, "") };
  revalidatePath("/caja/conciliacion");
  revalidatePath("/recepcion");
  return { error: null, registros: await registrosDe(supabase, [{ t: "conciliacion_terminal", i: id }]) };
}

/**
 * El admin da por revisadas todas las diferencias abiertas anteriores a una
 * fecha (hora del negocio), con una nota. La base comprueba que es admin y
 * devuelve las que cerró.
 */
export async function darPorRevisadasHasta(hasta: string, nota: string): Promise<{ error: string | null; cerradas?: number; registros?: RegistroFinal[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return { error: "Escoge una fecha." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("conciliacion_dar_por_revisadas_hasta", { p_hasta: hasta, p_nota: nota });
  if (error) return { error: error.message.replace(/^.*?ERROR:\s*/, "") };
  const r = (data ?? {}) as { cerradas?: number; ids?: string[] };
  revalidatePath("/caja/conciliacion");
  revalidatePath("/recepcion");
  return {
    error: null,
    cerradas: r.cerradas ?? 0,
    registros: await registrosDe(supabase, (r.ids ?? []).map((i) => ({ t: "conciliacion_terminal", i }))),
  };
}

// Opción del admin: ver también los pagos de la cuenta que PeluDesk no cobró
// (informativos). Apagada por omisión; la base vuelve a comprobar que es admin.
export async function guardarMostrarPagosAjenos(mostrar: boolean): Promise<{ error: string | null; registros?: RegistroFinal[] }> {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") return { error: "Solo un admin cambia esta opción." };
  if ((await cargarNegocioLanding()).plan === "demo") return { error: MENSAJE_DEMO };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_conciliacion_mostrar_ajenos", { p_mostrar: mostrar });
  if (error) return { error: error.message.replace(/^.*?ERROR:\s*/, "") };
  revalidatePath("/admin/pagos");
  revalidatePath("/caja/conciliacion");
  revalidatePath("/recepcion");
  const { data: ajuste } = await supabase.from("conciliacion_ajustes").select("id").limit(1).maybeSingle();
  return { error: null, registros: await registrosDe(supabase, [{ t: "conciliacion_ajustes", i: (ajuste?.id as string | undefined) ?? null, datos: { mostrar_pagos_ajenos: mostrar } }]) };
}
