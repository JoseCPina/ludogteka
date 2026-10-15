// Los avisos nativos del navegador («Please select an item in the list.») salen en el idioma del
// navegador de quien lo usa, no en el de la app. Esta función da el texto en español de cada
// causa de invalidez; `ValidacionEnEspanol` la aplica a TODO campo de TODA pantalla.
export type CampoValidable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function mensajeDeValidacion(el: CampoValidable): string {
  const v = el.validity;
  const tipo = el instanceof HTMLInputElement ? el.type : el instanceof HTMLSelectElement ? "select" : "textarea";
  if (v.valueMissing) {
    if (tipo === "select") return "Elige una opción de la lista.";
    if (tipo === "checkbox") return "Marca esta casilla para continuar.";
    if (tipo === "radio") return "Elige una de las opciones.";
    if (tipo === "file") return "Elige un archivo.";
    return "Completa este campo.";
  }
  if (v.typeMismatch) {
    if (tipo === "email") return "Escribe un correo válido, por ejemplo nombre@correo.com.";
    if (tipo === "url") return "Escribe una dirección web válida, que empiece con https://.";
    return "El formato no es válido.";
  }
  if (v.patternMismatch) return el.title?.trim() || "El formato no es válido.";
  if (v.tooShort) return `Usa al menos ${(el as HTMLInputElement).minLength} caracteres.`;
  if (v.tooLong) return `Usa máximo ${(el as HTMLInputElement).maxLength} caracteres.`;
  if (v.rangeUnderflow) return `El valor mínimo es ${(el as HTMLInputElement).min}.`;
  if (v.rangeOverflow) return `El valor máximo es ${(el as HTMLInputElement).max}.`;
  if (v.stepMismatch || v.badInput) return "Escribe un valor válido.";
  return "Revisa este campo.";
}
