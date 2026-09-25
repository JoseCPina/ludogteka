// Textos y fechas de Gastos del local: un solo lugar para cómo se dice
// cada método y cómo se calcula el periodo que cubre un gasto.

export const METODOS_GASTO: Record<string, string> = {
  efectivo_caja: "Efectivo del cajón",
  efectivo: "Efectivo (no del cajón)",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  domiciliado: "Domiciliado",
  retenido: "Lo retuvo el banco o Mercado Pago",
  otro: "Otro",
};

export const CADA_MESES: Record<number, string> = {
  1: "Cada mes",
  2: "Cada dos meses",
  3: "Cada tres meses",
  4: "Cada cuatro meses",
  6: "Cada seis meses",
  12: "Cada año",
};

export const CUBRE: Record<string, string> = {
  mes_del_pago: "Desde el mes en que vence (renta, internet)",
  meses_anteriores: "Los meses anteriores al vencimiento (luz, agua: se paga lo ya usado)",
};

export type GastoFila = {
  id: string;
  tipo: "gasto" | "ajuste";
  ajuste_de: string | null;
  estado: "pendiente" | "pagado" | "cancelado";
  concepto: string;
  categoria_id: string;
  monto: number | null;
  monto_estimado: number | null;
  vencimiento: string | null;
  fecha_pago: string | null;
  metodo: string | null;
  periodo_desde: string;
  periodo_hasta: string;
  comprobante_path: string | null;
  notas: string | null;
  recurrente_id: string | null;
  mp_orden_id: string | null;
  motivo_cancelacion: string | null;
  proveedor_id: string | null;
  categorias_gasto?: { nombre: string } | null;
  proveedores?: { nombre: string } | null;
};

export const COLUMNAS_GASTO =
  "id, tipo, ajuste_de, estado, concepto, categoria_id, monto, monto_estimado, vencimiento, fecha_pago, metodo, periodo_desde, periodo_hasta, comprobante_path, notas, recurrente_id, mp_orden_id, motivo_cancelacion, proveedor_id, categorias_gasto(nombre), proveedores(nombre)";

// "2026-09" → primer y último día del mes.
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export function mesAnterior(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

// El periodo con el que se compara un reporte: el mes anterior si el rango
// es un mes completo; si no, el mismo número de días justo antes.
export function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const mes = desde.slice(0, 7);
  const r = rangoMes(mes);
  if (desde === r.desde && hasta === r.hasta) return rangoMes(mesAnterior(mes));
  const dia = 86_400_000;
  const d = Date.parse(`${desde}T12:00:00Z`);
  const h = Date.parse(`${hasta}T12:00:00Z`);
  const largo = Math.round((h - d) / dia) + 1;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { desde: iso(d - largo * dia), hasta: iso(d - dia) };
}

// Lo que le toca a [desde, hasta] de un gasto que cubre [pd, ph], por días
// (la misma cuenta que gasto_en_rango en la base).
export function montoEnRango(monto: number, pd: string, ph: string, desde: string, hasta: string): number {
  const ini = pd > desde ? pd : desde;
  const fin = ph < hasta ? ph : hasta;
  if (fin < ini) return 0;
  const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
  return Math.round(((monto * dias(ini, fin)) / dias(pd, ph)) * 100) / 100;
}
