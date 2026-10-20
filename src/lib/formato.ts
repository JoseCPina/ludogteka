// Bug real (barrido de zona horaria, Fase 4): sin `timeZone` explícito,
// Intl.DateTimeFormat usa la del servidor que renderiza, no la del
// negocio — en un server de producción en UTC, "hora_salida_real" podía
// mostrar el día siguiente al real durante la tarde/noche. Se fija la zona
// igual que del lado de la base (fecha_negocio/hora_negocio), para que
// ambos lados cuenten la misma historia.
//
// PeluDesk: la zona es la DEL NEGOCIO (negocios.zona_horaria) y es un
// parámetro obligatorio de todo lo que convierte un instante en fecha u
// hora: en el servidor sale de `zonaActual()` (src/lib/negocio/actual.ts),
// en un componente de cliente de `useZonaNegocio()`
// (src/components/zona-negocio.tsx). Nunca una zona escrita a mano.
export type ZonaHoraria = string;

export function formatearFecha(iso: string, zona: ZonaHoraria): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: zona,
  }).format(new Date(iso));
}

// Día del NEGOCIO de un instante (timestamptz), con el mismo formato que
// formatearFechaCalendario. Es el que se usa para fichas, recibos y
// listas que muestran cuándo pasó algo.
export function formatearDiaDeInstante(iso: string, zona: ZonaHoraria): string {
  return formatearFecha(iso, zona);
}

// Para columnas `date` (calendario, sin hora ni huso horario) — a
// diferencia de un timestamptz, "2026-07-28" no es un instante. new
// Date("2026-07-28") lo interpreta como medianoche UTC, y en un huso
// horario negativo (México, UTC-6) eso se muestra como el día ANTERIOR.
// Aquí se arma la fecha con año/mes/día locales para que el calendario
// nunca se corra.
export function formatearFechaCalendario(fechaISO: string): string {
  // Un timestamp con hora es un instante, no un día: tomar sus 10
  // primeros caracteres da el día UTC (B20: una cita de las 18:30
  // aparecía al día siguiente). Para eso es formatearDiaDeInstante.
  if (process.env.NODE_ENV !== "production" && fechaISO.length > 10) {
    console.error(
      "formatearFechaCalendario recibió un instante con hora (" +
        fechaISO +
        "): usa formatearDiaDeInstante(iso, zona)"
    );
  }
  const [anio, mes, dia] = fechaISO.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(anio, mes - 1, dia));
}

// Mismo cuidado que formatearFechaCalendario: arma la fecha con
// año/mes/día locales (nunca parseando el ISO directo) para que sumar
// días no se corra un día por el huso horario del servidor.
export function sumarDiasFecha(fechaISO: string, dias: number): string {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia + dias);
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Etiqueta corta de día de la semana, para la tabla de calendario.
export function formatearDiaSemana(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { weekday: "short" }).format(
    new Date(anio, mes - 1, dia)
  );
}

