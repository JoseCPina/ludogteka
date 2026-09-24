import { fechaLocalDeInstante } from "@/lib/formato";

// Cuánto lleva algo esperando (o vencido), contado en días de calendario
// del negocio. Lo usan el tablero del día y las listas a las que manda:
// el mismo número en el aviso y en la fila, y el mismo umbral para
// resaltar lo que ya lleva demasiado.

// Más de una semana esperando se resalta.
export const DIAS_MUY_VIEJO = 7;

// `desde` puede ser un instante (timestamptz) o una fecha de calendario
// ("2026-09-20"); el instante se pasa a la fecha local de San Luis Potosí
// antes de contar, para no correrse un día por el huso del servidor.
export function diasDesde(desde: string, hoy: string): number {
  const fecha = desde.length > 10 ? fechaLocalDeInstante(desde) : desde;
  const [a1, m1, d1] = fecha.split("-").map(Number);
  const [a2, m2, d2] = hoy.slice(0, 10).split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000));
}

// "hoy", "ayer", "hace 3 días", "hace 2 semanas", "hace 3 meses".
export function haceCuanto(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 14) return `hace ${dias} días`;
  if (dias < 60) return `hace ${Math.floor(dias / 7)} semanas`;
  return `hace ${Math.floor(dias / 30)} meses`;
}

// "desde hoy", "desde ayer", "desde hace 3 días".
export function desdeCuando(dias: number): string {
  return `desde ${haceCuanto(dias)}`;
}

export function esMuyViejo(dias: number): boolean {
  return dias > DIAS_MUY_VIEJO;
}
