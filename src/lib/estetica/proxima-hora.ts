// La hora que "Agendar" propone al abrir: la siguiente hora en punto de hoy que todavía no pasa y cae
// dentro del horario del negocio; si hoy ya no queda ninguna, la primera hora de la siguiente fecha
// que abre. Nunca una hora que ya pasó (QA externa B19: a las 13:00 proponía las 10:00).

export type HorarioDia = { abre: boolean; apertura: string | null; cierre: string | null };

function fechaLocal(iso: string, zona: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

function masDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  // utc-ok: aritmética de calendario sobre una fecha AAAA-MM-DD, sin instante
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "HH:MM[:SS]" → minutos desde la medianoche. */
function minutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
}

function aTexto(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function minutosLocales(iso: string, zona: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return v("hour") * 60 + v("minute");
}

/**
 * @param horarioDe horario de una fecha (AAAA-MM-DD); sin configurar, 09:00 a 19:00.
 * @returns "AAAA-MM-DDTHH:MM" (hora del negocio), listo para un datetime-local.
 */
export function proximaHoraDisponible(ahoraISO: string, zona: string, horarioDe: (fecha: string) => HorarioDia | null, dias = 14, desdeFecha?: string): string {
  const hoy = fechaLocal(ahoraISO, zona);
  // Si piden un día futuro, se busca desde ese día (a la apertura); un día pasado cuenta como hoy.
  const inicioBusqueda = desdeFecha && desdeFecha > hoy ? desdeFecha : hoy;
  const ahora = minutosLocales(ahoraISO, zona);
  let primeraAbierta: string | null = null;
  for (let i = 0; i <= dias; i++) {
    const fecha = masDias(inicioBusqueda, i);
    const h = horarioDe(fecha) ?? { abre: true, apertura: "09:00", cierre: "19:00" };
    if (!h.abre) continue;
    const apertura = minutos(h.apertura ?? "09:00");
    const cierre = minutos(h.cierre ?? "19:00");
    // Primera hora en punto estrictamente posterior a este momento (en hoy) o a la apertura (otro día).
    let inicio = Math.ceil(apertura / 60) * 60;
    if (fecha === hoy) inicio = Math.max(inicio, (Math.floor(ahora / 60) + 1) * 60);
    if (inicio < cierre) return `${fecha}T${aTexto(inicio)}`;
    primeraAbierta ??= `${fecha}T${aTexto(Math.ceil(apertura / 60) * 60)}`;
  }
  return primeraAbierta ?? `${masDias(inicioBusqueda, 1)}T09:00`;
}
