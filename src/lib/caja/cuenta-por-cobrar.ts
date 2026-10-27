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

/**
 * La misma regla para AGREGARLE algo a la cuenta de una estancia (Aplicar cargo, servicios extra): una estancia
 * finalizada solo lo admite mientras su cuenta tenga saldo por cobrar o no se le haya cobrado nada. Con la cuenta pagada
 * (saldo $0 o a favor) ya no; si se anula o se devuelve un cobro y vuelve a haber saldo, se admite otra vez. Una estancia
 * que no ha salido siempre lo admite (el perro sigue en el negocio). La usan la pantalla y las acciones del servidor.
 */
export function admiteCargosNuevos(estado: string | null | undefined, cuenta: { saldo: number | null | undefined; cobrado: number | null | undefined }): boolean {
  if (estado !== "finalizada") return true;
  return cuentaPorCobrar(cuenta.saldo) || Number(cuenta.cobrado ?? 0) <= 0.005;
}

export const TEXTO_CUENTA_PAGADA_SIN_CARGOS =
  "La cuenta ya está pagada: no se le agregan cargos. Para cambiarla, anula el cobro o registra una devolución desde «Ver cobros».";
