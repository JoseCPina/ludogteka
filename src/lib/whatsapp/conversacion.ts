// La conversación ACTUAL del bot y los precios fijos (21 de octubre de 2026, incidente del 524441301539: un «Hola»
// escaló a Telegram con un resumen que decía que el asistente acababa de dar «Plan Completo $1,199», una respuesta
// del 29 de septiembre con el precio de entonces). Reglas:
//   1. Una conversación termina tras 24 horas de silencio: lo anterior no entra al modelo ni al resumen.
//   2. Un saludo al empezar conversación se contesta con el saludo y el menú, sin modelo y sin escalar.
//   3. Precio, planes, anual, sucursales, prueba gratis y factura se contestan con texto FIJO, nunca generado; si el
//      modelo escribe una cifra con signo de pesos que no es de las fijas, su respuesta se sustituye por la fija.
// Sin imports de valores: lo usan el bot y las pruebas (`node --experimental-strip-types`).

export const SILENCIO_MS = 24 * 3600_000;

export type MensajeConFecha = { quien: "usuario" | "agente" | "humano"; texto: string; at?: string | null };

/** Los mensajes desde el último silencio de 24 h (vacío si el último mensaje tiene más de 24 h). */
export function conversacionActual<T extends MensajeConFecha>(mensajes: T[], ahora: Date): T[] {
  let inicio = mensajes.length;
  let siguiente = ahora.getTime();
  for (let i = mensajes.length - 1; i >= 0; i--) {
    const t = mensajes[i].at ? Date.parse(mensajes[i].at as string) : NaN;
    if (!Number.isFinite(t) || siguiente - t >= SILENCIO_MS) break;
    inicio = i;
    siguiente = t;
  }
  return mensajes.slice(inicio);
}

