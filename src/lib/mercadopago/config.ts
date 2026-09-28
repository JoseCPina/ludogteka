/**
 * Configuración de Mercado Pago. Todo server-side, sin NEXT_PUBLIC_.
 *
 * LA APLICACIÓN DE PELUDESK (una sola, para todos los negocios; cada
 * negocio conecta SU cuenta por OAuth y sus tokens van cifrados en Vault):
 *   MERCADOPAGO_APP_ID              client_id de la aplicación en Tus integraciones.
 *   MERCADOPAGO_APP_SECRET          client_secret de esa aplicación.
 *   MERCADOPAGO_APP_WEBHOOK_SECRET  clave secreta de sus webhooks (firma).
 * Sin MERCADOPAGO_APP_ID/SECRET, "Conectar Mercado Pago" corre contra una
 * autorización SIMULADA fuera de producción, y en producción no se ofrece.
 *
 * LLAVE DEL ENTORNO (legado de Ludogteka, de antes de PeluDesk): sigue
 * cobrando como la conexión de ESE negocio mientras no se reconecte por
 * OAuth (src/lib/pagos/conexion.ts). Ningún otro negocio la usa.
 *   MERCADOPAGO_ACCESS_TOKEN   access token de producción de la cuenta de Ludogteka.
 *   MERCADOPAGO_WEBHOOK_SECRET clave secreta de los webhooks de esa aplicación.
 *   MERCADOPAGO_TERMINAL_ID    id de su terminal Point en modo PDV.
 *   LUDOGTEKA_URL_PUBLICA      URL pública de Ludogteka (webhook de esa aplicación).
 */
// Fuera de producción, MERCADOPAGO_API_URL / MERCADOPAGO_AUTH_URL apuntan a
// un Mercado Pago de mentiras (scripts/auditoria/integraciones-dev.mjs):
// así se prueba el camino REAL (OAuth, terminal, links, webhook, comisión,
// renovación) sin red hacia Mercado Pago. En producción se ignoran.
const sustituto = (nombre: string) => (process.env.VERCEL_ENV !== "production" ? process.env[nombre]?.trim() || null : null);
export const MP_API = sustituto("MERCADOPAGO_API_URL") ?? "https://api.mercadopago.com";
// México: la autorización de OAuth va por el dominio del país.
export const MP_AUTH = sustituto("MERCADOPAGO_AUTH_URL") ?? "https://auth.mercadopago.com.mx/authorization";

const leer = (nombre: string): string | null => {
  const v = process.env[nombre]?.trim();
  return v ? v : null;
};

// ── Aplicación de PeluDesk (OAuth) ──
export const appId = () => leer("MERCADOPAGO_APP_ID");
export const appSecret = () => leer("MERCADOPAGO_APP_SECRET");
export const appWebhookSecret = () => leer("MERCADOPAGO_APP_WEBHOOK_SECRET");
export const hayAplicacion = () => Boolean(appId() && appSecret());

// ── Llave del entorno (Ludogteka, legado) ──
export const accessTokenLegado = () => leer("MERCADOPAGO_ACCESS_TOKEN");
export const webhookSecretLegado = () => leer("MERCADOPAGO_WEBHOOK_SECRET");
export const terminalLegado = () => leer("MERCADOPAGO_TERMINAL_ID");

export function urlPublicaLegado(): string {
  return (leer("LUDOGTEKA_URL_PUBLICA") || "https://www.ludogteka.mx").replace(/\/$/, "");
}

export function esProduccion(): boolean {
  return process.env.VERCEL_ENV === "production";
}

// Cuánto espera la app a que la terminal conteste antes de ofrecer la
// salida manual. La orden en Mercado Pago vence sola (expiration_time)
// un poco después, para que no quede viva en la terminal cuando la app
// ya se rindió.
export const TERMINAL_ESPERA_SEGUNDOS = 120;
export const TERMINAL_EXPIRACION_ORDEN = "PT3M";
export const LINK_VIGENCIA_DIAS = 7;
// Se renueva el token de OAuth cuando le quedan menos de 30 días (vive 180).
export const RENOVAR_ANTES_DIAS = 30;
