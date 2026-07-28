export function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
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
