/**
 * Las cuentas con las que el corredor de videos tutoriales (scripts/tutoriales) graba la teleconsulta en el
 * negocio de demostración. El demo SIMULA la sala de video (no sale a ninguna red), salvo cuando quien la
 * crea es una de estas cuentas: así los videos 91 y 92 enseñan una sala real de Daily.
 *
 * El visitante de «Ver demo» nunca entra con ellas: `/demo/entrar/<rol>` solo abre las cuentas de
 * `CUENTAS_DEMO` (src/lib/demo/cuentas.ts), y estas no están ahí; además su contraseña solo la tiene el corredor.
 * Las salas que crean se borran al terminar la grabación (scripts/tutoriales/lib/daily.mjs).
 */
export const CUENTAS_CORREDOR: readonly string[] = ["demo.mvz@peludesk.mx", "demo.mvz2@peludesk.mx"];

export function esCuentaDelCorredor(correo: string | null | undefined): boolean {
  return Boolean(correo) && CUENTAS_CORREDOR.includes(String(correo).trim().toLowerCase());
}
