/**
 * Lo puro de la cartilla de la app para dueños (sin base ni servidor): tipos, sugerencias por especie, estados, fechas.
 * Lo importan tanto las pantallas de cliente como el servidor; lo que lee o escribe la base vive en cartilla.ts.
 */
export type RegistroCartilla = {
  id: string;
  tipo: "vacuna" | "desparasitacion";
  nombre: string;
  subtipo: "interna" | "externa" | "ambas" | null;
  lote: string | null;
  laboratorio: string | null;
  fechaAplicacion: string | null;
  proximaDosis: string | null;
  fuente: "foto" | "manual" | "negocio" | "qr";
  confianza: number | null;
  notas: string | null;
  estado: "vigente" | "por_vencer" | "vencida" | "sin_fecha";
};

// Sugerencias para capturar a mano, por especie, con el intervalo habitual en meses (el dueño o su vet lo corrigen).
export const SUGERENCIAS: Record<"perro" | "gato" | "otro", { nombre: string; meses: number; tipo: "vacuna" | "desparasitacion" }[]> = {
  perro: [
    { nombre: "Antirrábica", meses: 12, tipo: "vacuna" },
    { nombre: "Séxtuple (múltiple)", meses: 12, tipo: "vacuna" },
    { nombre: "Bordetella (tos de perrera)", meses: 12, tipo: "vacuna" },
    { nombre: "Desparasitación interna", meses: 3, tipo: "desparasitacion" },
    { nombre: "Desparasitación externa (pulgas y garrapatas)", meses: 1, tipo: "desparasitacion" },
  ],
  gato: [
    { nombre: "Antirrábica", meses: 12, tipo: "vacuna" },
    { nombre: "Triple felina", meses: 12, tipo: "vacuna" },
    { nombre: "Leucemia felina", meses: 12, tipo: "vacuna" },
    { nombre: "Desparasitación interna", meses: 3, tipo: "desparasitacion" },
    { nombre: "Desparasitación externa", meses: 1, tipo: "desparasitacion" },
  ],
  otro: [{ nombre: "Desparasitación", meses: 3, tipo: "desparasitacion" }],
};

export function estadoDe(proxima: string | null, hoy = hoyMx()): RegistroCartilla["estado"] {
  if (!proxima) return "sin_fecha";
  const dias = diasEntre(hoy, proxima);
  if (dias < 0) return "vencida";
  if (dias <= 30) return "por_vencer";
  return "vigente";
}

export function hoyMx(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
/** Días de a → b (AAAA-MM-DD), positivos si b es después. */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);
}
export function sumarMeses(fecha: string, meses: number): string {
  const d = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1 + meses, +fecha.slice(8, 10)));
  return d.toISOString().slice(0, 10);
}

export function aRegistro(f: Record<string, unknown>): RegistroCartilla {
  return {
    id: f.id as string,
    tipo: f.tipo as RegistroCartilla["tipo"],
    nombre: f.nombre as string,
    subtipo: (f.subtipo as RegistroCartilla["subtipo"]) ?? null,
    lote: (f.lote as string | null) ?? null,
    laboratorio: (f.laboratorio as string | null) ?? null,
    fechaAplicacion: (f.fecha_aplicacion as string | null) ?? null,
    proximaDosis: (f.proxima_dosis as string | null) ?? null,
    fuente: f.fuente as RegistroCartilla["fuente"],
    confianza: f.confianza == null ? null : Number(f.confianza),
    notas: (f.notas as string | null) ?? null,
    estado: estadoDe((f.proxima_dosis as string | null) ?? null),
  };
}

/** Lo que toca pronto de una mascota: la próxima dosis de cada producto (el último registro de ese nombre). */
export function proximas(registros: RegistroCartilla[]): RegistroCartilla[] {
  const ultimo = new Map<string, RegistroCartilla>();
  for (const r of [...registros].sort((a, b) => (a.fechaAplicacion ?? "").localeCompare(b.fechaAplicacion ?? ""))) ultimo.set(`${r.tipo}|${r.nombre.toLowerCase()}`, r);
  return [...ultimo.values()].filter((r) => r.proximaDosis).sort((a, b) => a.proximaDosis!.localeCompare(b.proximaDosis!));
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10) + dias)).toISOString().slice(0, 10);
}
/** El instante (ISO) de una fecha a una hora del centro de México, respetando el horario del momento. */
export function instanteMx(fecha: string, hora: number, minuto = 0): string {
  const utc = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10), hora, minuto);
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(utc));
  const g = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0);
  const local = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
  return new Date(utc - (local - utc)).toISOString();
}
export function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${fecha}T00:00:00Z`));
}
