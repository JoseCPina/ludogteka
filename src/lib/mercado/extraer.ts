// Cómo se sacan precios de una página web o de una reseña para el Índice PeluDesk de precios: limpiar el HTML,
// encontrar cada cantidad en pesos con su contexto, quedarse con las que hablan de un servicio del catálogo y pedirle
// a la IA que diga de QUÉ servicio (y talla) es cada una. Sin imports de servidor: lo usan los scripts de
// scripts/mercado (Node directo) y la tarea de Vercel.
import { SERVICIOS_MERCADO, normalizarTexto, precioCreible, serviciosDeGiro, type GiroMercado, type Talla } from "./catalogo";

export type Candidato = { id: string; precio: number; contexto: string };
export type Clasificado = { id: string; servicio: string | null; talla: Talla | null; confianza: number };

const ENTIDADES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&aacute;": "á", "&eacute;": "é", "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú", "&ntilde;": "ñ", "&Aacute;": "Á", "&Eacute;": "É", "&Iacute;": "Í", "&Oacute;": "Ó", "&Uacute;": "Ú", "&Ntilde;": "Ñ" };

/** El texto visible de una página: sin scripts, estilos ni etiquetas, con los saltos de bloque como espacios. */
export function textoDeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/td|\/th)[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z]+;/gi, (e) => ENTIDADES[e] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Los enlaces del mismo sitio que parecen llevar a precios o servicios (hasta `tope`). */
export function enlacesDePrecios(html: string, base: string, tope = 3): string[] {
  const salida: string[] = [];
  let origen: URL;
  try {
    origen = new URL(base);
  } catch {
    return salida;
  }
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const href = m[1];
    const texto = normalizarTexto(textoDeHtml(m[2]));
    if (!/precio|tarifa|servicio|costo|paquete|planes|hotel|guarderia|estetica|grooming|hospedaje|consulta|promocion|menu/.test(normalizarTexto(href) + " " + texto)) continue;
    try {
      const u = new URL(href, origen);
      if (u.hostname.replace(/^www\./, "") !== origen.hostname.replace(/^www\./, "")) continue;
      if (/\.(pdf|jpg|jpeg|png|webp|gif|svg|zip|mp4)$/i.test(u.pathname)) continue;
      u.hash = "";
      const limpio = u.href;
      if (limpio === origen.href || salida.includes(limpio)) continue;
      salida.push(limpio);
      if (salida.length >= tope) break;
    } catch {
      /* enlace raro */
    }
  }
  return salida;
}

// «$350», «$ 1,200», «350 pesos», «MXN 450», «$350.00», «350 mxn». Nunca cantidades con más de 5 cifras enteras.
const DINERO = /(?:\$\s?|mxn\s?|mx\$\s?)(\d{1,3}(?:[.,]\d{3})+|\d{2,5})(?:\.\d{2})?(?!\d)|(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+|\d{2,5})(?:\.\d{2})?\s?(?:pesos|mxn|mn)\b/gi;

const aNumero = (t: string) => Number(t.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));

/**
 * Las cantidades en pesos de un texto con su contexto (±150 caracteres), solo las que están cerca de una palabra de
 * algún servicio del giro y son creíbles para alguno. `prefijo` hace únicos los ids entre páginas.
 */
export function candidatosDePrecio(texto: string, giro: GiroMercado | GiroMercado[], prefijo: string, tope = 40): Candidato[] {
  // Un negocio mixto (hotel y estética) tiene precios de los dos: se buscan las palabras de todos sus giros.
  const servicios = (Array.isArray(giro) ? giro : [giro]).flatMap((g) => serviciosDeGiro(g));
  const palabras = new Set(servicios.flatMap((s) => s.sinonimos));
  const salida: Candidato[] = [];
  const vistos = new Set<string>();
  let n = 0;
  for (const m of texto.matchAll(DINERO)) {
    const precio = aNumero(m[1] ?? m[2] ?? "");
    if (!Number.isFinite(precio) || precio <= 0) continue;
    if (!servicios.some((s) => precioCreible(s.clave, precio))) continue;
    const desde = Math.max(0, m.index! - 150);
    const contexto = texto.slice(desde, m.index! + m[0].length + 150).replace(/\s+/g, " ").trim();
    const ctx = normalizarTexto(contexto);
    if (![...palabras].some((p) => ctx.includes(p))) continue;
    // Años, teléfonos, códigos postales y «desde 2015» no son precios.
    if (/\b(19|20)\d{2}\b/.test(m[0]) && precio >= 1900 && precio <= 2100) continue;
    const llave = `${precio}|${ctx.slice(0, 60)}`;
    if (vistos.has(llave)) continue;
    vistos.add(llave);
    salida.push({ id: `${prefijo}-${n++}`, precio, contexto });
    if (salida.length >= tope) break;
  }
  return salida;
}

