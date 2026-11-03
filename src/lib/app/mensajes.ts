/**
 * Los mensajes de `validar_cita_estetica` / `validar_estancia` le hablan al personal: dicen dónde capturar lo que falta
 * («Captúrala en /perros/…», «revisa su requisito en /perros/…/requisitos»). El dueño no abre esas pantallas: aquí se
 * quita cada frase que mande a una ruta del panel y se cierra con lo que sí puede hacer él (docs/app-duenos/FASE-3.md,
 * «Pendiente»). Lo demás del mensaje (qué falta, qué día está lleno) se queda tal cual.
 */
export function mensajeParaDueno(mensaje: string): string {
  const texto = mensaje.trim();
  if (!/(^|\s)\/[a-z]/i.test(texto)) return texto;
  const frases = texto.split(/(?<=[.:;])\s+/).filter((f) => !/(^|\s)\/[a-z]/i.test(f));
  const limpio = frases.join(" ").replace(/[:;,]\s*$/, ".").trim();
  const cierre = "Pídele al negocio que lo complete en su sistema y vuelve a intentarlo.";
  return limpio ? `${limpio.replace(/[^.!?]$/, (c) => `${c}.`)} ${cierre}` : `Al expediente de tu mascota le falta un dato. ${cierre}`;
}
