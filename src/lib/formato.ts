// Bug real (barrido de zona horaria, Fase 4): sin `timeZone` explícito,
// Intl.DateTimeFormat usa la del servidor que renderiza, no la de San
// Luis Potosí — en un server de producción en UTC, "hora_salida_real"
// podía mostrar el día siguiente al real durante la tarde/noche. Se fija
// la zona igual que del lado de la base (fecha_negocio/hora_negocio),
// para que ambos lados cuenten la misma historia.
export function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso));
}

// Para columnas `date` (calendario, sin hora ni huso horario) — a
// diferencia de un timestamptz, "2026-07-28" no es un instante. new
// Date("2026-07-28") lo interpreta como medianoche UTC, y en un huso
// horario negativo (México, UTC-6) eso se muestra como el día ANTERIOR.
// Aquí se arma la fecha con año/mes/día locales para que el calendario
// nunca se corra.
export function formatearFechaCalendario(fechaISO: string): string {
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
// `at time zone 'America/Mexico_City'` del lado de Postgres) — más fiel
// que asumir un offset fijo a mano.
export function fechaLocalDeInstante(iso: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
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
// suelto: eso da el día UTC, no el de San Luis Potosí, y es exactamente
// el bug que ya mordió varias veces.
export function hoyNegocio(): string {
  return fechaLocalDeInstante(new Date().toISOString());
}

// Hora local (HH:MM) de un timestamptz, mismo offset fijo que arriba —
// para mostrar la hora de una cita sin volver a caer en el bug de
// mostrar la hora del servidor.
export function horaLocalDeInstante(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(new Date(iso));
}

// Lunes de la semana que contiene fechaISO (semana laboral MX). Se usa
// año/mes/día locales, mismo cuidado que sumarDiasFecha.
export function inicioSemana(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  const diaSemanaIso = fecha.getDay() === 0 ? 7 : fecha.getDay(); // 1=lunes..7=domingo
  return sumarDiasFecha(fechaISO, 1 - diaSemanaIso);
}
