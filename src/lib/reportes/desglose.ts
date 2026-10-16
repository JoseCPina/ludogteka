// Desglose de una cifra de /reportes: la lista de operaciones que la forman. La base (reporte_desglose) aplica los
// mismos criterios que la cifra, así que el total del pie cuadra exacto con la tarjeta.

export type FilaDesglose = {
  id: string;
  fecha: string;
  cliente: string;
  mascota: string;
  concepto: string;
  usuario: string;
  metodo: string;
  monto: number;
  descuento: number;
  detalle: string;
  href: string | null;
};

export type Desglose = {
  tarjeta: string;
  titulo: string;
  tipo_total: "dinero" | "cantidad";
  signo: number;
  total: number;
  total_filas_tarjeta: number;
  total_filtrado: number;
  total_filas: number;
  filas: FilaDesglose[];
};

export const COLUMNAS_DESGLOSE = ["fecha", "cliente", "mascota", "concepto", "usuario", "metodo", "monto", "descuento"] as const;
export type ColumnaDesglose = (typeof COLUMNAS_DESGLOSE)[number];

export const POR_PAGINA_DESGLOSE = 25;

const TARJETA_VALIDA = /^[a-z_]+(:[a-z0-9_-]+)?$/;
export function tarjetaValida(t: string | undefined): t is string {
  return !!t && TARJETA_VALIDA.test(t);
}

/** Dirección del desglose de una tarjeta, en el mismo periodo. */
export function urlDesglose(tarjeta: string, desde: string, hasta: string): string {
  return `/reportes/desglose?t=${encodeURIComponent(tarjeta)}&desde=${desde}&hasta=${hasta}`;
}

export const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  terminal: "Terminal",
  transferencia: "Transferencia",
  tarjeta_manual: "Tarjeta manual",
};

/** «efectivo, terminal» → «Efectivo, Terminal». */
export function etiquetaMetodos(texto: string): string {
  return texto
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m) => ETIQUETA_METODO[m] ?? m)
    .join(", ");
}
