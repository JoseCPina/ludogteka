// Formato de salida hacia WhatsApp. Portado tal cual del bot de Checaíto
// (supabase/functions/_compartido/texto.ts): lo aplica todo lo que sale, lo
// escriba la IA o el operador desde Telegram.

/** Emojis de verdad, sin flechas ni signos que sí se usan como puntuación. */
const EMOJI_FINAL =
  /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}][\u{FE00}-\u{FE0F}\u{200D}]*)+[ \t]*$/u;

/**
 * Quita el emoji con el que se cierra un mensaje.
 *
 * Un emoji al principio de la línea marca de qué se trata; al final sólo
 * decora, y un mensaje que acaba en carita suena a volante publicitario. Ni un
 * solo texto del bot termina así, pero el modelo lo hace cada tantas
 * respuestas por más que el prompt se lo prohíba.
 */
export function sinEmojiFinal(texto: string): string {
  const cortado = (texto ?? "").replace(EMOJI_FINAL, "").trimEnd();
  // Si el mensaje ERA el emoji, se respeta: quedarse sin nada es peor.
  return cortado || texto;
}

export function aFormatoWhatsApp(texto: string): string {
  const pasos = (texto ?? "")
    // Negrita y cursiva de Markdown al dialecto de WhatsApp.
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, "*$1*")
    .replace(/\*\*([\s\S]+?)\*\*/g, "*$1*")
    .replace(/__([\s\S]+?)__/g, "*$1*")
    // Encabezados: WhatsApp no los tiene.
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    // Viñetas. Va ANTES de cazar asteriscos sueltos, si no el "* " de una
    // lista se leeria como una negrita a medio abrir.
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    // Tres saltos seguidos son un mensaje mal armado, no una pausa.
    .replace(/\n{3,}/g, "\n\n");

  return sinEmojiFinal(sinAsteriscosSueltos(pasos).trim()).trim();
}

/**
 * Quita los asteriscos que no cierran par.
 *
 * Se emparejan de izquierda a derecha, como los lee WhatsApp. Un par cuyo
 * contenido esta vacio o es solo espacios no es negrita: ahi el primero sobra.
 */
function sinAsteriscosSueltos(texto: string): string {
  const sobran = new Set<number>();
  let abierto: number | null = null;

  for (let i = 0; i < texto.length; i++) {
    if (texto[i] !== "*") continue;
    if (abierto === null) {
      abierto = i;
      continue;
    }
    if (texto.slice(abierto + 1, i).trim() === "") {
      sobran.add(abierto);
      abierto = i;
      continue;
    }
    abierto = null; // par bueno: los dos se quedan
  }
  if (abierto !== null) sobran.add(abierto);

  if (sobran.size === 0) return texto;

  // Se recorre por unidades UTF-16, que es como se midieron los índices de
  // arriba. Un [...texto] partiría por puntos de código y desalinearía todo
  // en cuanto el mensaje llevara un emoji, que es casi siempre.
  let salida = "";
  for (let i = 0; i < texto.length; i++) {
    if (!sobran.has(i)) salida += texto[i];
  }
  // Sacar el asterisco de "3 * 4" deja dos espacios pegados. Se colapsan los
  // horizontales; los saltos de línea no se tocan.
  return salida.replace(/[ \t]{2,}/g, " ");
}
