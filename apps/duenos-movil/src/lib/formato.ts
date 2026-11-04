/** Fechas y montos como los dice la app (español de México). Un instante se dice en la zona de SU negocio. */
const ZONA_MX = "America/Mexico_City";

export function fechaCorta(aaaammdd: string | null | undefined): string {
  if (!aaaammdd) return "";
  const [a, m, d] = aaaammdd.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: a === new Date().getFullYear() ? undefined : "numeric", timeZone: "UTC" }).format(Date.UTC(a, m - 1, d)).replace(".", "");
}

export function fechaLarga(aaaammdd: string | null | undefined): string {
  if (!aaaammdd) return "";
  const [a, m, d] = aaaammdd.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(Date.UTC(a, m - 1, d));
}

export function diaDeInstante(iso: string, zona = ZONA_MX): string {
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: zona }).format(new Date(iso)).replace(/\./g, "");
}

export function horaDeInstante(iso: string, zona = ZONA_MX): string {
  return new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: zona }).format(new Date(iso)).replace(/\s?a\.?\s?m\.?/i, " a. m.").replace(/\s?p\.?\s?m\.?/i, " p. m.");
}

export function haceCuanto(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86_400);
  return d === 1 ? "ayer" : d < 7 ? `hace ${d} días` : fechaCorta(new Date(iso).toISOString());
}

export function enCuanto(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return "";
  if (dias < 0) return `Pasó hace ${-dias} ${dias === -1 ? "día" : "días"}`;
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias < 31) return `En ${dias} días`;
  const meses = Math.round(dias / 30);
  return `En ${meses} ${meses === 1 ? "mes" : "meses"}`;
}

export const pesos = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const distancia = (m: number) => (m < 950 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);

export function hoyLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_MX, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function sumarDias(aaaammdd: string, n: number): string {
  const [a, m, d] = aaaammdd.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + n));
  return f.toISOString().slice(0, 10);
}
