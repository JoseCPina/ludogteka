/**
 * Configuración de Mercado Pago. Todo server-side, sin NEXT_PUBLIC_: el
 * access token cobra dinero y el secreto del webhook es lo que impide
 * que alguien "invente" un pago.
 *
 *   MERCADOPAGO_ACCESS_TOKEN   credencial de producción (APP_USR-…) de la
 *                              aplicación creada en Tus integraciones.
 *   MERCADOPAGO_WEBHOOK_SECRET clave secreta que genera el panel al
 *                              configurar la URL de notificaciones.
 *   MERCADOPAGO_TERMINAL_ID    id de la terminal Point en modo PDV
 *                              (p. ej. NEWLAND_N950__N950NCB801293324);
 *                              se ve en el diagnóstico de /admin.
 *   LUDOGTEKA_URL_PUBLICA      URL pública de la app (https://www.ludogteka.mx):
 *                              con ella se arma la URL del webhook y los
 *                              back_urls de los links de pago.
 *
 * Sin MERCADOPAGO_ACCESS_TOKEN la integración corre en SIMULACIÓN: crea
 * órdenes y links falsos que se "pagan" solos, no pega a la API real y no
 * mueve dinero. Es lo esperado en desarrollo; en producción, si el
 * diagnóstico dice "simulación", falta la variable en Vercel.
 */
export const MP_API = "https://api.mercadopago.com";

export function accessToken(): string | null {
  const v = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  return v ? v : null;
}

export function webhookSecret(): string | null {
  const v = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  return v ? v : null;
}

export function terminalIdConfigurada(): string | null {
  const v = process.env.MERCADOPAGO_TERMINAL_ID?.trim();
  return v ? v : null;
}

export function urlPublica(): string {
  const v = process.env.LUDOGTEKA_URL_PUBLICA?.trim();
  return (v || "https://www.ludogteka.mx").replace(/\/$/, "");
}

export function modoSimulacion(): boolean {
  return accessToken() === null;
}

export function urlWebhook(): string {
  return `${urlPublica()}/api/mercadopago/webhook`;
}

// Cuánto espera la app a que la terminal conteste antes de ofrecer la
// salida manual. La orden en Mercado Pago vence sola (expiration_time)
// un poco después, para que no quede viva en la terminal cuando la app
// ya se rindió.
export const TERMINAL_ESPERA_SEGUNDOS = 120;
export const TERMINAL_EXPIRACION_ORDEN = "PT3M";
export const LINK_VIGENCIA_DIAS = 7;
