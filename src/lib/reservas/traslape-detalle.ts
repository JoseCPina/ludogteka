import type { SupabaseClient } from "@supabase/supabase-js";
import { mensajeTraslape, mensajeTraslapeConDetalle, type EstanciaQueChoca } from "@/lib/reservas/traslape";

// Mensaje de traslape de una estancia: pregunta a la base con qué reserva choca
// y, si no la encuentra (otra causa del conflicto), cae al mensaje general.
export async function mensajeTraslapeDeEstancia(
  supabase: SupabaseClient,
  q: { perroId: string; entrada: string; salida: string; excluir?: string | null }
): Promise<string> {
  const { data } = await supabase.rpc("estancia_que_choca", {
    p_perro: q.perroId,
    p_entrada: q.entrada,
    p_salida: q.salida,
    p_excluir: q.excluir ?? null,
  });
  const c = data as EstanciaQueChoca | null;
  return c ? mensajeTraslapeConDetalle(c) : mensajeTraslape(q.entrada);
}
