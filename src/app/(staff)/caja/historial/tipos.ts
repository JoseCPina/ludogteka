export type MovimientoCaja = {
  id: string;
  tipo: string;
  fecha: string;
  turno_id: string;
  turno_dia: string;
  turno_abierto: boolean;
  reserva_id: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  descripcion: string | null;
  metodo: string | null;
  origen: string | null;
  ajuste_tipo: string | null;
  grupo_id: string | null;
  hecho_por: string | null;
  monto: number | null;
  propina: number | null;
};

export const ETIQUETA_METODO: Record<string, string> = { efectivo: "Efectivo", terminal: "Terminal", transferencia: "Transferencia", tarjeta_manual: "Tarjeta (manual)" };

export const TIPOS_FILTRO = [
  { valor: "cobro", etiqueta: "Cobros y abonos" },
  { valor: "venta_mostrador", etiqueta: "Ventas de mostrador" },
  { valor: "venta_bono", etiqueta: "Pases vendidos" },
  { valor: "devolucion", etiqueta: "Devoluciones" },
  { valor: "anulacion", etiqueta: "Anulaciones y correcciones" },
  { valor: "retiro", etiqueta: "Retiros" },
  { valor: "gasto", etiqueta: "Gastos pagados de caja" },
  { valor: "ingreso_efectivo", etiqueta: "Efectivo agregado" },
];

/** Cómo se dice cada movimiento en la lista (con su color de chip). */
export function etiquetaMovimiento(m: Pick<MovimientoCaja, "tipo" | "ajuste_tipo" | "descripcion">): { etiqueta: string; clase: string } {
  if (m.ajuste_tipo === "anulacion") return { etiqueta: "Anulación", clase: "bg-coral-suave text-coral-oscuro" };
  if (m.ajuste_tipo) return { etiqueta: "Corrección", clase: "bg-ambar-suave text-ambar-oscuro" };
  switch (m.tipo) {
    case "cobro": return { etiqueta: "Cobro", clase: "bg-menta-suave text-menta-oscuro" };
    case "venta_mostrador": return { etiqueta: "Venta", clase: "bg-menta-suave text-menta-oscuro" };
    case "venta_bono": return { etiqueta: "Pase", clase: "bg-menta-suave text-menta-oscuro" };
    case "devolucion": return { etiqueta: "Devolución", clase: "bg-coral-suave text-coral-oscuro" };
    case "ingreso_efectivo": return { etiqueta: "Efectivo agregado", clase: "bg-morado-suave text-morado" };
    case "retiro": return (m.descripcion ?? "").startsWith("Gasto:") ? { etiqueta: "Gasto", clase: "bg-n-100 text-n-800" } : { etiqueta: "Retiro", clase: "bg-n-100 text-n-800" };
    default: return { etiqueta: m.tipo, clase: "bg-n-100 text-n-800" };
  }
}
