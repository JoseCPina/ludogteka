/** Lo pagado de una cuenta del dueño (`mis_abonos`): sale de cuenta_totales_reserva y de los cobros registrados. */
export type AbonosCuenta = {
  total: number;
  pagado: number;
  cubierto: number;
  saldo: number;
  abonos: { fecha: string; monto: number; formas: string[]; por_link: boolean }[];
  devoluciones: { fecha: string; monto: number }[];
};

export const NOMBRE_FORMA: Record<string, string> = { efectivo: "Efectivo", terminal: "Tarjeta", tarjeta_manual: "Tarjeta", transferencia: "Transferencia" };

export function formasDePago(formas: string[], porLink: boolean): string {
  if (porLink) return "Link de pago";
  return [...new Set(formas.map((f) => NOMBRE_FORMA[f] ?? f))].join(" y ") || "—";
}
