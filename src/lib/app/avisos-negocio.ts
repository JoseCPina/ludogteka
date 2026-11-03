import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enviarPush } from "./push";

/**
 * Avisos del NEGOCIO al dueño (confirmó, movió o canceló su cita o su estancia; contestó su reseña): la base los deja en
 * app_avisos al momento (disparadores de la migración 20261203002300, solo cuando lo hace alguien del personal y nunca
 * en la demo) con `datos.push_pendiente`. Aquí se manda el push de los pendientes del último día y se apaga la marca
 * ANTES de mandar (dos despachos a la vez no mandan dos veces). Lo llaman las acciones del personal al terminar (con
 * `after`, sin hacer esperar la respuesta) y, por si alguna se quedó, la tarea de la app cada 15 minutos.
 */
export async function despacharAvisosPendientes(): Promise<{ enviados: number }> {
  const db = createSupabaseAdminClient();
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await db
    .from("app_avisos")
    .select("id, dueno_id, titulo, cuerpo, url, datos")
    .eq("tipo", "negocio")
    .eq("datos->>push_pendiente", "true")
    .gte("created_at", desde)
    .order("created_at")
    .limit(100);
  if (error) {
    console.error("[app] avisos pendientes", error.message);
    return { enviados: 0 };
  }
  let enviados = 0;
  for (const a of (data ?? []) as { id: string; dueno_id: string; titulo: string; cuerpo: string; url: string | null; datos: Record<string, unknown> }[]) {
    const { data: tomado } = await db
      .from("app_avisos")
      .update({ datos: { ...a.datos, push_pendiente: false, push_at: new Date().toISOString() } })
      .eq("id", a.id)
      .eq("datos->>push_pendiente", "true")
      .select("id")
      .maybeSingle();
    if (!tomado) continue;
    await enviarPush(a.dueno_id, { titulo: a.titulo, cuerpo: a.cuerpo, url: a.url ?? "/visitas", etiqueta: "negocio" });
    enviados += 1;
  }
  return { enviados };
}

/** Para las acciones del personal: manda los push pendientes cuando la respuesta ya salió. */
export function despacharAvisosAlTerminar(): void {
  after(async () => {
    try {
      await despacharAvisosPendientes();
    } catch (e) {
      console.error("[app] despachar avisos", e instanceof Error ? e.message : e);
    }
  });
}
