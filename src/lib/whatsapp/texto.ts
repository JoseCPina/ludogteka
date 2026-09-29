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

const URL_EN_LINEA = /(https?:\/\/\S+)/;
const ES_URL = /^https?:\/\/\S+$/;
/**
 * Dos renglones de WhatsApp en el celular son ~80 caracteres («Desde *$449 al
 * mes + IVA*, y los primeros *15 días son gratis*, sin tarjeta.» son 76). Un
 * párrafo más largo se parte entre frases.
 */
const MAX_PARRAFO = 110;
/** Más párrafos que esto (sin contar el link) y el mensaje se parte en dos. */
const MAX_PARRAFOS = 4;

/**
 * Un párrafo largo se corta entre frases, en pedazos de a lo más MAX_PARRAFO.
 * Sin pérdida: solo se parte en un espacio, y solo donde termina una frase
 * («. » seguido de mayúscula o de ¿/¡) o después de dos puntos con una frase
 * completa de cada lado, o en «, y» / «, pero» / «, así que» / «, porque»
 * (pasan a punto y la frase siguiente empieza con mayúscula). «(Patitas & Co.) donde…» no se parte: tras el punto
 * no viene un espacio. Ninguna palabra se pierde.
 */
const mayuscula = (t: string) => t.charAt(0).toLocaleUpperCase("es-MX") + t.slice(1);

