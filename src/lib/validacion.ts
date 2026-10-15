// Cuando un aviso de error es de VALIDACIÓN (falta un dato, hay que escoger o escribir algo), el título del
// recuadro dice «Falta información» y no el genérico «No se pudo guardar» / «No se pudo completar la acción»
// (QA externa B18: el mensaje ya decía qué faltaba, pero el título parecía una falla del sistema).
// Lo usa <Alert> para toda la app: un título genérico de error + un mensaje de validación = «Falta información».

export const TITULO_VALIDACION = "Falta información";

const PIDE_UN_DATO =
  /(^|[\s.¿«(:,;¡-])(falta|faltan|faltó|obligatori[oa]s?|necesario|necesaria|escribe|escoge|elige|indica|selecciona|captura|completa|registra|anota|ingresa|llena|marca|pon|agrega|capt[uú]ral[aeo]s?|reg[ií]stral[aeo]s?|agr[eé]gal[aeo]s?|el[ií]gel[aeo]s?)\b|no tiene (talla|pelaje|evaluaci[oó]n|precio|grupo|tama[nñ]o|registro)|no puede estar vac[ií]o|tiene que ser|tiene que tener|al menos \d|debe tener/i;

/** ¿El mensaje le pide a la persona un dato que no puso o que está mal? */
export function esMensajeDeValidacion(mensaje: unknown): boolean {
  return typeof mensaje === "string" && mensaje.length < 400 && PIDE_UN_DATO.test(mensaje);
}

/** Títulos de error genéricos que se cambian por «Falta información» cuando el mensaje es de validación. */
export function esTituloGenericoDeError(titulo: string): boolean {
  return /^No se pudo\b/.test(titulo) || /^No pudimos (guardar|completar|registrar|crear|firmar|enviar)/.test(titulo);
}

export function tituloDeError(titulo: string, mensaje: unknown): string {
  return esTituloGenericoDeError(titulo) && esMensajeDeValidacion(mensaje) ? TITULO_VALIDACION : titulo;
}
