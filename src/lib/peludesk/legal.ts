/**
 * Los datos legales de peludesk.mx en un solo lugar.
 *
 * Razón social, domicilio y contacto salen de los documentos legales de
 * Menteo (JoseCPina/menteo, legal/) y de la cuenta de Stripe. La razón
 * social exacta está pendiente de cotejar contra la constancia de situación
 * fiscal: los documentos de Menteo dicen «Menteo S.A.S. de C.V.» y el resto
 * (Stripe, CLAUDE.md, pie de la landing) «Menteo, S.A.S.». Si la constancia
 * dice otra cosa, se cambia SOLO aquí.
 *
 * Subir la versión de un documento vuelve a pedir la aceptación en el
 * siguiente registro y queda anotada (aceptaciones_legales). Se cambia junto
 * con el texto de content/legal/<documento>.md.
 */
export const EMPRESA = {
  razonSocial: "Menteo, S.A.S.",
  marca: "PeluDesk",
  domicilio: "Calzada de Guadalupe 1050, Colonia Tepeyac, C.P. 78384, San Luis Potosí, S.L.P., México",
  correo: "contacto@peludesk.mx",
  telefono: "444 130 1539",
  sitio: "https://peludesk.mx",
} as const;

export type DocumentoLegal = "terminos" | "aviso_privacidad" | "cookies";

export const DOCUMENTOS_LEGALES: Record<DocumentoLegal, { version: string; fecha: string; titulo: string; ruta: string }> = {
  terminos: { version: "2026-09-30.2", fecha: "30 de septiembre de 2026", titulo: "Términos y condiciones", ruta: "/terminos" },
  aviso_privacidad: { version: "2026-10-05.1", fecha: "5 de octubre de 2026", titulo: "Aviso de privacidad", ruta: "/aviso-de-privacidad" },
  cookies: { version: "2026-09-30.2", fecha: "30 de septiembre de 2026", titulo: "Política de cookies", ruta: "/cookies" },
};

export const URL_AVISO_PRIVACIDAD = `${EMPRESA.sitio}${DOCUMENTOS_LEGALES.aviso_privacidad.ruta}`;
