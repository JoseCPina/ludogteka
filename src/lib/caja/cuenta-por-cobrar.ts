/**
 * N129 (QA S36): una cuenta ofrece acciones de cobro (registrar cobro, terminal, link de pago, pagar con bono) y de
 * ajuste de precio (corregir precio o monto, aplicar o quitar un descuento) SOLO mientras tiene saldo por cobrar. Con
 * saldo $0 (o a favor) queda «Cuenta pagada» con sus cobros a la vista y, para quien tiene el permiso, «Anular cobro» y
 * «Registrar devolución»: son los caminos válidos para cambiar una cuenta pagada. Si un cobro se anula o se devuelve y
 * el saldo vuelve a ser mayor que 0, las acciones reaparecen. La usan todas las vistas de una cuenta.
 */
export function cuentaPorCobrar(saldo: number | null | undefined): boolean {
  return Number(saldo ?? 0) > 0.005;
}
