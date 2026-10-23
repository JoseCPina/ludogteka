// El horario de la página web de un negocio y los días y horas que ofrece para pedir cita. Sale del horario del
// negocio en PeluDesk (horario_semana) o, en la vista previa de un prospecto, de su horario de Google
// (regularOpeningHours.periods). Sin imports: lo usan también las pruebas con Node directo.

/** Un tramo de un día: de «abre» a «cierra» (HH:MM; «23:59» = hasta la medianoche). */
export type TramoHorario = { abre: string; cierra: string };

/**
 * Un renglón por día de la semana, 0 = domingo … 6 = sábado (como extract(dow) y como Google). null = cerrado.
 * `abre`/`cierra` son la primera apertura y el último cierre; `tramos`, si el día tiene varios (cierra a comer).
 */
export type HorarioSemana = ({ abre: string; cierra: string; tramos?: TramoHorario[] } | null)[];

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Lunes a viernes de 9 a 19 y sábado de 10 a 14: el del negocio modelo, cuando no hay nada mejor. */
export const HORARIO_POR_OMISION: HorarioSemana = [null, ...Array.from({ length: 5 }, () => ({ abre: "09:00", cierra: "19:00" })), { abre: "10:00", cierra: "14:00" }];

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const aMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

type PeriodoGoogle = { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } };

/** Abierto todo el día (00:00 a la medianoche, sin cortes). */
export function es24Horas(d: { abre: string; cierra: string; tramos?: TramoHorario[] } | null | undefined): boolean {
  return Boolean(d && d.abre === "00:00" && d.cierra === "23:59" && (!d.tramos || d.tramos.length <= 1));
}

/** Los tramos de un día (uno solo si no tiene cortes). */
export function tramosDe(d: { abre: string; cierra: string; tramos?: TramoHorario[] }): TramoHorario[] {
  return d.tramos?.length ? d.tramos : [{ abre: d.abre, cierra: d.cierra }];
}

/**
 * Los periodos de Google a un horario por día. Con varios periodos el mismo día (cierra a comer) se guardan como
 * tramos: no se ofrecen horas en el corte. Un negocio abierto 24 horas (un solo periodo sin cierre, o periodos de
 * 00:00 a 00:00 del día siguiente) queda de 00:00 a 23:59 y se muestra «Abierto 24 horas» en todos lados.
 */
export function horarioDeGoogle(periodos: PeriodoGoogle[] | null | undefined): HorarioSemana | null {
  if (!periodos?.length) return null;
  const h: HorarioSemana = [null, null, null, null, null, null, null];
  if (periodos.length === 1 && periodos[0].open && !periodos[0].close) return h.map(() => ({ abre: "00:00", cierra: "23:59" }));
  const tramos: TramoHorario[][] = [[], [], [], [], [], [], []];
  for (const p of periodos) {
    const d = p.open?.day;
    if (d == null || d < 0 || d > 6 || !p.open) continue;
    const abre = hhmm(p.open.hour ?? 0, p.open.minute ?? 0);
    const cierraDiaSiguiente = p.close?.day != null && p.close.day !== d;
    const cierra = !p.close || cierraDiaSiguiente ? "23:59" : hhmm(p.close.hour ?? 0, p.close.minute ?? 0);
    tramos[d].push({ abre, cierra: cierra === "00:00" ? "23:59" : cierra });
  }
  tramos.forEach((t, d) => {
    if (!t.length) return;
    t.sort((a, b) => aMin(a.abre) - aMin(b.abre));
    // Tramos que se tocan o se enciman se juntan.
    const juntos: TramoHorario[] = [];
    for (const x of t) {
      const u = juntos[juntos.length - 1];
      if (u && aMin(x.abre) <= aMin(u.cierra)) u.cierra = aMin(x.cierra) > aMin(u.cierra) ? x.cierra : u.cierra;
      else juntos.push({ ...x });
    }
    h[d] = { abre: juntos[0].abre, cierra: juntos[juntos.length - 1].cierra, ...(juntos.length > 1 ? { tramos: juntos } : {}) };
  });
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
  // utc-ok: aritmética de calendario sobre una fecha AAAA-MM-DD, sin instante
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diasEntre(desdeISO: string, hastaISO: string): number {
  const [a, b] = [desdeISO, hastaISO].map((f) => {
    const [y, m, d] = f.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

/** «9:00 a.m.», «7:30 p.m.»; «23:59» (hasta la medianoche) es «12:00 a.m.». */
export function hora12(t: string): string {
  if (t === "23:59") return "12:00 a.m.";
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
  const minimo = ahora && ahora.fecha === fecha ? Math.ceil((ahora.minutos + 30) / 30) * 30 : 0;
  const res: string[] = [];
  // Solo dentro de cada tramo real: nunca en el corte de mediodía ni después del cierre.
  for (const t of tramosDe(dia)) {
    const fin = (t.cierra === "23:59" ? 1440 : aMin(t.cierra)) - duracionMin;
    for (let m = Math.max(Math.ceil(aMin(t.abre) / 30) * 30, minimo); m <= fin && m < 1440; m += 30) res.push(hhmm(Math.floor(m / 60), m % 60));
  }
  return res;
}

/** Para la tarjeta de horario: «Lunes · 9:00 a.m. a 7:00 p.m.», «Domingo · Cerrado». Empieza en lunes. */
export function renglonesHorario(h: HorarioSemana): { dia: string; texto: string; indice: number }[] {
  return [1, 2, 3, 4, 5, 6, 0].map((i) => {
    const d = h[i];
    return { dia: DIAS[i], indice: i, texto: d ? (es24Horas(d) ? "Abierto 24 horas" : tramosDe(d).map((t) => `${hora12(t.abre)} a ${hora12(t.cierra)}`).join(" y ")) : "Cerrado" };
  });
}

/** «Abierto · cierra a las 7:00 p.m.», «Abierto 24 horas» o «Cerrado · abre el lunes a las 9:00 a.m.». */
export function estadoAhora(h: HorarioSemana, fecha: string, minutos: number): { abierto: boolean; texto: string } {
  if (h.every((d) => es24Horas(d))) return { abierto: true, texto: "Abierto 24 horas" };
  const dia = h[diaSemana(fecha)];
  if (dia) {
    const fin = (t: TramoHorario) => (t.cierra === "23:59" ? 1440 : aMin(t.cierra));
    const ahora = tramosDe(dia).find((t) => minutos >= aMin(t.abre) && minutos < fin(t));
    if (ahora) {
      // Abierto hasta la medianoche y mañana abre a las 00:00: no «cierra a las 12:00 a.m.».
      const siguiente = h[diaSemana(sumarDias(fecha, 1))];
      if (ahora.cierra === "23:59" && siguiente && siguiente.abre === "00:00") return { abierto: true, texto: es24Horas(dia) ? "Abierto 24 horas" : "Abierto" };
      return { abierto: true, texto: `Abierto · cierra a las ${hora12(ahora.cierra)}` };
    }
    const proximo = tramosDe(dia).find((t) => minutos < aMin(t.abre));
    if (proximo) return { abierto: false, texto: `Cerrado · abre hoy a las ${hora12(proximo.abre)}` };
  }
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
