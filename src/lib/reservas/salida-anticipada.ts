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

const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
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
