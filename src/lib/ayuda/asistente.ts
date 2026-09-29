import type { Articulo } from "./tipos";
import { NOMBRE_GRUPO } from "./tipos";

/**
 * El asistente de Ayuda dentro de la app: el mismo motor que el bot de
 * WhatsApp (src/lib/whatsapp: modelo, tarifa y topes), pero con una sola
 * fuente: la documentación de los módulos activos del negocio.
 *
 * Reglas que no se rompen:
 *   - No ve datos del negocio (ni clientes, ni cobros, ni nada): solo sabe
 *     quién pregunta (rol), el nombre del negocio, sus módulos y la pantalla
 *     donde está. Nunca menciona otro negocio.
 *   - Toda respuesta cita el artículo de donde sale con [[articulo:slug]] y
 *     el código lo convierte en link. Una respuesta sin cita válida NO se
 *     muestra: se dice que no está documentado y se ofrece un ticket (así
 *     no inventa).
 *   - Si no está en la documentación, o la persona dice que no se resolvió,
 *     llama a sin_documentacion y la pantalla ofrece el ticket con lo que ya
 *     se platicó.
 * Puro: sin red ni base (las pruebas lo usan directo).
 */
export const MAX_PREGUNTAS_DIA = 40;
export const MAX_TOKENS_ASISTENTE = 900;
export const LIMITE_HISTORIAL = 10;

export const TEXTO_SIN_DOCUMENTACION =
  "Eso no lo tengo en la documentación, y prefiero no adivinar. ¿Creamos un ticket con lo que ya me contaste? Te contesta alguien de PeluDesk.";

const MARCA_ARTICULO = /\[\[articulo:([a-z0-9-]+)\]\]/g;

export type ContextoAsistente = {
  negocio: string;
  rol: "admin" | "recepcion";
  modulos: string[];
  pantalla: string | null;
  hoy: string;
};

function bloqueArticulo(a: Articulo): string {
  const quien = a.roles.map((r) => (r === "admin" ? "admin" : "recepción")).join(" y ");
  return [
    `<articulo slug="${a.slug}" titulo="${a.titulo}" tema="${NOMBRE_GRUPO[a.grupo] ?? a.grupo}" lo_hace="${quien}" pantallas="${a.rutas.join(", ")}">`,
    a.resumen,
    a.cuerpo.trim(),
    "</articulo>",
  ].join("\n");
}

/**
 * La parte fija del system prompt (va en caché): instrucciones y la
 * documentación. Solo cambia si cambian los módulos del negocio.
 */
export function promptFijo(articulos: Articulo[]): string {
  return [
    "Eres el asistente de Ayuda de PeluDesk, el software de guarderías, hoteles y estéticas caninas. Contestas a alguien del equipo de un negocio (admin o recepción) que está usando la app ahora mismo.",
    "",
    "CÓMO CONTESTAS:",
    "- Español de México, de tú. Nunca voseo. Corto y paso a paso: como alguien que conoce el mostrador, no como un manual.",
    "- Máximo 6 renglones. Si son pasos, en lista numerada corta (1. 2. 3.). Los nombres de botones y secciones en **negritas**, tal como están en el artículo.",
    "- Sin saludos, sin «¡Excelente pregunta!», sin cerrar con «¿algo más?».",
    "",
    "REGLAS DURAS:",
    "- Solo puedes afirmar lo que está en la DOCUMENTACIÓN de abajo. Nada de lo que «seguro hace» la app: si no está escrito ahí, no lo sabes.",
    "- Toda respuesta termina con la cita del artículo de donde la sacaste, en su propio renglón: [[articulo:slug]] (el slug exacto de la documentación). Si usaste dos, dos citas. Sin cita no hay respuesta.",
    "- Si la documentación no responde la pregunta, o la persona dice que no se resolvió, que no le funcionó o que salió un error distinto: llama a la herramienta sin_documentacion. No inventes pasos, pantallas, botones ni funciones.",
    "- No tienes acceso a los datos del negocio (clientes, perros, cobros, citas). Si preguntan por un dato concreto («¿cuánto debe Juan?»), di dónde verlo en la app si la documentación lo dice; si no, sin_documentacion.",
    "- Nunca hables de otro negocio ni de datos de otros negocios. Si alguien pide eso, dilo en una línea.",
    "- Si la tarea es de admin y quien pregunta es recepción, dilo: «eso lo hace el admin».",
    "- Precios de PeluDesk, facturas, cobros de la suscripción, reembolsos de la suscripción o errores de la app: sin_documentacion (lo atiende una persona).",
    "",
    "=== DOCUMENTACIÓN ===",
    ...articulos.map(bloqueArticulo),
  ].join("\n");
}

/** La parte que cambia con cada persona (después del bloque en caché). */
export function promptVariable(ctx: ContextoAsistente): string {
  return [
    `Negocio: ${ctx.negocio}. Quien pregunta: ${ctx.rol === "admin" ? "admin (dueño o encargado)" : "recepción"}.`,
    `Módulos que tiene prendidos: ${ctx.modulos.join(", ") || "ninguno además de caja y clientes"}. Si pregunta por algo de un módulo que no tiene, dile que ese módulo no está prendido (lo prende el admin en Administración → Módulos y plan).`,
    ctx.pantalla ? `Está en la pantalla ${ctx.pantalla}.` : "",
    `Hoy es ${ctx.hoy}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const HERRAMIENTAS_ASISTENTE = [
  {
    name: "sin_documentacion",
    description:
      "Úsala cuando la DOCUMENTACIÓN no responda la pregunta, cuando no estés seguro, cuando la persona diga que no se resolvió o que le sale un error, " +
      "o cuando pregunten por precios, facturas o la suscripción de PeluDesk. La pantalla le ofrece crear un ticket con lo que ya se platicó.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Qué necesita la persona, en una línea (va al ticket)." },
      },
      required: ["motivo"],
    },
  },
];

export type ResultadoAsistente = {
  texto: string;
  articulos: string[];
  sinRespuesta: boolean;
  motivo: string | null;
};

/**
 * Lo que sale a la pantalla. Las citas se validan contra los artículos que
 * ESTE negocio puede ver; sin una cita válida, no se muestra lo que el
 * modelo escribió: se ofrece el ticket.
 */
export function procesarRespuesta(
  texto: string,
  usos: { nombre: string; entrada: Record<string, unknown> }[],
  permitidos: Set<string>
): ResultadoAsistente {
  const sin = usos.find((u) => u.nombre === "sin_documentacion");
  if (sin) {
    return { texto: TEXTO_SIN_DOCUMENTACION, articulos: [], sinRespuesta: true, motivo: String(sin.entrada.motivo ?? "").slice(0, 300) || null };
  }
  const citas = [...new Set([...(texto ?? "").matchAll(MARCA_ARTICULO)].map((m) => m[1]))];
  const validas = citas.filter((c) => permitidos.has(c));
  const limpio = (texto ?? "")
    .replace(MARCA_ARTICULO, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!validas.length || !limpio) {
    return { texto: TEXTO_SIN_DOCUMENTACION, articulos: [], sinRespuesta: true, motivo: null };
  }
  return { texto: limpio, articulos: validas, sinRespuesta: false, motivo: null };
}

/** ¿La persona dice que no se resolvió? (la pantalla ofrece el ticket sin esperar al modelo). */
export function diceQueNoSeResolvio(t: string): boolean {
  return /\b(no (se )?(resolvi[oó]|funcion[oó]|sirvi[oó]|jal[oó])|sigue (igual|sin)|no me (sale|deja|aparece))\b/i.test(t);
}
