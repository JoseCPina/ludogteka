import { claveDeMensaje, requisitoParaDueno } from "./requisitos";

/**
 * Los mensajes de `validar_cita_estetica` / `validar_estancia` le hablan al personal. Lo que el catálogo conoce
 * (src/lib/app/requisitos.ts) sale en palabras del dueño; de lo demás se quita cada frase que mande a una ruta del panel
 * y se cierra con lo que sí puede hacer él (docs/app-duenos/FASE-3.md).
 */
export function mensajeParaDueno(mensaje: string): string {
  const texto = mensaje.trim();
  const clave = claveDeMensaje(texto);
  if (clave) return requisitoParaDueno({ clave, detalle: texto }).explicacion;
  if (!/(^|\s)\/[a-z]/i.test(texto)) return texto;
  const frases = texto.split(/(?<=[.:;])\s+/).filter((f) => !/(^|\s)\/[a-z]/i.test(f));
  const limpio = frases.join(" ").replace(/[:;,]\s*$/, ".").trim();
  const cierre = "Pídele al negocio que lo complete en su sistema y vuelve a intentarlo.";
  return limpio ? `${limpio.replace(/[^.!?]$/, (c) => `${c}.`)} ${cierre}` : `Al expediente de tu mascota le falta un dato. ${cierre}`;
}
