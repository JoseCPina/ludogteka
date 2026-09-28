import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * La llave de Google Maps es de PeluDesk, para todos los negocios, con un
 * tope de consultas al mes por negocio (el de su plan, o el que le ponga la
 * plataforma: planes/negocios.maps_consultas_mes). Antes de cada llamada
 * REAL a Google se aparta una consulta en la base (maps_reservar_consulta,
 * atómica); si ya se llegó al tope, no se llama y la pantalla pide los
 * kilómetros a mano. En simulación (sin llave) no se cuenta nada.
 *
 * `supabase` es el cliente con el que corre el camino (sesión del personal,
 * o la secret key atada al negocio en el alta por link): el negocio es el
 * de su encabezado.
 */
export type Cuota = { permitida: boolean; usadas: number; tope: number };

export function hayLlaveMaps(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

export async function apartarConsulta(supabase: SupabaseClient, tipo: "geocodificar" | "ruta"): Promise<Cuota> {
  const { data, error } = await supabase.rpc("maps_reservar_consulta", { p_tipo: tipo });
  if (error || !data) return { permitida: false, usadas: 0, tope: 0 };
  return data as Cuota;
}

export function mensajeTope(c: Cuota): string {
  return `Tu negocio ya usó las ${c.tope} consultas de Google Maps de este mes. Captura los kilómetros a mano; el mes que entra vuelve a calcularse solo.`;
}
