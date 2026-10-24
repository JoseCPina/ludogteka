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

/** Stripe pide que el fin de la prueba esté a 48 h o más de que se crea la suscripción. */
export const HORAS_MIN_PRUEBA = 49;

/**
 * El `trial_end` que recibe Stripe al contratar durante la prueba: el final del último día de la prueba (o, si quedan
 * menos de 49 h, ahora + 49 h). null si la prueba ya terminó. Lo usan `contratar` y el texto previo de «Módulos y plan».
 */
export function trialEndAlContratar(pruebaTerminaIso: string | null, zona: string, ahora = Date.now()): Date | null {
  if (!pruebaTerminaIso) return null;
  const fin = finDePrueba(pruebaTerminaIso, zona);
  if (fin.getTime() <= ahora) return null;
  return new Date(Math.ceil(Math.max(fin.getTime(), ahora + HORAS_MIN_PRUEBA * 3600_000) / 1000) * 1000);
}

/**
 * N123: el instante del primer cobro. Stripe cobra cuando termina la prueba (`trial_end` de la suscripción). La prueba
 * termina en el último segundo de su último día en la zona del negocio (23:59:59, `finDePrueba`), así que el cobro cae
 * en el día SIGUIENTE: prueba hasta el 3 nov, primer cobro el 4 nov (lo mismo que dice Stripe, «a partir del 4 de
 * noviembre»). Con un `trial_end` a media tarde (prueba que se acaba en horas) es ese mismo día.
 * Se muestra con formatearFecha(…, zona) en el banner, «Módulos y plan» y el texto del Checkout.
 */
export function primerCobro(trialEnd: string | Date): string {
  return new Date(new Date(trialEnd).getTime() + 1000).toISOString();
}

/** Lo que se le dice a quien paga: a nombre de quién sale el cobro. */
export const AVISO_COBRO_MENTEO = "El cobro aparece como MENTEO, la empresa que opera PeluDesk.";

/** El texto junto al botón final de Stripe Checkout. */
export function textoCheckout(trialEnd: Date | null, zona: string): string {
  const base = trialEnd
    ? `Contratas PeluDesk. No se te cobra hoy; el primer cobro es el ${formatearFecha(primerCobro(trialEnd), zona)}.`
    : "Contratas PeluDesk. Se cobra hoy.";
  return `${base} Precios con IVA incluido. ${AVISO_COBRO_MENTEO}`;
}

/**
 * Los parámetros FIJOS de todo Checkout de PeluDesk (QA N25, 18 de octubre de 2026): mismo idioma, mismo método
 * (solo tarjeta: sin Link ni billeteras, que cambian el botón y la línea de autorización según el navegador o si
 * la persona ya tiene Link) y la misma forma de pedir datos para TODOS los negocios. Lo único que cambia entre
 * un negocio y otro es la fecha del primer cobro y si hay prueba (sin prueba Stripe dice «Suscribirse»).
 */
export const CHECKOUT_FIJO = {
  // Español de Latinoamérica (QA S27): con «es» Checkout salía en español de España y con el país en «Estados Unidos».
  locale: "es-419",
  payment_method_types: ["card"],
  // QA S27: aun con solo tarjeta, Checkout ofrecía «Guardar mis datos con Link» ya marcada.
  wallet_options: { link: { display: "never" } },
  payment_method_collection: "always",
  billing_address_collection: "auto",
  // Siempre en pesos: la cuenta (de Menteo) tiene la conversión de moneda automática.
  adaptive_pricing: { enabled: false },
} as const;
