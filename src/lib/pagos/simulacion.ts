import type { EstadoRemoto } from "./tipos";

/**
 * La terminal simulada (demo, negocios en prueba y desarrollo): el cobro
 * "se paga" solo a los 8 segundos. Los centavos del monto eligen el caso:
 *   .13 → el cliente cancela en la terminal a los 4 segundos
 *   .77 → la terminal nunca contesta (para probar el tope y la salida manual)
 *   cualquier otro → pagado, a 1 plazo salvo que se hayan pedido meses
 * Sirve igual para Mercado Pago y para Clip: nada de aquí mueve dinero, y
 * la base se niega a dar por pagado un cobro simulado de un negocio real.
 */
export function simularTerminal(args: { creadaEn: string; monto: number; plazos: number | null; idRemoto: string }): EstadoRemoto {
  const segundos = (Date.now() - new Date(args.creadaEn).getTime()) / 1000;
  const centavos = Math.round((args.monto * 100) % 100);
  const espera: EstadoRemoto = { estado: "en_terminal", pago: null, detalle: null, crudo: { simulado: true, status: "at_terminal" } };
  if (centavos === 77) return espera;
  if (centavos === 13) {
    return segundos >= 4
      ? { estado: "cancelada", pago: null, detalle: "El pago se canceló en la terminal.", crudo: { simulado: true, status: "canceled" } }
      : espera;
  }
  if (segundos < 8) return espera;
  return {
    estado: "pagada",
    pago: {
      paymentId: `SIM-PAY-${args.idRemoto.slice(-8)}`,
      monto: args.monto,
      installments: args.plazos && args.plazos > 1 ? args.plazos : 1,
      tipo: "credit_card",
    },
    detalle: null,
    crudo: { simulado: true, status: "processed" },
  };
}
