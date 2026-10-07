import { formatearFechaCalendario } from "@/lib/formato";

/**
 * Ajustar a mano los días usados de un pase (migración 20261011000000).
 * Un solo lugar para los motivos, la vista previa «antes → después» y el
 * texto de cada renglón del historial.
 */
export const MOTIVOS_AJUSTE = [
  { clave: "checkin_por_error", etiqueta: "Check-in marcado por error" },
  { clave: "dia_no_registrado", etiqueta: "Día no registrado" },
  { clave: "uso_previo", etiqueta: "Uso previo a PeluDesk" },
  { clave: "otro", etiqueta: "Otro (escribe el motivo)" },
] as const;

export type ClaveMotivoAjuste = (typeof MOTIVOS_AJUSTE)[number]["clave"];

export function etiquetaMotivo(clave: string, texto?: string | null): string {
  const base = MOTIVOS_AJUSTE.find((m) => m.clave === clave)?.etiqueta.replace(" (escribe el motivo)", "") ?? clave;
  return clave === "otro" && texto ? `Otro: ${texto}` : base;
}

export type PaseAjustable = {
  id: string;
  servicio_nombre: string;
  perro_nombre?: string | null;
  cantidad_total: number;
  cantidad_disponible: number;
  fecha_vencimiento: string | null;
  estado: string;
  ilimitado?: boolean | null;
};

export type VistaPrevia = {
  usadosAntes: number;
  usadosDespues: number;
  restantesAntes: number;
  restantesDespues: number;
  vencimientoAntes: string | null;
  vencimientoDespues: string | null;
  cambio: number;
  /** Se acabó y el ajuste le devuelve días. */
  reabre: boolean;
  /** Quedan días pero la vigencia ya pasó: no se podrán usar. */
  sigueVencido: boolean;
  /** Error de rango, si el total pedido no es válido. */
  error: string | null;
};

export function calcularVistaPrevia(
  p: Pick<PaseAjustable, "cantidad_total" | "cantidad_disponible" | "fecha_vencimiento" | "estado">,
  usadosNuevos: number | null,
  nuevaVigencia: string | null,
  hoy: string
): VistaPrevia {
  const usadosAntes = Math.max(p.cantidad_total - p.cantidad_disponible, 0);
  const venceDespues = nuevaVigencia || p.fecha_vencimiento;
  const base = {
    usadosAntes,
    restantesAntes: p.cantidad_disponible,
    vencimientoAntes: p.fecha_vencimiento,
    vencimientoDespues: venceDespues,
  };
  if (usadosNuevos === null || !Number.isInteger(usadosNuevos)) {
    return { ...base, usadosDespues: usadosAntes, restantesDespues: p.cantidad_disponible, cambio: 0, reabre: false, sigueVencido: false, error: "Escribe cuántos días usados debe llevar." };
  }
  let error: string | null = null;
  if (usadosNuevos < 0) error = "Los días usados no pueden ser menos de 0.";
  else if (usadosNuevos > p.cantidad_total) error = `Este pase es de ${p.cantidad_total} días: no puede llevar ${usadosNuevos} usados.`;
  const restantesDespues = p.cantidad_total - usadosNuevos;
  return {
    ...base,
    usadosDespues: usadosNuevos,
    restantesDespues,
    cambio: usadosNuevos - usadosAntes,
    reabre: p.estado === "agotado" && restantesDespues > 0 && !error,
    sigueVencido: restantesDespues > 0 && venceDespues !== null && venceDespues < hoy && !error,
    error,
  };
}

export type RenglonHistorialPase = {
  id: string;
  cuando: string;
  origen: "alta" | "ajuste" | "deshacer_checkin" | "vigencia";
  motivo: string;
  motivo_texto: string | null;
  usados_antes: number;
  usados_despues: number;
  total: number;
  disponibles_antes: number;
  disponibles_despues: number;
  vencimiento_antes: string | null;
  vencimiento_despues: string | null;
  fechas: string[];
  estancia_id: string | null;
  por_nombre: string;
};

const ETIQUETA_ORIGEN: Record<RenglonHistorialPase["origen"], string> = {
  alta: "Se registró con días ya usados",
  ajuste: "Ajuste de días usados",
  deshacer_checkin: "Check-in deshecho",
  vigencia: "Cambio de vigencia",
};

export function describirRenglon(r: RenglonHistorialPase): { titulo: string; detalle: string } {
  const partes: string[] = [];
  if (r.usados_antes !== r.usados_despues) {
    partes.push(`Días usados: ${r.usados_antes} → ${r.usados_despues} de ${r.total}`);
  }
  if (r.vencimiento_antes !== r.vencimiento_despues) {
    const f = (v: string | null) => (v ? formatearFechaCalendario(v) : "sin vencimiento");
    partes.push(`Vigencia: ${f(r.vencimiento_antes)} → ${f(r.vencimiento_despues)}`);
  }
  if (r.fechas.length > 0) partes.push(`Fechas: ${r.fechas.map((f) => formatearFechaCalendario(f)).join(", ")}`);
  partes.push(`Motivo: ${etiquetaMotivo(r.motivo, r.motivo_texto)}`);
  return { titulo: ETIQUETA_ORIGEN[r.origen] ?? r.origen, detalle: partes.join(" · ") };
}
