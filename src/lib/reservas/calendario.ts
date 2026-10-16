import { inicioSemana, sumarDiasFecha } from "@/lib/formato";

// Calendario de reservas de guardería y hotel: rangos de la vista, nivel de ocupación y el enlace de un día.
// Funciones puras (sin base de datos) para que la pantalla y las pruebas usen las mismas reglas.

export type VistaCalendario = "semana" | "mes";

export const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function fechaValida(v: string | undefined | null): v is string {
  if (!v || !FECHA_ISO.test(v)) return false;
  const [a, m, d] = v.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Primer día del mes de una fecha. */
export function inicioMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}

/** Último día del mes de una fecha. */
export function finMes(fecha: string): string {
  const [a, m] = fecha.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${fecha.slice(0, 7)}-${String(d).padStart(2, "0")}`;
}

/** Días que se pintan: la semana (lunes a domingo) o el mes completo con las semanas enteras alrededor. */
export function diasDeLaVista(vista: VistaCalendario, ancla: string): string[] {
  const desde = vista === "semana" ? inicioSemana(ancla) : inicioSemana(inicioMes(ancla));
  const finVista = vista === "semana" ? sumarDiasFecha(desde, 6) : sumarDiasFecha(inicioSemana(finMes(ancla)), 6);
  const dias: string[] = [];
  for (let f = desde; f <= finVista; f = sumarDiasFecha(f, 1)) dias.push(f);
  return dias;
}

/** Fecha ancla de la vista anterior o siguiente. */
export function moverAncla(vista: VistaCalendario, ancla: string, sentido: -1 | 1): string {
  if (vista === "semana") return sumarDiasFecha(ancla, 7 * sentido);
  const [a, m] = ancla.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + sentido, 1));
  // utc-ok: aritmética de calendario sobre una fecha AAAA-MM-DD, sin instante
  return d.toISOString().slice(0, 10);
}

export type NivelOcupacion = "sin_cupo" | "libre" | "normal" | "alto" | "lleno";

/** Qué tan lleno está un día contra su cupo: alto desde el 80 %, lleno al llegar al cupo. */
export function nivelOcupacion(ocupado: number, cupo: number | null): NivelOcupacion {
  if (cupo === null) return "sin_cupo";
  if (cupo <= 0) return ocupado > 0 ? "lleno" : "sin_cupo";
  if (ocupado >= cupo) return "lleno";
  if (ocupado === 0) return "libre";
  return ocupado / cupo >= 0.8 ? "alto" : "normal";
}

export type FiltrosCalendario = {
  vista: VistaCalendario;
  fecha: string;
  dia: string | null;
  modulo: "todos" | "guarderia" | "hotel";
  estado: "activas" | "todas" | "reservada" | "confirmada" | "en_curso" | "finalizada" | "cancelada" | "no_llego";
  desde: string;
  pagina: number;
};

export const ESTADOS_FILTRO: { clave: FiltrosCalendario["estado"]; etiqueta: string }[] = [
  { clave: "activas", etiqueta: "Activas (por venir y en curso)" },
  { clave: "reservada", etiqueta: "Reservada" },
  { clave: "confirmada", etiqueta: "Confirmada" },
  { clave: "en_curso", etiqueta: "En curso" },
  { clave: "finalizada", etiqueta: "Finalizada" },
  { clave: "cancelada", etiqueta: "Cancelada" },
  { clave: "no_llego", etiqueta: "No llegó" },
  { clave: "todas", etiqueta: "Todas" },
];

/** Lee los parámetros de la URL (todo lo raro cae a un valor seguro). */
export function leerFiltros(sp: Record<string, string | string[] | undefined>, hoy: string): FiltrosCalendario {
  const uno = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined));
  const dia = fechaValida(uno("dia")) ? (uno("dia") as string) : null;
  const fecha = fechaValida(uno("fecha")) ? (uno("fecha") as string) : (dia ?? hoy);
  const vista: VistaCalendario = uno("vista") === "mes" ? "mes" : "semana";
  const mod = uno("modulo");
  const modulo = mod === "guarderia" || mod === "hotel" ? mod : "todos";
  const est = uno("estado");
  const estado = ESTADOS_FILTRO.some((e) => e.clave === est) ? (est as FiltrosCalendario["estado"]) : "activas";
  const desde = fechaValida(uno("desde")) ? (uno("desde") as string) : hoy;
  const pagina = Math.max(0, Math.min(200, Number(uno("pagina")) || 0));
  return { vista, fecha, dia, modulo, estado, desde, pagina };
}

/** Enlace al calendario (con un día abierto, si se da). Lo usan el aviso de traslape y la propia pantalla. */
export function enlaceCalendario(p: Partial<{ vista: VistaCalendario; fecha: string; dia: string; modulo: string; estado: string; desde: string; pagina: number }> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === "" || v === "todos" || (k === "pagina" && v === 0)) continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return `/reservas/calendario${s ? `?${s}` : ""}`;
}
