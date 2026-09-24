import { formatearFechaCalendario } from "@/lib/formato";

/**
 * Cómo se lee un bono en cualquier pantalla, en un solo lugar.
 *
 * Un day pass es un saldo que se agota: "7 de 10 pases · vence el 12 de
 * octubre". La mensualidad no: es "activa hasta el 22 de octubre · 4 días
 * usados", porque su cantidad_total son los días que abre guardería en la vigencia,
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
    return `Mensualidad activa${vence ? ` hasta el ${vence}` : ""} · ${usados} ${usados === 1 ? "día usado" : "días usados"} (ilimitada)`;
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
  if (p.ilimitado) return `${p.nombre} — días ilimitados, ${dura}`;
  return `${p.nombre} — ${p.cantidad_incluida ?? "?"} pases, ${dura}`;
}

// Qué pasó con el pase al crear una estancia (reserva suelta o serie):
// lo que devuelve aplicar_bono_a_estancia, en una frase.
export type BonoAplicadoResumen = {
  aplicado: boolean;
  motivo?: string;
  nombre?: string;
  ilimitado?: boolean;
  usados?: number;
  total?: number;
  restantes?: number;
  vence?: string | null;
};

export function describirBonoAplicado(b: BonoAplicadoResumen | null | undefined): string | null {
  if (!b) return null;
  if (b.aplicado) {
    const vence = b.vence ? formatearFechaCalendario(b.vence) : null;
    if (b.ilimitado) return `Cubierto con ${b.nombre}: activa${vence ? ` hasta el ${vence}` : ""}.`;
    return `Usó ${b.usados} ${b.usados === 1 ? "pase" : "pases"} de ${b.nombre}: le quedan ${b.restantes} de ${b.total}${vence ? ` · vence el ${vence}` : ""}.`;
  }
  if (b.motivo === "sin_bono") return "Sin pases vigentes para esa fecha: paga el día suelto.";
  if (b.motivo === "elegido_suelto") return "Se cobra el día suelto, como se escogió: no se descontó ningún pase.";
  if (b.motivo === "error") return "No se pudo aplicar el pase: paga el día suelto (se puede aplicar desde el check-in).";
  return null;
}

// Qué pasó con el pase al cancelar: lo que devuelve devolver_bono_de_item.
export type DevolucionResumen = {
  devueltos: number;
  perdidos: number;
  detalle: { bono: string; pases: number; devuelto: boolean; vencio?: string | null; restantes?: number }[];
};

export function describirDevolucion(d: DevolucionResumen | null | undefined): string | null {
  if (!d || (d.devueltos === 0 && d.perdidos === 0)) return null;
  const partes: string[] = [];
  for (const x of d.detalle) {
    if (x.devuelto) {
      partes.push(
        `Se ${x.pases === 1 ? "devolvió 1 pase" : `devolvieron ${x.pases} pases`} a ${x.bono}${x.restantes != null ? ` (quedan ${x.restantes})` : ""}`
      );
    } else {
      partes.push(
        `${x.pases === 1 ? "1 pase" : `${x.pases} pases`} de ${x.bono} no se ${x.pases === 1 ? "devolvió" : "devolvieron"}: el bono venció${x.vencio ? ` el ${formatearFechaCalendario(x.vencio)}` : ""}`
      );
    }
  }
  return partes.join(". ") + ".";
}

export function diasParaVencer(fechaVencimiento: string | null, hoy: string): number | null {
  if (!fechaVencimiento) return null;
  const a = new Date(fechaVencimiento + "T12:00:00Z").getTime();
  const b = new Date(hoy + "T12:00:00Z").getTime();
  return Math.round((a - b) / 86400000);
}