// Año/mes/día de un instante en la zona real del negocio, vía Intl (usa
// la base de datos de husos horarios del runtime, igual que
// `at time zone zona_negocio()` del lado de Postgres) — más fiel que
// asumir un offset fijo a mano (y con horario de verano donde lo hay).
export function fechaLocalDeInstante(iso: string, zona: ZonaHoraria): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const obtener = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${obtener("year")}-${obtener("month")}-${obtener("day")}`;
}

// "Hoy" del lado del cliente, sin ir a la base. La fuente de verdad
// siempre es fecha_negocio() (RPC) — esto es solo para componentes
// "use client" que necesitan un default antes de que el usuario toque
// nada (p. ej. precargar un date picker) y para el único fallback si esa
// llamada falla. Nunca calcules "hoy" con `new Date().toISOString()`
// suelto: eso da el día UTC, no el del negocio, y es exactamente el bug
// que ya mordió varias veces.
export function hoyNegocio(zona: ZonaHoraria): string {
  return fechaLocalDeInstante(new Date().toISOString(), zona);
}

// Hora local (HH:MM) de un timestamptz, mismo offset fijo que arriba —
// para mostrar la hora de una cita sin volver a caer en el bug de
// mostrar la hora del servidor.
export function horaLocalDeInstante(iso: string, zona: ZonaHoraria): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zona,
  }).format(new Date(iso));
}

// Hora del NEGOCIO de un instante en 12 horas, p. ej. «09:14 a.m.» (columna Hora de los movimientos de caja).
export function formatearHoraNegocio(iso: string, zona: ZonaHoraria): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: zona,
  })
    .format(new Date(iso))
    .replace(/\u202f|\u00a0/g, " ")
    .replace(/\s?([ap])\.?\s?m\.?$/i, (_m, x: string) => ` ${x.toLowerCase()}.m.`);
}

// Minutos que la zona está adelante de UTC en ese instante (negativo en
// América; cambia con el horario de verano, p. ej. Tijuana).
function desfaseMinutos(instante: Date, zona: ZonaHoraria): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  const comoUtc = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return Math.round((comoUtc - instante.getTime()) / 60000);
}

// Lo que se escribe en un <input type="datetime-local"> ("2026-09-25T10:00")
// es la hora EN EL NEGOCIO: aquí se convierte al instante real (ISO UTC).
// El desfase se toma del propio instante, así que respeta el horario de
// verano de la zona. Antes se anclaba a "-06:00" fijo (San Luis Potosí).
export function instanteDeHoraLocal(valorDatetimeLocal: string, zona: ZonaHoraria): string {
  const [fecha, hora = "00:00"] = valorDatetimeLocal.split("T");
  const [a, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  const ingenuo = Date.UTC(a, m - 1, d, h, mi);
  let instante = ingenuo - desfaseMinutos(new Date(ingenuo), zona) * 60000;
  // Segunda vuelta: cerca del cambio de horario el desfase del primer
  // cálculo puede no ser el del instante resultante.
  instante = ingenuo - desfaseMinutos(new Date(instante), zona) * 60000;
  return new Date(instante).toISOString();
}

// Al revés: el valor para un <input type="datetime-local"> de un instante,
// en la hora del negocio.
export function horaLocalParaInput(iso: string, zona: ZonaHoraria): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
}

// Lunes de la semana que contiene fechaISO (semana laboral MX). Se usa
// año/mes/día locales, mismo cuidado que sumarDiasFecha.
export function inicioSemana(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  const diaSemanaIso = fecha.getDay() === 0 ? 7 : fecha.getDay(); // 1=lunes..7=domingo
  return sumarDiasFecha(fechaISO, 1 - diaSemanaIso);
}

const UNIDADES_PLURAL: Record<string, string> = {
  mililitro: "mililitros", litro: "litros", galón: "galones", galon: "galones", gramo: "gramos",
  kilogramo: "kilogramos", pieza: "piezas", tableta: "tabletas", frasco: "frascos", ampolleta: "ampolletas",
  cápsula: "cápsulas", capsula: "cápsulas", dosis: "dosis", sobre: "sobres", caja: "cajas", tubo: "tubos",
};

/** La unidad en singular si la cantidad es 1 y en plural si no («1 Mililitro», «5 Mililitros»). Respeta mayúsculas; lo que no conoce lo deja igual. */
export function unidadSegunCantidad(cantidad: number | string, unidad: string | null | undefined): string {
  const u = (unidad ?? "").trim();
  if (!u) return "";
  const n = Number(cantidad);
  const minus = u.toLowerCase();
  const adaptar = (nuevo: string) => (u[0] === u[0].toUpperCase() && u[0] !== u[0].toLowerCase() ? nuevo[0].toUpperCase() + nuevo.slice(1) : nuevo);
  if (n === 1) {
    const singular = Object.entries(UNIDADES_PLURAL).find(([s, p]) => p === minus && s !== p && s !== "galon" && s !== "capsula")?.[0];
    return singular ? adaptar(singular) : u;
  }
  return UNIDADES_PLURAL[minus] && UNIDADES_PLURAL[minus] !== minus ? adaptar(UNIDADES_PLURAL[minus]) : u;
}

// QA S18 (N52): cómo se nombra una cita en un diálogo de confirmación: servicio, mascota, día y hora del negocio,
// p. ej. «Baño exprés de Firulais, 20 oct 6:00 p.m.». Sin servicio: «la cita de Firulais, 20 oct 6:00 p.m.».
export function describirCita(servicio: string | null | undefined, mascota: string, iso: string, zona: ZonaHoraria): string {
  const dia = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: zona })
    .format(new Date(iso))
    .replace(/\.$/, "");
  const hora = formatearHoraNegocio(iso, zona).replace(/^0(\d)/, "$1");
  return `${servicio?.trim() ? servicio.trim() : "la cita"} de ${mascota}, ${dia} ${hora}`;
}

// QA S18 (N52): lo mismo para una estancia de guardería u hotel (fechas de calendario, sin hora):
// «Hotel por noche de Luna, 20 oct al 22 oct»; un solo día: «Guardería de Luna, 20 oct».
export function describirEstancia(servicio: string | null | undefined, mascota: string, entrada: string, salida?: string | null, categoria?: string | null): string {
  const corto = (f: string) => {
    const [a, m, d] = f.slice(0, 10).split("-").map(Number);
    return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(new Date(a, m - 1, d)).replace(/\.$/, "");
  };
  // Una visita de guardería guarda salida = entrada + 1 (convención de noches): es UN día.
  const sal = salida?.slice(0, 10) ?? null;
  const unDia = !sal || sal === entrada.slice(0, 10) || (categoria !== "hotel" && sal === sumarDiasFecha(entrada, 1));
  return `${servicio?.trim() ? servicio.trim() : "la reserva"} de ${mascota}, ${unDia ? corto(entrada) : `${corto(entrada)} al ${corto(sal!)}`}`;
}
