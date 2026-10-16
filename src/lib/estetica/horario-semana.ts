import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyNegocio, sumarDiasFecha } from "@/lib/formato";
import type { HorarioSemana } from "./aviso-horario";

/**
 * El horario del negocio por día de la semana (la configuración vigente hoy), para avisar en los formularios de
 * cita cuando se sale del horario. null = el negocio no tiene horario capturado (no se avisa nada).
 */
export async function cargarHorarioSemana(supabase: SupabaseClient, zona: string): Promise<HorarioSemana | null> {
  const hoy = hoyNegocio(zona);
  const fechas = Array.from({ length: 7 }, (_, i) => sumarDiasFecha(hoy, i));
  const respuestas = await Promise.all(fechas.map((f) => supabase.rpc("resolver_cupo_configuracion", { p_fecha: f })));
  const horario: HorarioSemana = {};
  let configurado = false;
  fechas.forEach((f, i) => {
    const fila = (Array.isArray(respuestas[i].data) ? respuestas[i].data[0] : respuestas[i].data) as { estado?: string; hora_apertura?: string | null; hora_cierre?: string | null } | null;
    if (!fila || fila.estado !== "configurado") return;
    configurado = true;
    const [a, m, d] = f.split("-").map(Number);
    const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    horario[dow] = fila.hora_apertura && fila.hora_cierre ? { apertura: fila.hora_apertura, cierre: fila.hora_cierre } : null;
  });
  return configurado ? horario : null;
}
