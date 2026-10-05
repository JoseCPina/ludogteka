import { DIA_DE_ETAPA, ETAPAS, type EtapaSeguimiento } from "./plantillas";

// Cuándo toca cada etapa. Todo en la hora DEL NEGOCIO: la zona entra como
// parámetro obligatorio, nunca la del servidor.

export const HORA_INICIO = 10; // 10:00
export const HORA_FIN = 19; // hasta las 19:00 (el último envío sale antes de las 19:00)
export const DIAS_PRUEBA_WEB = 7; // la página gratis aplica si completa el perfil en los primeros 7 días

type Partes = { fecha: string; hora: number; diaSemana: number };

/** Fecha local (AAAA-MM-DD), hora y día de la semana (0 domingo … 6 sábado) de un instante en una zona. */
export function partesLocales(instante: Date, zona: string): Partes {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" });
  const p = Object.fromEntries(f.formatToParts(instante).map((x) => [x.type, x.value]));
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), diaSemana: dias.indexOf(p.weekday) };
}

const aDias = (fecha: string) => Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10))) / 86_400_000;

/** Días calendario (en la zona del negocio) entre el registro y ahora: 0 el día del registro. */
export function diasDesdeRegistro(creadoAt: Date, ahora: Date, zona: string): number {
  return aDias(partesLocales(ahora, zona).fecha) - aDias(partesLocales(creadoAt, zona).fecha);
}

/** Lunes a sábado, de 10:00 a 19:00 en la zona del negocio. */
export function enVentanaDeEnvio(ahora: Date, zona: string): boolean {
  const p = partesLocales(ahora, zona);
  return p.diaSemana !== 0 && p.hora >= HORA_INICIO && p.hora < HORA_FIN;
}

const DIAS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «miércoles 7 de octubre»: un instante escrito en la zona del negocio. */
export function fechaEnTexto(instante: Date, zona: string): string {
  const p = partesLocales(instante, zona);
  const [, mes, dia] = p.fecha.split("-").map(Number);
  return `${DIAS_ES[p.diaSemana]} ${dia} de ${MESES_ES[mes - 1]}`;
}

/** El día 7 real de la prueba, escrito en la zona del negocio (no el día del envío). */
export function fechaLimiteWeb(creadoAt: Date, zona: string): string {
  return fechaEnTexto(new Date(creadoAt.getTime() + DIAS_PRUEBA_WEB * 86_400_000), zona);
}

export type EnviosPrevios = Partial<Record<EtapaSeguimiento, { estado: string; intentos: number; reintentable: boolean; updated_at: string; ultimo_intento_at?: string }>>;

const deDias = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const esDomingo = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay() === 0;

/**
 * El día del último aviso: el día en que termina la prueba (hora del negocio).
 * Si ese día no se puede mandar nada ANTES de que termine —el fin cae antes de
 * las 11:00 o en domingo— se manda el último día anterior con ventana (sin
 * domingos): nada sale una vez terminada la prueba, y un aviso de «hoy termina»
 * llega a tiempo en vez de no llegar.
 */
export function diaDelUltimoAviso(pruebaTerminaAt: Date, zona: string): string {
  const fin = partesLocales(pruebaTerminaAt, zona);
  if (fin.diaSemana !== 0 && fin.hora >= HORA_INICIO + 1) return fin.fecha;
  let d = aDias(fin.fecha) - 1;
  while (esDomingo(deDias(d))) d--;
  return deDias(d);
}

/**
 * La etapa que toca AHORA para un negocio, o null. El día 5 y el día 10 valen
 * desde su día hasta que empieza la siguiente (el día 5 no se manda el día 11:
 * diría «van 5 días»); el último aviso, el día de diaDelUltimoAviso. Nada
 * después de terminada la prueba. Una etapa se manda una vez; una fallida que
 * se puede reintentar, una sola vez más y pasados 30 minutos. La ventana de
 * envío se revisa aparte (enVentanaDeEnvio).
 */
export function etapaDebida(p: { ahora: Date; zona: string; creadoAt: Date; pruebaTerminaAt: Date; envios: EnviosPrevios }): EtapaSeguimiento | null {
  if (p.pruebaTerminaAt.getTime() <= p.ahora.getTime()) return null;
  const dias = diasDesdeRegistro(p.creadoAt, p.ahora, p.zona);
  const hoy = partesLocales(p.ahora, p.zona).fecha;
  const ultimoAviso = diaDelUltimoAviso(p.pruebaTerminaAt, p.zona);
  for (let i = ETAPAS.length - 1; i >= 0; i--) {
    const etapa = ETAPAS[i];
    const fueraDeDia =
      etapa === "dia15"
        ? hoy !== ultimoAviso
        : dias < DIA_DE_ETAPA[etapa] || hoy >= ultimoAviso || dias >= DIA_DE_ETAPA[ETAPAS[i + 1]];
    if (fueraDeDia) continue;
    const previo = p.envios[etapa];
    if (!previo) return etapa;
    const hace30 = p.ahora.getTime() - Date.parse(previo.ultimo_intento_at ?? previo.updated_at) >= 30 * 60_000;
    if (previo.estado === "fallido" && previo.reintentable && previo.intentos < 2 && hace30) return etapa;
    return null;
  }
  return null;
}

/** Días que le quedan a la prueba (redondeo hacia arriba), para el mensaje del día 10. */
export function diasRestantes(pruebaTerminaAt: Date, ahora: Date): number {
  return Math.max(1, Math.ceil((pruebaTerminaAt.getTime() - ahora.getTime()) / 86_400_000));
}
