import type { SupabaseClient } from "@supabase/supabase-js";
import { admiteCargosNuevos, TEXTO_CUENTA_PAGADA_SIN_CARGOS } from "./cuenta-por-cobrar";

/**
 * Lo que una acción del servidor revisa antes de agregarle algo a la cuenta de una estancia (un cargo, un servicio
 * extra): la regla de `admiteCargosNuevos` con el estado de la estancia y los totales de su cuenta leídos de la base.
 * Devuelve el motivo para no hacerlo (con la ruta de la cuenta) o null.
 */
export async function motivoSinCargosNuevos(supabase: SupabaseClient, estanciaId: string): Promise<string | null> {
  const { data: est } = await supabase.from("estancias").select("estado, reserva_id").eq("id", estanciaId).maybeSingle();
  if (!est || est.estado !== "finalizada") return null;
  const { data } = await supabase.rpc("cuenta_totales_reserva", { p_reserva_id: est.reserva_id });
  const t = (Array.isArray(data) ? data[0] : data) as { saldo?: number; total_cobrado?: number } | null;
  if (admiteCargosNuevos(est.estado as string, { saldo: t?.saldo, cobrado: t?.total_cobrado })) return null;
  return `${TEXTO_CUENTA_PAGADA_SIN_CARGOS} /reservas/${est.reserva_id}/cobrar`;
}
