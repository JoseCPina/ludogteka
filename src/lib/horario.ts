import type { SupabaseClient } from "@supabase/supabase-js";
import { sumarDiasFecha } from "@/lib/formato";

// 1 = lunes … 7 = domingo, mismo criterio que extract(isodow) en la base.
function diaIso(fechaISO: string): number {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split("-").map(Number);
  const d = new Date(anio, mes - 1, dia).getDay();
  return d === 0 ? 7 : d;
}

// Días de la semana en que guardería NO abre, según el horario vigente
// (horario_semana, vía negocio_abre). Es solo para pintar el selector: la
// base rechaza igual una estancia o una serie de guardería en día cerrado.
// Si la consulta falla, no se marca nada como cerrado — mejor dejar que
// la base conteste con su mensaje que esconder un día que sí abre.
export async function diasSinGuarderia(supabase: SupabaseClient, hoy: string): Promise<number[]> {
  const fechas = Array.from({ length: 7 }, (_, i) => sumarDiasFecha(hoy, i));
  const respuestas = await Promise.all(fechas.map((f) => supabase.rpc("negocio_abre", { p_fecha: f })));
  return fechas.flatMap((f, i) => (respuestas[i].data === false ? [diaIso(f)] : [])).sort();
}
