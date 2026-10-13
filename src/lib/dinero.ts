/**
 * El único formateador de pesos de la app: "$16.00" y, si es negativo, "−$16.00"
 * (signo menos tipográfico, antes del peso; nunca "$-16.00"). Un cero negativo
 * o un redondeo a cero se muestra "$0.00".
 */
export function dinero(valor: number | string | null | undefined): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return "$0.00";
  const centavos = Math.round(Math.abs(n) * 100);
  const texto = `$${(centavos / 100).toFixed(2)}`;
  return n < 0 && centavos > 0 ? `−${texto}` : texto;
}