const normal = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¡!¿?.,;:)(*_~"'«»-]+/g, " ").replace(/\s+/g, " ").trim();

const PALABRAS_SALUDO = new Set([
  "hola", "holaa", "holi", "ola", "buenas", "buen", "buenos", "dia", "dias", "tarde", "tardes", "noche", "noches", "que", "tal", "hey", "hi",
  "hello", "saludos", "info", "informacion", "q", "onda", "como", "estas", "esta", "estan", "muy", "oye", "disculpe", "disculpa", "peludesk",
]);

/** «Hola», «Buenas tardes», «Hola, qué tal», «Info»: solo palabras de saludo, corto. */
export function esSaludo(texto: string): boolean {
  const t = normal(texto);
  if (!t || t.length > 40) return false;
  const palabras = t.split(" ");
  return palabras.every((p) => PALABRAS_SALUDO.has(p)) && palabras.some((p) => ["hola", "holaa", "holi", "ola", "buenas", "buenos", "buen", "hey", "hi", "hello", "saludos", "info", "informacion"].includes(p));
}

export const MENU_SALUDO = [
  "¡Hola! 👋 Soy el asistente de PeluDesk, el sistema para veterinarias, guarderías, hoteles y estéticas caninas.",
  "¿En qué te ayudo? Contesta con el número:",
  "1. Probar gratis 15 días\n2. Precio\n3. Tengo una duda",
].join("\n\n");

/**
 * ¿El último mensaje del bot fue el menú? (para entender «1», «2», «3»). La línea del aviso de privacidad que va
 * detrás del primer saludo a un número nuevo no cuenta: sin esto, «1» no se entendía en la primera conversación.
 */
export function ultimoFueMenu(mensajes: MensajeConFecha[]): boolean {
  const delBot = mensajes.filter((m) => m.quien !== "usuario" && !m.texto.startsWith("Así cuidamos tus datos"));
  return delBot.length > 0 && delBot[delBot.length - 1].texto.startsWith(MENU_SALUDO.slice(0, 30));
}

/** La opción del menú que escogió («1», «2.», «la 2», «opción 3»), o null. */
export function opcionDelMenu(texto: string): 1 | 2 | 3 | null {
  const m = normal(texto).match(/^(?:la |opcion |el |numero )?([123])$/);
  return m ? (Number(m[1]) as 1 | 2 | 3) : null;
}

export const TEXTO_DUDA = "Claro, cuéntame tu duda y te ayudo.";

export type PreciosBot = { mensual: number; anual: number; sucursal: number };

const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

export type TemaPrecio = "precio" | "anual" | "sucursal" | "prueba" | "factura";

/**
 * ¿Pregunta el precio de PeluDesk, el plan, el anual, las sucursales, la prueba gratis o la factura? Una duda de cómo
 * capturar precios o tarifas DE SU negocio (servicios, clientes) no cuenta.
 */
export function temaDePrecio(texto: string): TemaPrecio | null {
  const t = normal(texto);
  if (!t || t.length > 220) return null;
  if (/\b(servicios?|cliente|clientes|bano|corte|consulta|tarifas?|matriz|mestizo|cita|citas|reserva|reservas|caja|cobro de|cobrar a)\b/.test(t) && !/\bpeludesk\b/.test(t)) return null;
  const precio = /\b(precio|precios|cuesta|cuestan|costo|costos|cuanto (es|sale|cobran|vale|cuesta|seria|pago|cobra)|mensualidad|cobran|plan|planes|paquete|paquetes|suscripcion|pagar al mes|al mes)\b/.test(t);
  // Solo la factura DE PeluDesk («¿dan factura?»); «¿se conecta con mi sistema de facturación?» es una duda.
  if (/\b(dan|dais|emiten|hacen|entregan|incluye|incluyen|tienen|expiden) (factura|cfdi)\b|\bfacturan\b|\bfactura (de|por) (la )?(suscripcion|peludesk|plan|mensualidad)\b/.test(t) && !precio) return "factura";
  if (/\bsucursal(es)?\b/.test(t)) return "sucursal";
  if (/\b(anual|al ano|por ano|anualidad)\b/.test(t)) return "anual";
  // «prueba» suelta no basta (un negocio puede llamarse «… Prueba …»).
  if (/\b(prueba gratis|prueba gratuita|periodo de prueba|dias gratis|probar gratis|es gratis|version gratis|quiero probar|puedo probar)\b/.test(t) && !precio) return "prueba";
  if (precio) return "precio";
  return null;
}

const UNICO = "Es un solo plan con todo incluido: sin módulos ni extras de pago.";

/** La respuesta fija de cada tema (cifras de la base, nunca del modelo). */
export function respuestaPrecioFija(tema: TemaPrecio, p: PreciosBot, registro: string): string {
  const prueba = `Los primeros *15 días son gratis*, sin tarjeta. Pruébalo aquí:\n${registro}`;
  switch (tema) {
    case "anual":
      return `El plan anual cuesta *${pesos(p.anual)} + IVA al año* por negocio: dos meses gratis contra pagar mes a mes (*${pesos(p.mensual)} + IVA al mes*).\n\n${UNICO}\n\n${prueba}`;
    case "sucursal":
      return `Tu primer negocio paga *${pesos(p.mensual)} + IVA al mes* y cada sucursal adicional *${pesos(p.sucursal)} + IVA al mes*, en la misma suscripción. Cada sucursal tiene su propia caja, agenda, personal y página.\n\nLa prueba gratis de 15 días es para la primera.`;
    case "prueba":
      return `La prueba es de *15 días gratis*, sin tarjeta y con todo incluido. Después, *${pesos(p.mensual)} + IVA al mes* por negocio.\n\nEmpieza aquí:\n${registro}`;
    case "factura":
      return "Sí: la factura (CFDI) de tu suscripción la emite Menteo, S.A.S., la empresa que opera PeluDesk. Tus datos fiscales los capturas en Módulos y plan → Datos de facturación y te llega por correo después de cada pago.";
    default:
      return [
        `PeluDesk cuesta *${pesos(p.mensual)} + IVA al mes* por negocio, o *${pesos(p.anual)} + IVA al año* (dos meses gratis).`,
        `Cada sucursal adicional: *${pesos(p.sucursal)} + IVA al mes*.`,
        UNICO,
        "La factura (CFDI) la emite Menteo, S.A.S.",
        prueba,
      ].join("\n\n");
  }
}

/** Las cifras que el bot puede decir: las fijas, sin y con IVA. */
export function cifrasPermitidas(p: PreciosBot): Set<number> {
  const s = new Set<number>([0]);
  for (const n of [p.mensual, p.anual, p.sucursal, p.sucursal * 10]) {
    s.add(Math.round(n * 100));
    s.add(Math.round(Math.round(n * 100) * 1.16));
  }
  return s;
}

/** Las cifras con signo de pesos de un texto, en centavos. */
export function cifrasConPesos(texto: string): number[] {
  return [...(texto ?? "").matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g)].map((m) => Number(m[1].replace(/,/g, "")) * 100 + Number((m[2] ?? "0").padEnd(2, "0")));
}

/** Las cifras de un texto que NO son de las fijas. */
export function cifrasNoFijas(texto: string, p: PreciosBot): number[] {
  const ok = cifrasPermitidas(p);
  return cifrasConPesos(texto).filter((c) => !ok.has(c));
}

/** Un mensaje del historial con un precio que ya no vale: la cifra se tacha para que el modelo no la repita. */
export function sinPreciosViejos(texto: string, p: PreciosBot): string {
  const ok = cifrasPermitidas(p);
  return (texto ?? "").replace(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g, (todo, ent: string, dec?: string) =>
    ok.has(Number(ent.replace(/,/g, "")) * 100 + Number((dec ?? "0").padEnd(2, "0"))) ? todo : "[precio anterior, ya no vigente]",
  );
}