export function partirParrafo(p: string): string[] {
  if (p.length <= MAX_PARRAFO || ES_URL.test(p)) return [p];
  let frases = p.split(/(?<=[.!?])\s+(?=[¿¡"«*A-ZÁÉÍÓÚÑ0-9])/);
  frases = frases.flatMap((f) => {
    if (f.length <= MAX_PARRAFO) return [f];
    const i = f.indexOf(": ");
    // «Cuando termine no se borra nada: puedes…» → dos frases (punto y mayúscula).
    if (i >= 25 && f.length - i >= 30) return [`${f.slice(0, i)}.`, mayuscula(f.slice(i + 2))];
    // «…por estilista, y ya no se te enciman…»: en español la coma antes de
    // «y» / «pero» une dos frases completas (una lista no lleva esa coma).
    const conj = [...f.matchAll(/, (y|pero|así que|porque) /g)]
      .map((m) => m.index ?? 0)
      .filter((k) => k >= 35 && f.length - k >= 35)
      .sort((x, y) => Math.abs(x - f.length / 2) - Math.abs(y - f.length / 2))[0];
    return conj ? [`${f.slice(0, conj)}.`, mayuscula(f.slice(conj + 2))] : [f];
  });
  const salida: string[] = [];
  let actual = "";
  for (const f of frases) {
    if (actual && (actual + " " + f).length > MAX_PARRAFO) {
      salida.push(actual);
      actual = f;
    } else actual = actual ? `${actual} ${f}` : f;
  }
  if (actual) salida.push(actual);
  return salida;
}

/**
 * Lo que el bot manda (no lo que escribe el operador): un renglón en blanco
 * entre cada idea y cada link solo en su renglón. El modelo lo sabe, pero
 * pegar dos párrafos con un solo salto es de lo que más se le escapa, y en
 * el celular eso se lee como un bloque.
 */
export function formatoDelBot(texto: string): string {
  const lineas: string[] = [];
  for (const cruda of (texto ?? "").split("\n")) {
    const linea = cruda.trim();
    if (!linea) continue;
    const m = linea.match(URL_EN_LINEA);
    if (m && linea !== m[1]) {
      // «Pruébalo aquí: https://…» → la frase y, abajo, el link solo.
      const antes = linea.slice(0, m.index).trim();
      const despues = linea.slice((m.index ?? 0) + m[1].length).trim();
      if (antes) lineas.push(antes);
      lineas.push(m[1].replace(/[).,;:!?]+$/, ""));
      if (despues && !/^[).,;:!?]+$/.test(despues)) lineas.push(despues);
      continue;
    }
    lineas.push(linea);
  }
  // Todo párrafo empieza con mayúscula (también «*desde…» o «¿qué…»).
  return lineas
    .flatMap(partirParrafo)
    .map((p) => (ES_URL.test(p) ? p : p.replace(/^([*¿¡"«(]*)(\p{Ll})/u, (_, antes: string, letra: string) => antes + letra.toLocaleUpperCase("es-MX"))))
    .join("\n\n");
}

/**
 * Un link por mensaje y al final: si un mensaje trae dos, se parte en dos
 * mensajes (cada uno termina con el suyo); si trae uno a media respuesta,
 * se pasa al último renglón. Recibe mensajes ya pasados por formatoDelBot.
 */
export function unLinkAlFinal(mensaje: string): string[] {
  const parrafos = mensaje.split("\n\n");
  const links = parrafos.filter((p) => ES_URL.test(p));
  if (links.length === 0) return [mensaje];
  if (links.length === 1) {
    // El renglón que presenta al link («Aquí lo tienes:») se va con él.
    const i = parrafos.indexOf(links[0]);
    const presenta = i > 0 && /:$/.test(parrafos[i - 1]) ? i - 1 : i;
    return [[...parrafos.slice(0, presenta), ...parrafos.slice(i + 1), ...parrafos.slice(presenta, i + 1)].join("\n\n")];
  }
  const corte = parrafos.findIndex((p) => ES_URL.test(p)) + 1;
  return [parrafos.slice(0, corte).join("\n\n"), ...unLinkAlFinal(parrafos.slice(corte).join("\n\n"))].filter(Boolean);
}

/**
 * Si un mensaje trae más de MAX_PARRAFOS párrafos, se manda en dos seguidos
 * (el link, si hay, se queda al final del segundo).
 */
export function enDosSiEsLargo(mensaje: string): string[] {
  const parrafos = mensaje.split("\n\n");
  const sinLink = parrafos.filter((p) => !ES_URL.test(p)).length;
  if (sinLink <= MAX_PARRAFOS) return [mensaje];
  const mitad = Math.ceil(sinLink / 2);
  return [parrafos.slice(0, mitad).join("\n\n"), parrafos.slice(mitad).join("\n\n")];
}

/**
 * Más de esto (~2 renglones y medio) y se le pide al modelo que reescriba: es
 * el mismo tope que exige scripts/auditoria/whatsapp-bot.mjs.
 */
const MAX_REESCRIBIR = 120;

/**
 * ¿Hay que pedirle al modelo que reescriba? Si algún párrafo se pasa de dos
 * renglones y no se pudo partir entre frases, o si un mensaje (los separa
 * SEPARADOR, «===») trae más de MAX_PARRAFOS párrafos sin contar el cierre
 * (el link y el renglón que lo presenta).
 */
export function hayQueReescribir(texto: string, separador: string): boolean {
  return texto.split(new RegExp(`^[ \\t]*${separador}[ \\t]*$`, "m")).some((mensaje) => {
    const parrafos = formatoDelBot(aFormatoWhatsApp(mensaje)).split("\n\n");
    if (parrafos.some((p) => !ES_URL.test(p) && p.length > MAX_REESCRIBIR)) return true;
    const cuerpo = parrafos.filter((p, k) => !ES_URL.test(p) && !/^\[\[/.test(p) && !(/:$/.test(p) && ES_URL.test(parrafos[k + 1] ?? "")));
    return cuerpo.length > MAX_PARRAFOS;
  });
}

/**
 * Si un mensaje trae más de MAX_PARRAFOS párrafos (sin contar el link), junta
 * los dos vecinos más cortos mientras quepan en dos renglones: «En la mañana
 * ves quién llega.» + «Y el cupo que te queda.» es un párrafo, no dos.
 */
export function juntarCortos(mensaje: string): string {
  const p = mensaje.split("\n\n");
  const cuerpo = () => p.filter((x) => !ES_URL.test(x)).length;
  while (cuerpo() > MAX_PARRAFOS) {
    let mejor = -1;
    for (let i = 0; i < p.length - 1; i++) {
      if (ES_URL.test(p[i]) || ES_URL.test(p[i + 1]) || /:$/.test(p[i])) continue;
      const largo = p[i].length + 1 + p[i + 1].length;
      if (largo <= MAX_PARRAFO && (mejor < 0 || largo < p[mejor].length + 1 + p[mejor + 1].length)) mejor = i;
    }
    if (mejor < 0) break;
    p.splice(mejor, 2, `${p[mejor]} ${p[mejor + 1]}`);
  }
  return p.join("\n\n");
}
