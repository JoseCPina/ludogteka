import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaLocalDeInstante, hoyNegocio } from "@/lib/formato";

// Corte ciego (Fase 5; QA R59, N148): mientras un turno de caja esté abierto, ninguna pantalla enseña —ni manda al
// navegador— lo que entró por método en ese turno: quien va a contar (recepción o admin) lo vería antes de contar. La
// pantalla del turno no pinta montos; Reportes y su desglose no enseñan el dinero por método de un periodo que incluye
// el turno abierto. Todo aparece al cerrar el turno (con el conteo ya enviado).

/** El turno abierto si el periodo [desde, hasta] lo incluye (abrió antes de que termine el periodo y el periodo llega a hoy). */
export async function turnoAbiertoEnPeriodo(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
  zona: string,
): Promise<{ abiertoAt: string } | null> {
  const { data } = await supabase.from("turnos_caja").select("abierto_at").eq("estado", "abierto").is("deleted_at", null).limit(1).maybeSingle();
  if (!data?.abierto_at) return null;
  const abierto = fechaLocalDeInstante(data.abierto_at as string, zona);
  return abierto <= hasta && hoyNegocio(zona) >= desde ? { abiertoAt: data.abierto_at as string } : null;
}

/** Las tarjetas de Reportes con dinero de la caja por método (y las que con el turno abierto lo dejarían sumar). */
export function esTarjetaDeCaja(tarjeta: string): boolean {
  return /^(cobros|propinas|devoluciones):/.test(tarjeta) || tarjeta === "retiros" || tarjeta === "efectivo_agregado";
}

export const TEXTO_CORTE_CIEGO =
  "Hay un turno de caja abierto en este periodo: el dinero por método (efectivo, terminal, transferencia, tarjeta manual), los retiros y el ingreso neto de caja se ven cuando se cierre, después del conteo (corte ciego).";
