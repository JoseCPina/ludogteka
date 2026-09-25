import type { NegocioBasico } from "./resolver";
import { NEGOCIO_ORIGINAL_ID } from "./legado";

/**
 * Las llaves de Mercado Pago y Google Maps que viven en las variables de
 * entorno (MERCADOPAGO_*, GOOGLE_MAPS_*) son de UN negocio: Ludogteka, que
 * las tenía antes de PeluDesk. Mientras no existan las integraciones por
 * negocio, cualquier otro negocio las tiene APAGADAS — ni la cuenta real
 * de Ludogteka (cobraría a nombre de otro) ni el modo simulación (daría
 * por pagado un cobro que nadie pagó, o una distancia inventada con la
 * que se cotiza un viaje).
 */
export const NEGOCIO_DE_LAS_LLAVES =
  process.env.PELUDESK_NEGOCIO_INTEGRACIONES_ID ?? NEGOCIO_ORIGINAL_ID;

export function usaIntegracionesDelEntorno(negocio: Pick<NegocioBasico, "id">): boolean {
  return negocio.id === NEGOCIO_DE_LAS_LLAVES;
}

export const MENSAJE_INTEGRACION_APAGADA =
  "Esta integración todavía no está activada para tu negocio.";
