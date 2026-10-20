// Las respuestas fijas de PeluDesk a lo que los prospectos y los admins preguntan antes y después de contratar
// (QA S16, 19 de octubre de 2026): factura, soporte, sucursales, costo de los recordatorios, cancelación, migración
// desde Excel, plan anual, a nombre de quién sale el cobro, SMS y terminal. UNA sola redacción: la usan el bot de WhatsApp (sin
// escalar), la landing, /precios y la ayuda. Los montos llegan de la base (planes), nunca escritos aquí.
// Sin imports de valores: lo usa también el agente, que es puro.

/** El número de WhatsApp de PeluDesk (bot las 24 horas y, detrás, una persona). */
export const WHATSAPP_SOPORTE = "+52 56 4916 0742";
export const WHATSAPP_SOPORTE_LINK = "https://wa.me/525649160742";

/** A nombre de quién aparece el cobro de la suscripción (el mismo texto que el Checkout, src/lib/cobro/prueba.ts). */
export const COBRO_A_NOMBRE_DE = "El cobro aparece en tu tarjeta a nombre de MENTEO, la empresa que opera PeluDesk.";

const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;

export type PreciosFijos = { mensual: number | null; anual: number | null; sucursal: number | null };

export const RESPUESTA_FACTURA =
  "Sí. Menteo, S.A.S., la empresa que opera PeluDesk, emite la factura (CFDI) de tu suscripción. Capturas tus datos fiscales en Módulos y plan → Datos de facturación (RFC, razón social, régimen, código postal, uso del CFDI y el correo donde la quieres) y la factura te llega por correo en los días siguientes a cada pago. " +
  COBRO_A_NOMBRE_DE;

export const RESPUESTA_SOPORTE =
  `Todo por WhatsApp, al ${WHATSAPP_SOPORTE}: un asistente contesta las 24 horas y lo que no resuelve lo atiende una persona de PeluDesk el mismo día, en horario hábil. No hay que abrir tickets ni escribir correos.`;

export function respuestaSucursales(p: PreciosFijos): string {
  const precios =
    p.mensual && p.sucursal
      ? `La primera cuesta ${pesos(p.mensual)} + IVA al mes y cada sucursal adicional del mismo dueño ${pesos(p.sucursal)} + IVA al mes, en la misma suscripción.`
      : "La primera paga el plan y cada sucursal adicional del mismo dueño paga la mitad, en la misma suscripción.";
  return `Cada sucursal es un negocio en PeluDesk, con su propia caja, agenda, personal y página. ${precios} La prueba gratis de 15 días es para la primera; las demás se abren desde Módulos y plan cuando el plan ya está pagado, y quien trabaja en varias pasa de una a otra desde el menú.`;
}

export const RESPUESTA_RECORDATORIOS =
  "Van incluidos en el plan: no hay costo por mensaje. Los avisos y recordatorios se mandan por WhatsApp desde el teléfono de tu negocio: PeluDesk te deja el mensaje ya escrito y lo abres en WhatsApp con un toque (wa.me).";

export const RESPUESTA_CANCELACION =
  "Cancelas cuando quieras, desde Módulos y plan, sin plazo forzoso. No hay reembolso del mes en curso: lo sigues usando hasta que termina. Después tus datos quedan en solo lectura 90 días, y si los necesitas te ayudamos a exportarlos por WhatsApp.";

export const RESPUESTA_MIGRACION =
  "Sí. Tus clientes y mascotas los subes desde un Excel o CSV con el importador (Administración → Importar), y si hace falta te ayudamos por WhatsApp a dejar tu archivo listo.";

export function respuestaAnual(p: PreciosFijos): string {
  return p.anual
    ? `Sí: el plan anual cuesta ${pesos(p.anual)} + IVA al año, o sea dos meses gratis contra pagar mes a mes. Se escoge al contratar en Módulos y plan. ${COBRO_A_NOMBRE_DE}`
    : `Sí hay plan anual, con dos meses gratis contra pagar mes a mes. Se escoge al contratar en Módulos y plan. ${COBRO_A_NOMBRE_DE}`;
}

export const RESPUESTA_SMS =
  "No mandamos SMS. Los avisos y recordatorios van por WhatsApp, que es donde tus clientes sí los leen.";

/** La guía de la terminal, en la ayuda pública (el bot manda el link del artículo). */
export const AYUDA_TERMINAL = "https://peludesk.mx/ayuda/cobrar-con-terminal";

export const RESPUESTA_TERMINAL =
  `Sí: cobras con la terminal Point Smart de Mercado Pago (o con Clip) conectada a tu cuenta, y el cobro entra solo a tu caja. Aquí está paso a paso: ${AYUDA_TERMINAL}`;

/** Las preguntas con su respuesta fija (el bot las contesta sin escalar). */
export function respuestasFijas(p: PreciosFijos): { clave: string; pregunta: string; respuesta: string }[] {
  return [
    { clave: "factura", pregunta: "¿Me dan factura (CFDI)?", respuesta: RESPUESTA_FACTURA },
    { clave: "soporte", pregunta: "¿Cómo es el soporte?", respuesta: RESPUESTA_SOPORTE },
    { clave: "sucursales", pregunta: "¿Y si tengo varias sucursales?", respuesta: respuestaSucursales(p) },
    { clave: "recordatorios", pregunta: "¿Cuánto cuestan los recordatorios por WhatsApp?", respuesta: RESPUESTA_RECORDATORIOS },
    { clave: "cancelacion", pregunta: "¿Puedo cancelar cuando quiera?", respuesta: RESPUESTA_CANCELACION },
    { clave: "migracion", pregunta: "Tengo todo en Excel, ¿lo puedo pasar?", respuesta: RESPUESTA_MIGRACION },
    { clave: "anual", pregunta: "¿Hay plan anual?", respuesta: respuestaAnual(p) },
    { clave: "cobro", pregunta: "¿A nombre de quién sale el cobro?", respuesta: COBRO_A_NOMBRE_DE },
    { clave: "sms", pregunta: "¿Mandan SMS?", respuesta: RESPUESTA_SMS },
    { clave: "terminal", pregunta: "¿Puedo cobrar con terminal?", respuesta: RESPUESTA_TERMINAL },
  ];
}

/** Lo que el bot dice cuando manda el demo: Patitas & Co. no es un cliente. */
export const ACLARACION_DEMO = "Es Patitas & Co., un negocio de ejemplo de PeluDesk (no es un cliente real):";
