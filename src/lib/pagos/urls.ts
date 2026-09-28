/**
 * La dirección del dominio de la plataforma (peludesk.mx): ahí viven el
 * webhook único de Mercado Pago, el regreso de "Conectar Mercado Pago"
 * (OAuth pide UNA redirect_uri registrada) y el webhook de Clip.
 *
 *   PELUDESK_URL_PLATAFORMA   si viene, gana (p. ej. un dominio de pruebas).
 *   en desarrollo             PELUDESK_URL_DESARROLLO con {slug} = "plataforma"
 *                             (http://plataforma.localhost:3001).
 *   si no                     https://peludesk.mx
 */
export function urlPlataforma(): string {
  const propia = process.env.PELUDESK_URL_PLATAFORMA?.trim();
  if (propia) return propia.replace(/\/$/, "");
  const dev = process.env.PELUDESK_URL_DESARROLLO?.trim();
  if (dev) return dev.replace("{slug}", "plataforma").replace(/\/$/, "");
  return `https://${(process.env.PELUDESK_DOMINIO ?? "peludesk.mx").toLowerCase()}`;
}

export function urlRegresoOauthMp(): string {
  return `${urlPlataforma()}/api/mercadopago/oauth`;
}
