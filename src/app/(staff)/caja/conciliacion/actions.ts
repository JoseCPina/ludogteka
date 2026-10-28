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
