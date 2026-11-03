import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ResenaPublica = { estrellas: number; texto: string | null; respuesta: string | null; createdAt: string; quien: string };
export type ResenasPublicas = { total: number; promedio: number | null; ultimas: ResenaPublica[] };

/**
 * Las reseñas verificadas de un negocio para su página pública (App para dueños · Fase 3, pantalla 8): solo de dueños
 * que tuvieron esa cita o estancia y ya terminó (`portal_resenar`), las que el negocio no escondió, con el primer nombre
 * del dueño. Las pide el SERVIDOR: `resenas_de_negocio` es de `peludesk_definer` (solo ve el negocio del encabezado) y
 * no se le abre a la llave anónima. Sin reseñas, null (la página no enseña la sección).
 */
export const resenasPublicasDeNegocio = cache(async (negocioId: string): Promise<ResenasPublicas | null> => {
  const { data, error } = await createSupabaseAdminClient(negocioId).rpc("resenas_de_negocio", { p_negocio: negocioId });
  if (error || !data) return null;
  const d = data as { total?: number; promedio?: number | null; ultimas?: { estrellas: number; texto: string | null; respuesta: string | null; created_at: string; quien: string }[] };
  const total = Number(d.total ?? 0);
  if (total === 0) return null;
  return {
    total,
    promedio: d.promedio == null ? null : Number(d.promedio),
    ultimas: (d.ultimas ?? []).map((u) => ({ estrellas: u.estrellas, texto: u.texto, respuesta: u.respuesta, createdAt: u.created_at, quien: u.quien || "Cliente" })),
  };
});
