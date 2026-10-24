import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyNegocio, sumarDiasFecha } from "@/lib/formato";
import { proximaHoraDisponible, type HorarioDia, type Ocupado } from "./proxima-hora";

/**
 * LA función de «siguiente hora disponible» de todo formulario que abre con una hora prellenada
 * (agendar en Estética, agendar en la agenda clínica…): la siguiente media hora, dentro del horario del
 * negocio, que todavía no pasa; o la primera del siguiente día que abre. Con `desdeFecha` (un día futuro
 * que ya se había escogido) busca desde ese día. Devuelve "AAAA-MM-DDTHH:MM" en la hora del negocio.
 * Un formulario nuevo con hora prellenada usa ESTA función, nunca una hora fija.
 */
export async function proponerHora(supabase: SupabaseClient, zona: string, desdeFecha?: string): Promise<string> {
  return (await proponerHoraPorPersona(supabase, zona, {}, desdeFecha)).__todos;
}

/**
 * La misma propuesta, una por persona (estilista o médico): la siguiente media hora que además no se le encima con
 * ninguna de sus citas (QA S27). `__todos` es la de quien no tiene citas. Un solo viaje por el horario.
 */
export async function proponerHoraPorPersona(
  supabase: SupabaseClient,
  zona: string,
  ocupadosPorPersona: Record<string, Ocupado[]>,
  desdeFecha?: string,
  duracionMin?: number
): Promise<Record<string, string>> {
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
  const ahora = new Date().toISOString();
  const proponer = (ocupados: Ocupado[]) => proximaHoraDisponible(ahora, zona, (f) => horarios.get(f) ?? null, 14, desdeFecha, ocupados, duracionMin);
  const salida: Record<string, string> = { __todos: proponer([]) };
  for (const [id, ocupados] of Object.entries(ocupadosPorPersona)) salida[id] = proponer(ocupados);
  return salida;
}

/**
 * Fecha y hora con las que abre un formulario de cita que recibe `?fecha=AAAA-MM-DD` (la agenda clínica): la
 * fecha pedida MANDA sobre la propuesta si es válida y no es un día pasado (N116: llegaba por la agenda o por el
 * expediente y se ignoraba); sin fecha pedida, la de `proponerHora`.
 */
export async function proponerFechaHora(supabase: SupabaseClient, zona: string, fechaPedida?: string | null): Promise<{ fecha: string; hora: string }> {
  return (await proponerFechaHoraPorPersona(supabase, zona, fechaPedida, {})).__todos;
}

/** `fechaPedidaValida`: la ?fecha= que manda (AAAA-MM-DD, no pasada) o undefined. */
export function fechaPedidaValida(fechaPedida: string | null | undefined, zona: string): string | undefined {
  return fechaPedida && /^\d{4}-\d{2}-\d{2}$/.test(fechaPedida) && fechaPedida >= hoyNegocio(zona) ? fechaPedida : undefined;
}

/** `proponerFechaHora` por persona: con la fecha pedida, la primera media hora libre de cada quien. */
export async function proponerFechaHoraPorPersona(
  supabase: SupabaseClient,
  zona: string,
  fechaPedida: string | null | undefined,
  ocupadosPorPersona: Record<string, Ocupado[]>,
  duracionMin?: number
): Promise<Record<string, { fecha: string; hora: string }>> {
  const pedida = fechaPedidaValida(fechaPedida, zona);
  const propuestas = await proponerHoraPorPersona(supabase, zona, ocupadosPorPersona, pedida, duracionMin);
  return Object.fromEntries(Object.entries(propuestas).map(([id, p]) => [id, { fecha: pedida ?? p.slice(0, 10), hora: p.slice(11, 16) }]));
}

/**
 * El día que viaja como `?fecha=` en «Agendar» (N121): en la vista de día, el día que se ve; en Semana, el primer día de
 * la semana que se ve, o hoy si esa semana ya empezó (o ya pasó). El formulario además ignora un día pasado.
 */
export function fechaParaAgendar(vista: "dia" | "semana", ancla: string, desde: string, hoy: string): string {
  if (vista === "dia") return ancla;
  return desde > hoy ? desde : hoy;
}
