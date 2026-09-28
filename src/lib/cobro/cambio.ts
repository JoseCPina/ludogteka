import type { Periodicidad } from "./iva";

/**
 * ¿El cambio de plan sube o baja?
 *
 *   mensual → anual        sube (Stripe cambia el ciclo y cobra hoy, con prorrateo)
 *   anual → mensual        baja (al terminar el año pagado)
 *   mismo ciclo            por el importe: más caro sube, más barato baja
 *
 * Subir es inmediato con prorrateo de Stripe; bajar aplica al siguiente
 * periodo (subscription schedule), y ese día se apagan los módulos que queden
 * fuera con las reglas de siempre (nada se borra).
 */
export function tipoDeCambio(
  actual: { total: number; periodicidad: Periodicidad },
  nueva: { total: number; periodicidad: Periodicidad }
): "subir" | "bajar" | "igual" {
  if (actual.periodicidad !== nueva.periodicidad) return nueva.periodicidad === "anual" ? "subir" : "bajar";
  if (nueva.total > actual.total) return "subir";
  if (nueva.total < actual.total) return "bajar";
  return "igual";
}