export const SISTEMA_CLASIFICAR_PRECIOS = `Clasificas precios que aparecen en páginas web y reseñas de negocios de mascotas en México (estéticas caninas, hoteles para perros, guarderías caninas y veterinarias). Te llega una lista de fragmentos de texto; cada uno tiene una cantidad en pesos. Por cada fragmento di a qué servicio del catálogo corresponde ESA cantidad, o null si no corresponde a ninguno o no se puede saber.

Catálogo (clave: qué es):
${SERVICIOS_MERCADO.map((s) => `- ${s.clave} (${s.giro}): ${s.nombre}, precio ${s.unidad}${s.conTalla ? ", depende de la talla del perro" : ""}`).join("\n")}

Reglas:
- Solo el precio normal de ESE servicio para UNA mascota. No son del catálogo: paquetes de varios servicios juntos (salvo paquete_guarderia), promociones con descuento, precios «desde» sin servicio claro, productos (shampoo, alimento), transporte, medias noches, horas extra, multas, anticipos, membresías.
- talla: chico, mediano o grande si el fragmento lo dice (chico/pequeño/toy/mini = chico; mediano/medium = mediano; grande/gigante/large/XL = grande); si no se dice, null.
- Una reseña que dice «me cobraron 350 por el baño» sí cuenta (servicio bano). «Antes cobraban» o «en otro lado cobran» no cuenta.
- confianza de 0 a 1: qué tan seguro estás de que la cantidad es el precio de ese servicio. Con menos de 0.6 pon servicio null.`;

export const HERRAMIENTA_PRECIOS = {
  name: "precios_clasificados",
  description: "Devuelve, por cada id de la lista, el servicio del catálogo al que corresponde la cantidad (o null), la talla si se dice y la confianza.",
  input_schema: {
    type: "object",
    properties: {
      precios: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            servicio: { type: ["string", "null"], enum: [...SERVICIOS_MERCADO.map((s) => s.clave), null] },
            talla: { type: ["string", "null"], enum: ["chico", "mediano", "grande", null] },
            confianza: { type: "number" },
          },
          required: ["id", "servicio", "talla", "confianza"],
        },
      },
    },
    required: ["precios"],
  },
};

export function usuarioClasificar(lote: (Candidato & { giro: GiroMercado })[]): string {
  return lote.map((c) => `id: ${c.id}\ngiro buscado: ${c.giro}\ncantidad: ${c.precio}\nfragmento: ${c.contexto}`).join("\n\n");
}

/** Lo que devolvió la IA, limpio: solo claves del catálogo del giro pedido, confianza ≥ 0.6 y precio creíble. */
export function limpiarClasificacion(entrada: unknown, lote: (Candidato & { giro: GiroMercado })[]): Clasificado[] {
  const lista = Array.isArray((entrada as { precios?: unknown })?.precios) ? ((entrada as { precios: unknown[] }).precios as Record<string, unknown>[]) : [];
  const porId = new Map(lote.map((c) => [c.id, c]));
  const salida: Clasificado[] = [];
  for (const x of lista) {
    const c = porId.get(String(x.id));
    if (!c) continue;
    const servicio = typeof x.servicio === "string" ? x.servicio : null;
    const s = SERVICIOS_MERCADO.find((y) => y.clave === servicio);
    const confianza = Number(x.confianza) || 0;
    // El giro del candidato es el de la búsqueda, no una regla: una veterinaria que también baña tiene precios de estética.
    if (!s || confianza < 0.6 || !precioCreible(s.clave, c.precio)) {
      salida.push({ id: c.id, servicio: null, talla: null, confianza });
      continue;
    }
    const talla = s.conTalla && typeof x.talla === "string" && ["chico", "mediano", "grande"].includes(x.talla) ? (x.talla as Talla) : null;
    salida.push({ id: c.id, servicio: s.clave, talla, confianza });
  }
  return salida;
}

/** ¿robots.txt deja leer esa ruta a nuestro agente? Un robots que no se pudo leer permite. */
export function robotsPermite(robotsTxt: string | null, ruta: string, agente = "peludeskbot"): boolean {
  if (!robotsTxt) return true;
  const grupos: { agentes: string[]; reglas: { tipo: "allow" | "disallow"; patron: string }[] }[] = [];
  let actual: (typeof grupos)[number] | null = null;
  for (const linea of robotsTxt.split(/\r?\n/)) {
    const l = linea.replace(/#.*$/, "").trim();
    if (!l) continue;
    const [clave, ...resto] = l.split(":");
    const valor = resto.join(":").trim();
    const k = clave.trim().toLowerCase();
    if (k === "user-agent") {
      if (!actual || actual.reglas.length) actual = { agentes: [], reglas: [] };
      actual.agentes.push(valor.toLowerCase());
      if (!grupos.includes(actual)) grupos.push(actual);
    } else if ((k === "allow" || k === "disallow") && actual) {
      actual.reglas.push({ tipo: k, patron: valor });
    }
  }
  const grupo = grupos.find((g) => g.agentes.some((a) => a === agente)) ?? grupos.find((g) => g.agentes.includes("*"));
  if (!grupo) return true;
  let mejor: { tipo: "allow" | "disallow"; largo: number } | null = null;
  for (const r of grupo.reglas) {
    if (!r.patron) continue;
    const re = new RegExp("^" + r.patron.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\$$/, "$"));
    if (re.test(ruta) && (!mejor || r.patron.length > mejor.largo)) mejor = { tipo: r.tipo, largo: r.patron.length };
  }
  return !mejor || mejor.tipo === "allow";
}

/** Precio por millón de tokens de claude-haiku-5-5 en USD (entrada, salida), y el tipo de cambio para el tope en pesos. */
export const PRECIO_HAIKU_USD = { entrada: 1, salida: 5 };
export const TIPO_CAMBIO_MXN = 18.5;
export const costoIaMxn = (tokensIn: number, tokensOut: number) => ((tokensIn * PRECIO_HAIKU_USD.entrada + tokensOut * PRECIO_HAIKU_USD.salida) / 1_000_000) * TIPO_CAMBIO_MXN;
