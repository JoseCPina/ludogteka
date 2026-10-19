import { pesos, planSucursal, planUnico } from "./plan";

// Tres preguntas que hacen los prospectos antes de contratar (factura, soporte y sucursales), con UNA sola
// redacción para la landing, /precios y la página de cada giro. Los montos salen de la base (planes), nunca del
// código. Lo mismo lo sabe el bot (src/lib/whatsapp/conocimiento.ts) y la ayuda (artículo «modulos-y-plan»).

/** El número de WhatsApp de PeluDesk (bot las 24 horas y, detrás, una persona). */
export const WHATSAPP_SOPORTE = "+52 56 4916 0742";
export const WHATSAPP_SOPORTE_LINK = "https://wa.me/525649160742";

export const RESPUESTA_FACTURA =
  "Sí. Menteo, S.A.S., la empresa que opera PeluDesk, emite la factura (CFDI) de tu suscripción. Capturas tus datos fiscales en Módulos y plan → Datos de facturación (RFC, razón social, régimen, código postal, uso del CFDI y el correo donde la quieres) y la factura te llega por correo en los días siguientes a cada pago.";

export const RESPUESTA_SOPORTE =
  `Todo por WhatsApp, al ${WHATSAPP_SOPORTE}: un asistente contesta las 24 horas y lo que no resuelve lo atiende una persona de PeluDesk el mismo día, en horario hábil. No hay que abrir tickets ni escribir correos.`;

export function respuestaSucursales(plan: { mensual: number } | null, sucursal: { mensual: number } | null): string {
  const precios =
    plan && sucursal
      ? `La primera cuesta ${pesos(plan.mensual)} + IVA al mes y cada sucursal adicional del mismo dueño ${pesos(sucursal.mensual)} + IVA al mes, en la misma suscripción.`
      : "La primera paga el plan y cada sucursal adicional del mismo dueño paga la mitad, en la misma suscripción.";
  return `Cada sucursal es un negocio en PeluDesk, con su propia caja, agenda, personal y página. ${precios} La prueba gratis de 15 días es para la primera; las demás se abren desde Módulos y plan cuando el plan ya está pagado, y quien trabaja en varias pasa de una a otra desde el menú.`;
}

/** Las tres preguntas, con los precios vigentes. */
export async function preguntasDeContratacion(): Promise<[string, string][]> {
  const [plan, sucursal] = await Promise.all([planUnico(), planSucursal()]);
  return [
    ["¿Me dan factura?", RESPUESTA_FACTURA],
    ["¿Cómo es el soporte?", RESPUESTA_SOPORTE],
    ["¿Y si tengo varias sucursales?", respuestaSucursales(plan, sucursal)],
  ];
}
