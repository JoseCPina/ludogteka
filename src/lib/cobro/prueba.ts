import { fechaLocalDeInstante, formatearFecha, hoyNegocio, instanteDeHoraLocal } from "@/lib/formato";

// Los días de la prueba, contados UNA sola vez: el banner, «Módulos y plan» y Stripe Checkout dicen lo mismo.
// La prueba dura hasta el final del último día EN LA ZONA DEL NEGOCIO (23:59:59): así los días completos que
// ve Stripe desde cualquier hora de hoy son los mismos días de calendario que cuenta el banner.

/** El instante en que termina la prueba: el último segundo del día de `finIso` en la zona del negocio. */
export function finDePrueba(finIso: string, zona: string): Date {
  const dia = fechaLocalDeInstante(finIso, zona);
  return new Date(new Date(instanteDeHoraLocal(`${dia}T23:59`, zona)).getTime() + 59_000);
}

/** Días de calendario (zona del negocio) de hoy al último día de la prueba: 0 = termina hoy. */
export function diasDePrueba(finIso: string, zona: string, hoy: string = hoyNegocio(zona)): number {
  const [a1, m1, d1] = hoy.split("-").map(Number);
  const [a2, m2, d2] = fechaLocalDeInstante(finIso, zona).split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000));
}

/** Lo que se le dice a quien paga: a nombre de quién sale el cobro. */
export const AVISO_COBRO_MENTEO = "El cobro aparece como MENTEO, la empresa que opera PeluDesk.";

/** El texto junto al botón final de Stripe Checkout. */
export function textoCheckout(trialEnd: Date | null, zona: string): string {
  const base = trialEnd
    ? `Contratas PeluDesk. No se te cobra hoy; el primer cobro es el ${formatearFecha(trialEnd.toISOString(), zona)}.`
    : "Contratas PeluDesk. Se cobra hoy.";
  return `${base} Precios con IVA incluido. ${AVISO_COBRO_MENTEO}`;
}
