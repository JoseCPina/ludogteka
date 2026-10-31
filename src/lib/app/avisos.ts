import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enviarPush } from "./push";

/**
 * Un aviso del centro de avisos de la app para dueños: queda en app_avisos (lo ve en la pestaña Avisos) y, si tiene el
 * celular suscrito, le llega como notificación push. Lo escribe el servidor.
 */
export type TipoAviso = "bienvenida" | "vinculo" | "prueba" | "recordatorio" | "perdida" | "encontrada" | "mensaje" | "sistema";

export async function crearAviso(o: { duenoId: string; tipo: TipoAviso; titulo: string; cuerpo: string; url?: string | null; mascotaId?: string | null; datos?: Record<string, unknown>; push?: boolean }): Promise<string | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("app_avisos")
    .insert({ dueno_id: o.duenoId, tipo: o.tipo, titulo: o.titulo.slice(0, 120), cuerpo: o.cuerpo.slice(0, 600), url: o.url ?? null, mascota_id: o.mascotaId ?? null, datos: o.datos ?? {}, created_by: null, updated_at: new Date().toISOString() })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[app] aviso", error.message);
    return null;
  }
  if (o.push !== false) await enviarPush(o.duenoId, { titulo: o.titulo, cuerpo: o.cuerpo, url: o.url ?? "/avisos", etiqueta: o.tipo });
  return (data?.id as string | undefined) ?? null;
}
