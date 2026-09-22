import { formatearFechaCalendario } from "@/lib/formato";

/**
 * Cómo se lee un bono en cualquier pantalla, en un solo lugar.
 *
 * Un day pass es un saldo que se agota: "7 de 10 pases · vence el 12 de
 * octubre". La mensualidad no: es "activa hasta el 22 de octubre · 4 días
 * usados", porque su cantidad_total son los días hábiles de la vigencia,
 * no un tope comercial (ver Fase 17). Y un pase vencido con días sin usar
 * dice cuántos se perdieron — que se vea, no que desaparezca.
 */
export type BonoResumen = {
  servicio_nombre: string;
  cantidad_total: number;
  cantidad_disponible: number;
  fecha_vencimiento: string | null;
  estado: string;
  ilimitado?: boolean | null;
};

export function usadosDeBono(b: Pick<BonoResumen, "cantidad_total" | "cantidad_disponible">): number {
  return Math.max(b.cantidad_total - b.cantidad_disponible, 0);
}

export function describirBono(b: BonoResumen): string {
  const usados = usadosDeBono(b);
  const vence = b.fecha_vencimiento ? formatearFechaCalendario(b.fecha_vencimiento) : null;

  if (b.ilimitado) {
    if (b.estado === "vencido") {
      return `Mensualidad vencida el ${vence} · ${usados} ${usados === 1 ? "día usado" : "días usados"}`;
    }
    return `Mensualidad activa${vence ? ` hasta el ${vence}` : ""} · ${usados} ${usados === 1 ? "día usado" : "días usados"} (ilimitado L–V)`;
  }

  if (b.estado === "vencido") {
    const perdidos = b.cantidad_disponible;
    return `Venció el ${vence} · ${usados} usados · ${perdidos} ${perdidos === 1 ? "pase sin usar se perdió" : "pases sin usar se perdieron"}`;
  }
  if (b.estado === "agotado") {
    return `Se acabaron los ${b.cantidad_total} pases${vence ? ` (vencía el ${vence})` : ""}`;
  }
  return `${b.cantidad_disponible} de ${b.cantidad_total} pases · ${usados} ${usados === 1 ? "usado" : "usados"}${vence ? ` · vence el ${vence}` : ""}`;
}

// Etiqueta del catálogo al vender: qué trae el paquete y cuánto dura.
export function describirPaquete(p: {
  nombre: string;
  cantidad_incluida: number | null;
  vigencia_dias: number | null;
  ilimitado?: boolean | null;
}): string {
  const dura = p.vigencia_dias ? `vence a los ${p.vigencia_dias} días` : "sin vencimiento";
  if (p.ilimitado) return `${p.nombre} — ilimitado L–V, ${dura}`;
  return `${p.nombre} — ${p.cantidad_incluida ?? "?"} pases, ${dura}`;
}

export function diasParaVencer(fechaVencimiento: string | null, hoy: string): number | null {
  if (!fechaVencimiento) return null;
  const a = new Date(fechaVencimiento + "T12:00:00Z").getTime();
  const b = new Date(hoy + "T12:00:00Z").getTime();
  return Math.round((a - b) / 86400000);
}
