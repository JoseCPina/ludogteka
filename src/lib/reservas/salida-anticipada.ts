import { dinero } from "@/lib/dinero";
// N132 (QA S36): lo que el check-out dice de la cuenta cuando el perro sale antes de su salida prevista, con lo que
// devuelve `salida_anticipada_cotizar` (la misma cuenta que aplica `salida_anticipada_aplicar` al confirmar).

export type CotizacionSalida = {
  aplica: boolean;
  unidad?: "noche" | "dia";
  reservadas?: number;
  usadas?: number;
  no_usadas?: number;
  total_antes?: number;
  total_despues?: number;
  politica?: "ajustar" | "completa";
  motivo_no?: "pase" | "correccion" | "ajustada";
};

const pesos = (n: number) => dinero(n);
const unidades = (n: number, unidad: "noche" | "dia") => `${n} ${unidad === "noche" ? (n === 1 ? "noche" : "noches") : n === 1 ? "día" : "días"}`;

/**
 * «Sale 1 noche antes: la cuenta baja de $450 a $270» (política por omisión), «Se cobra la estancia completa ($450) por
 * la política del negocio», o null si sale en su fecha.
 */
export function textoSalidaAnticipada(c: CotizacionSalida | null | undefined, { salio = false }: { salio?: boolean } = {}): string | null {
  if (!c || !c.no_usadas || c.no_usadas <= 0 || !c.unidad) return null;
  const antes = `${salio ? "Salió" : "Sale"} ${unidades(c.no_usadas, c.unidad)} antes`;
  // Ya salió: solo lo que quedó en la cuenta (una salida registrada antes de esta regla no tiene ajuste y no se inventa).
  if (salio) {
    if (c.motivo_no === "ajustada") return `${antes}: la cuenta se ajustó a lo que usó (motivo «Salida anticipada»)`;
    if (c.politica === "completa") return `${antes}: se cobra la estancia completa por la política del negocio`;
    return null;
  }
  if (c.politica === "completa") return `Se cobra la estancia completa (${pesos(c.total_antes ?? 0)}) por la política del negocio`;
  if (c.aplica) return `${antes}: la cuenta baja de ${pesos(c.total_antes ?? 0)} a ${pesos(c.total_despues ?? 0)}`;
  if (c.motivo_no === "pase") return `${antes}: está cubierta con pase, la cuenta no cambia`;
  if (c.motivo_no === "correccion") return `${antes}: la línea ya tiene una corrección de precio, la cuenta no cambia (ajústala desde la cuenta)`;
  if (c.motivo_no === "ajustada") return `${antes}: la cuenta ya está ajustada a lo que usó`;
  return null;
}

/**
 * QA S62 (N162): cómo queda la cuenta al confirmar la salida: el total nuevo (si la salida anticipada lo baja, con la
 * misma cotización que aplicará la base), lo cobrado (neto de devoluciones) y el saldo resultante. Negativo = saldo a
 * favor del cliente. Null si no hay cuenta.
 */
export function cuentaAlSalir(
  cuenta: { total: number; pagado: number; saldo: number } | null | undefined,
  c: CotizacionSalida | null | undefined
): { total: number; pagado: number; saldo: number; cambiaTotal: boolean; tipo: "por_cobrar" | "pagada" | "a_favor" } | null {
  if (!cuenta) return null;
  const cambia = Boolean(c?.aplica && c.politica !== "completa" && c.total_antes != null && c.total_despues != null && Math.abs(c.total_antes - c.total_despues) > 0.005);
  const baja = cambia ? Number(c!.total_antes) - Number(c!.total_despues) : 0;
  const total = Math.round((cuenta.total - baja) * 100) / 100;
  const saldo = Math.round((cuenta.saldo - baja) * 100) / 100;
  const pagado = Math.round(cuenta.pagado * 100) / 100;
  return { total, pagado, saldo, cambiaTotal: cambia, tipo: saldo > 0.005 ? "por_cobrar" : saldo < -0.005 ? "a_favor" : "pagada" };
}
