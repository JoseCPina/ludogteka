"use server";

import { revalidatePath } from "next/cache";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";

/** Esconder, volver a mostrar o borrar una alerta de la calle (la base exige es_admin_plataforma). */
export async function moderarAlerta(id: string, accion: "ocultar" | "restaurar" | "borrar", fd: FormData): Promise<ResultadoPlataforma> { // registro-final: la plataforma recarga la lista con revalidatePath
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["ocultar", "restaurar", "borrar"].includes(accion)) return { error: "Alerta inválida." };
  const { supabase } = await exigirPlataforma();
  const { error } = await supabase.rpc("plataforma_alerta_calle_moderar", { p_id: id, p_accion: accion, p_motivo: String(fd.get("motivo") ?? "").trim().slice(0, 200) });
  if (error) return { error: error.message };
  revalidatePath("/plataforma/alertas");
  return { error: null, exito: accion === "ocultar" ? "Alerta escondida" : accion === "restaurar" ? "Alerta visible otra vez" : "Alerta borrada" };
}
