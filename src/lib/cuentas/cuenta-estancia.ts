import type { SupabaseClient } from "@supabase/supabase-js";

// QA R50 (N136): lo que cuesta una estancia sale de la base, nunca de «precio × noches» en la pantalla. Las líneas son
// las de cuenta_lineas_reserva (de donde salen el total del encabezado, Caja y el calendario) con la estancia a la que
// pertenece cada una (cuenta_lineas_estancia): su línea, sus cargos y extras, sus citas de estética y las correcciones
// de precio, como «Salida anticipada». El total de la estancia es la suma de sus líneas.

export type LineaEstancia = {
  tipo: string;
  origenId: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
  motivo: string | null;
  concepto: string | null;
  unidad: string | null;
  reservadas: number | null;
  usadas: number | null;
};

export type CuentaEstancia = {
  lineas: LineaEstancia[];
  total: number;
  /** La línea de la estancia misma (no está si se canceló o no llegó: no se cobra). */
  base: LineaEstancia | null;
};

type Fila = {
  estancia_id: string | null;
  tipo: string;
  origen_id: string;
  descripcion: string;
  cantidad: number | string;
  precio_unitario: number | string;
  total: number | string;
  motivo: string | null;
  concepto: string | null;
  unidad: string | null;
  reservadas: number | null;
  usadas: number | null;
};

export function agruparPorEstancia(filas: Fila[]): Map<string, CuentaEstancia> {
  const mapa = new Map<string, CuentaEstancia>();
  for (const f of filas) {
    if (!f.estancia_id) continue;
    const linea: LineaEstancia = {
      tipo: f.tipo,
      origenId: f.origen_id,
      descripcion: f.descripcion,
      cantidad: Number(f.cantidad),
      precioUnitario: Number(f.precio_unitario),
      total: Number(f.total),
      motivo: f.motivo,
      concepto: f.concepto,
      unidad: f.unidad,
      reservadas: f.reservadas,
      usadas: f.usadas,
    };
    const c = mapa.get(f.estancia_id) ?? { lineas: [], total: 0, base: null };
    c.lineas.push(linea);
    c.total = Math.round((c.total + linea.total) * 100) / 100;
    if (linea.tipo === "estancia") c.base = linea;
    mapa.set(f.estancia_id, c);
  }
  // La estancia primero, después sus cargos y al final las correcciones.
  const orden = (t: string) => (t === "estancia" ? 0 : t === "ajuste" ? 2 : 1);
  for (const c of mapa.values()) c.lineas.sort((a, b) => orden(a.tipo) - orden(b.tipo));
  return mapa;
}

/** La cuenta de cada estancia de una reserva, leída de la base. */
export async function cuentasPorEstancia(supabase: SupabaseClient, reservaId: string): Promise<{ cuentas: Map<string, CuentaEstancia>; error: string | null }> {
  const { data, error } = await supabase.rpc("cuenta_lineas_estancia", { p_reserva_id: reservaId });
  if (error) {
    console.error("cuenta_lineas_estancia", reservaId, error);
    return { cuentas: new Map(), error: "No pudimos leer la cuenta de esta estancia." };
  }
  return { cuentas: agruparPorEstancia((data ?? []) as Fila[]), error: null };
}

const dinero = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const UNIDADES: Record<string, [string, string]> = { noche: ["noche", "noches"], dia: ["día", "días"], hora: ["hora", "horas"] };
const conUnidad = (n: number, unidad: string | null) => {
  const [uno, varios] = UNIDADES[unidad ?? ""] ?? ["vez", "veces"];
  return `${n} ${n === 1 ? uno : varios}`;
};
const esSalidaAnticipada = (l: LineaEstancia) => l.tipo === "ajuste" && l.motivo === "Salida anticipada";

/** ¿Salió antes de lo reservado? (usó menos noches o días de los que reservó). */
export function salioAntes(c: CuentaEstancia): boolean {
  const b = c.base;
  return Boolean(b && b.usadas != null && b.reservadas != null && b.usadas < b.reservadas);
}

/**
 * El precio de la estancia como se cobra: «1 noche × $450.00» con las noches que de verdad usó (si salió antes, el precio
 * por noche es el de la línea ya ajustada), o «2 noches × $450.00».
 */
export function textoPrecioEstancia(c: CuentaEstancia): string | null {
  const b = c.base;
  if (!b) return null;
  if (salioAntes(c)) {
    const ajustado = b.total + c.lineas.filter(esSalidaAnticipada).reduce((s, l) => s + l.total, 0);
    const usadas = b.usadas as number;
    return `${conUnidad(usadas, b.unidad)} × ${dinero(Math.round((ajustado / usadas) * 100) / 100)} (salió antes; tenía ${conUnidad(b.reservadas as number, b.unidad)} reservadas)`;
  }
  return `${conUnidad(b.cantidad, b.unidad)} × ${dinero(b.precioUnitario)}`;
}

/** Cada línea de la estancia tal como la cuenta la base: qué es, el detalle (motivo) y cuánto suma. */
export function textoLinea(l: LineaEstancia, reducida: boolean): { etiqueta: string; detalle: string | null; monto: string } {
  if (l.tipo === "estancia") {
    return { etiqueta: `${l.descripcion}: ${conUnidad(l.cantidad, l.unidad)}${reducida ? " reservadas" : ""} × ${dinero(l.precioUnitario)}`, detalle: null, monto: dinero(l.total) };
  }
  if (l.tipo === "ajuste") {
    const queSeAjusto = l.concepto?.includes(" — ") ? l.concepto.slice(l.concepto.lastIndexOf(" — ") + 3) : null;
    if (esSalidaAnticipada(l)) {
      return { etiqueta: "Ajuste por salida anticipada", detalle: `Motivo: salida anticipada${queSeAjusto ? ` (${queSeAjusto})` : ""}`, monto: dinero(l.total) };
    }
    return { etiqueta: "Corrección de precio", detalle: l.motivo ? `Motivo: ${l.motivo}` : null, monto: dinero(l.total) };
  }
  return { etiqueta: l.descripcion, detalle: null, monto: dinero(l.total) };
}

export const pesosCuenta = dinero;
