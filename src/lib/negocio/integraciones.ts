import { NEGOCIO_ORIGINAL_ID } from "./legado";

/**
 * Las llaves de Mercado Pago del entorno (MERCADOPAGO_ACCESS_TOKEN,
 * _WEBHOOK_SECRET, _TERMINAL_ID) son de UN negocio: Ludogteka, que cobraba
 * con ellas antes de PeluDesk. Desde las integraciones por negocio (28 de
 * septiembre de 2026) cada negocio conecta SU cuenta (src/lib/pagos) y estas
 * llaves solo siguen como la conexión de Ludogteka mientras no se
 * reconecte por OAuth. Ningún otro negocio las usa, ni en simulación.
 *
 * Google Maps ya no es de un negocio: la llave es de PeluDesk, para todos,
 * con tope por negocio al mes (src/lib/google-maps/cuota.ts).
 */
export const NEGOCIO_DE_LAS_LLAVES =
  process.env.PELUDESK_NEGOCIO_INTEGRACIONES_ID ?? NEGOCIO_ORIGINAL_ID;
