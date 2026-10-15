import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyNegocio, sumarDiasFecha } from "@/lib/formato";
import { proximaHoraDisponible, type HorarioDia } from "./proxima-hora";

/**
 * LA función de «siguiente hora disponible» de todo formulario que abre con una hora prellenada
 * (agendar en Estética, agendar en la agenda clínica…): la siguiente hora en punto, dentro del horario del
 * negocio, que todavía no pasa; o la primera del siguiente día que abre. Con `desdeFecha` (un día futuro
 * que ya se había escogido) busca desde ese día. Devuelve "AAAA-MM-DDTHH:MM" en la hora del negocio.
 * Un formulario nuevo con hora prellenada usa ESTA función, nunca una hora fija.
 */
export async function proponerHora(supabase: SupabaseClient, zona: string, desdeFecha?: string): Promise<string> {
  const hoy = hoyNegocio(zona);
  const base = desdeFecha && desdeFecha > hoy ? desdeFecha : hoy;
  const fechas = Array.from({ length: 15 }, (_, i) => sumarDiasFecha(base, i));
  const respuestas = await Promise.all(fechas.map((f) => supabase.rpc("resolver_cupo_configuracion", { p_fecha: f })));
  const horarios = new Map<string, HorarioDia | null>();
  fechas.forEach((f, i) => {
    const fila = (Array.isArray(respuestas[i].data) ? respuestas[i].data[0] : respuestas[i].data) as { estado?: string; hora_apertura?: string | null; hora_cierre?: string | null } | null;
    // Sin configurar (o sin respuesta) se usa el horario de siempre, 09:00 a 19:00.
    horarios.set(f, fila && fila.estado === "configurado" ? { abre: fila.hora_apertura != null, apertura: fila.hora_apertura ?? null, cierre: fila.hora_cierre ?? null } : null);
  });
  return proximaHoraDisponible(new Date().toISOString(), zona, (f) => horarios.get(f) ?? null, 14, desdeFecha);
}
