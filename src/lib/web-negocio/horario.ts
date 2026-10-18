// El horario de la página web de un negocio y los días y horas que ofrece para pedir cita. Sale del horario del
// negocio en PeluDesk (horario_semana) o, en la vista previa de un prospecto, de su horario de Google
// (regularOpeningHours.periods). Sin imports: lo usan también las pruebas con Node directo.

/** Un renglón por día de la semana, 0 = domingo … 6 = sábado (como extract(dow) y como Google). null = cerrado. */
export type HorarioSemana = ({ abre: string; cierra: string } | null)[];

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Lunes a viernes de 9 a 19 y sábado de 10 a 14: el del negocio modelo, cuando no hay nada mejor. */
export const HORARIO_POR_OMISION: HorarioSemana = [null, ...Array.from({ length: 5 }, () => ({ abre: "09:00", cierra: "19:00" })), { abre: "10:00", cierra: "14:00" }];

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const aMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

type PeriodoGoogle = { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } };

/**
 * Los periodos de Google a un horario por día: con varios periodos el mismo día (cierra a comer) se toma la
 * primera apertura y el último cierre. Un negocio abierto 24 horas (un solo periodo sin cierre) queda de 0 a 24.
 */
export function horarioDeGoogle(periodos: PeriodoGoogle[] | null | undefined): HorarioSemana | null {
  if (!periodos?.length) return null;
  const h: HorarioSemana = [null, null, null, null, null, null, null];
  if (periodos.length === 1 && periodos[0].open && !periodos[0].close) return h.map(() => ({ abre: "00:00", cierra: "23:59" }));
  for (const p of periodos) {
    const d = p.open?.day;
    if (d == null || d < 0 || d > 6 || !p.open) continue;
    const abre = hhmm(p.open.hour ?? 0, p.open.minute ?? 0);
    const cierraDiaSiguiente = p.close?.day != null && p.close.day !== d;
    const cierra = !p.close || cierraDiaSiguiente ? "23:59" : hhmm(p.close.hour ?? 0, p.close.minute ?? 0);
    const prev = h[d];
    h[d] = prev ? { abre: aMin(abre) < aMin(prev.abre) ? abre : prev.abre, cierra: aMin(cierra) > aMin(prev.cierra) ? cierra : prev.cierra } : { abre, cierra };
  }
  return h.some(Boolean) ? h : null;
}

/** De las filas de horario_semana (dia_semana, hora_apertura, hora_cierre). */
export function horarioDeFilas(filas: { dia_semana: number; hora_apertura: string | null; hora_cierre: string | null }[] | null | undefined): HorarioSemana | null {
  if (!filas?.length) return null;
  const h: HorarioSemana = [null, null, null, null, null, null, null];
  for (const f of filas) if (f.hora_apertura && f.hora_cierre && f.dia_semana >= 0 && f.dia_semana <= 6) h[f.dia_semana] = { abre: f.hora_apertura.slice(0, 5), cierra: f.hora_cierre.slice(0, 5) };
  return h.some(Boolean) ? h : null;
}

export function diaSemana(fechaISO: string): number {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function sumarDias(fechaISO: string, n: number): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diasEntre(desdeISO: string, hastaISO: string): number {
  const [a, b] = [desdeISO, hastaISO].map((f) => {
    const [y, m, d] = f.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

/** «9:00 a.m.», «7:30 p.m.». */
export function hora12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const sufijo = h < 12 ? "a.m." : "p.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${sufijo}`;
}

/** Los próximos `n` días que abre desde `desde` (incluido), mirando hasta 30 días adelante. */
export function diasAbiertos(h: HorarioSemana, desde: string, n: number): string[] {
  const res: string[] = [];
  for (let i = 0; i < 30 && res.length < n; i++) {
    const f = sumarDias(desde, i);
    if (h[diaSemana(f)]) res.push(f);
  }
  return res;
}

/**
 * Las horas para empezar una cita ese día, cada 30 minutos, que terminan antes del cierre. Si la fecha es hoy,
 * solo las que faltan (con 30 minutos de margen).
 */
export function horasDelDia(h: HorarioSemana, fecha: string, duracionMin: number, ahora?: { fecha: string; minutos: number }): string[] {
  const dia = h[diaSemana(fecha)];
  if (!dia) return [];
  const inicio = Math.ceil(aMin(dia.abre) / 30) * 30;
  const fin = aMin(dia.cierra) - duracionMin;
  const desde = ahora && ahora.fecha === fecha ? Math.max(inicio, Math.ceil((ahora.minutos + 30) / 30) * 30) : inicio;
  const res: string[] = [];
  for (let m = desde; m <= fin; m += 30) res.push(hhmm(Math.floor(m / 60), m % 60));
  return res;
}

/** Para la tarjeta de horario: «Lunes · 9:00 a.m. a 7:00 p.m.», «Domingo · Cerrado». Empieza en lunes. */
export function renglonesHorario(h: HorarioSemana): { dia: string; texto: string; indice: number }[] {
  return [1, 2, 3, 4, 5, 6, 0].map((i) => {
    const d = h[i];
    return { dia: DIAS[i], indice: i, texto: d ? (d.abre === "00:00" && d.cierra === "23:59" ? "Abierto 24 horas" : `${hora12(d.abre)} a ${hora12(d.cierra)}`) : "Cerrado" };
  });
}

/** «Abierto · cierra a las 7:00 p.m.» o «Cerrado · abre el lunes a las 9:00 a.m.». */
export function estadoAhora(h: HorarioSemana, fecha: string, minutos: number): { abierto: boolean; texto: string } {
  const dia = h[diaSemana(fecha)];
  if (dia && minutos >= aMin(dia.abre) && minutos < aMin(dia.cierra)) return { abierto: true, texto: `Abierto · cierra a las ${hora12(dia.cierra)}` };
  if (dia && minutos < aMin(dia.abre)) return { abierto: false, texto: `Cerrado · abre hoy a las ${hora12(dia.abre)}` };
  for (let i = 1; i <= 7; i++) {
    const f = sumarDias(fecha, i);
    const d = h[diaSemana(f)];
    if (d) return { abierto: false, texto: `Cerrado · abre ${i === 1 ? "mañana" : `el ${DIAS[diaSemana(f)].toLowerCase()}`} a las ${hora12(d.abre)}` };
  }
  return { abierto: false, texto: "Cerrado" };
}

export function nombreDia(fechaISO: string): string {
  return DIAS[diaSemana(fechaISO)];
}
