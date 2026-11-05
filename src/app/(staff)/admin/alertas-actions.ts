"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { traducirError } from "../reservas/traducir-error";

// «Dar por revisadas todas las anteriores a…» (migración 20261203003800): admin, o quien tenga el permiso «Dar por
// revisadas alertas en lote». La base cierra con la nota lo que «Necesita atención» arrastra de antes de la fecha (hora
// del negocio) y dice qué dejó pendiente (dinero y comprobantes no se cierran solos).

export type ConteoAlertas = { tarjetas: number; contratos: number; llegadas: number; links: number; conciliacion: number; citas: number };
/** La cuenta previa: además, las citas de estética que ya tienen un cobro (esas no se cierran). */
export type ConteoPrevio = ConteoAlertas & { citas_con_cobro: number };
export type ResultadoAlertas = {
  error: string | null;
  cerradas?: ConteoAlertas;
  total?: number;
  pendientes?: { cuentas_con_saldo: number; comprobantes: number; citas_con_cobro: number };
};

/** Cuántas cerraría (sin escribir), con las mismas reglas que el cierre. */
export async function contarAlertasHasta(hasta: string): Promise<{ error: string | null; conteo?: ConteoPrevio }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return { error: "Escoge una fecha." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("alertas_por_revisar_hasta", { p_hasta: hasta });
  if (error) return { error: traducirError(error) };
  // registro-final: solo lee (cuenta lo que cerraría); no cambia nada.
  return { error: null, conteo: (data ?? { tarjetas: 0, contratos: 0, llegadas: 0, links: 0, conciliacion: 0, citas: 0, citas_con_cobro: 0 }) as ConteoPrevio };
}

export async function darPorRevisadasAlertasHasta(hasta: string, nota: string, cerrarCitas = false): Promise<ResultadoAlertas> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return { error: "Escoge una fecha." };
  if (nota.trim().length < 5) return { error: "Escribe qué revisaste (al menos 5 letras)." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("alertas_dar_por_revisadas_hasta", { p_hasta: hasta, p_nota: nota.trim(), p_cerrar_citas: cerrarCitas });
  if (error) return { error: traducirError(error) };
  const r = data as { cerradas: ConteoAlertas; total: number; pendientes: { cuentas_con_saldo: number; comprobantes: number; citas_con_cobro: number } };
  // registro-final: cierra decenas de filas de cinco tablas; la pantalla pinta los conteos que devuelve y refresca el
  // tablero (no hay un registro vivo que mostrar).
  return { error: null, cerradas: r.cerradas, total: r.total, pendientes: r.pendientes };
}
