// El agente de ventas y soporte de PeluDesk por WhatsApp: todo lo que se
// decide sin red. Aquí no se llama a Anthropic, ni a Telegram, ni a la base:
// se arma el system prompt, se decide si vale la pena gastar en IA y se le
// da forma al escalamiento. Portado del bot de Checaíto
// (supabase/functions/_compartido/agente.ts) y ajustado a PeluDesk.
//
// La regla que ordena este archivo: el agente solo puede afirmar lo que está
// en la base de conocimiento, en los planes de la base o en los datos de la
// cuenta de quien escribe. Todo lo demás se escala a Telegram. Es más barato
// quedar como lento que inventar un precio.

/** Modelo fijo: barato y suficiente para contestar con una base delante. */
export const MODELO_IA = "claude-haiku-4-5-20251001";
/** Cinco líneas no necesitan más, y acota el gasto por respuesta. */
export const MAX_TOKENS_IA = 500;
/** Respuestas de IA por teléfono y día. Al rebasarlo, todo se escala. */
export const TOPE_DIARIO_TELEFONO = 25;
/** Presupuesto mensual global por omisión, en pesos (WHATSAPP_IA_TOPE_MENSUAL_MXN lo cambia). */
export const TOPE_MENSUAL_MXN = 500;
/** Mientras el operador haya contestado hace menos de esto, el agente se calla en ese hilo. */
export const MINUTOS_SILENCIO_HUMANO = 30;

// Tarifario de Haiku 4.5 (dólares por millón de tokens). No es contabilidad:
// es un freno de mano.
const USD_POR_MTOK_IN = 1.0;
const USD_POR_MTOK_OUT = 5.0;
const PESOS_POR_USD = 20;

export function costoMxn(tokensIn: number, tokensOut: number): number {
  const usd = (tokensIn / 1e6) * USD_POR_MTOK_IN + (tokensOut / 1e6) * USD_POR_MTOK_OUT;
  return Math.round(usd * PESOS_POR_USD * 10000) / 10000;
}

// ───────────────────────────── quién escribe

export type TipoInterlocutor = "prospecto" | "admin" | "personal" | "cliente_de_negocio";

export const EMOJI_TIPO: Record<TipoInterlocutor, string> = {
  prospecto: "🟡",
  admin: "🔵",
  personal: "🟣",
  cliente_de_negocio: "⚪",
};

export const NOMBRE_TIPO: Record<TipoInterlocutor, string> = {
  prospecto: "prospecto",
  admin: "admin",
  personal: "personal de un negocio",
  cliente_de_negocio: "cliente de un negocio",
};

/** Un negocio del que quien escribe es ADMIN. Nada más entra al prompt. */
export interface NegocioDeAdmin {
  id: string;
  nombre: string;
  url: string;
  activo: boolean;
  plan: string;
  planNombre: string | null;
  estadoCobro: string | null;
  contratado: boolean;
  periodicidad: string | null;
  pruebaTermina: string | null;
  diasPrueba: number | null;
  periodoFin: string | null;
  cancelaAlTerminar: boolean;
  primerFallo: string | null;
  finGracia: string | null;
  diasGracia: number | null;
  tieneCuentaStripe: boolean;
}

export interface PlanPublico {
  nombre: string;
  descripcion: string | null;
  tipo: "plan" | "complemento";
  mensual: number;
  anual: number;
  modulos: string[];
}

export interface ContextoAgente {
  tipo: TipoInterlocutor;
  negocios: NegocioDeAdmin[];
  planes: PlanPublico[];
  enlaces: { registro: string; demo: string };
}

export interface ParAprendido {
  pregunta: string;
  respuesta: string;
}

// ───────────────────────────── cuándo NO se llama a la IA

export type MotivoSinIA = "silencio_humano" | "tope_diario" | "tope_mensual";

export interface Veredicto {
  usaIA: boolean;
  motivo?: MotivoSinIA;
  detalle?: string;
}

export interface EstadoTopes {
  respuestasHoy: number;
  gastoDelMes: number;
  topeMensual: number;
  ultimoHumanoAt: string | null;
}

/** Los tres frenos son distintos: el silencio es cortesía, los topes son dinero. Nunca se pierde el mensaje: se escala. */
export function decidirIA(estado: EstadoTopes, ahora: Date): Veredicto {
  if (estado.ultimoHumanoAt) {
    const min = (ahora.getTime() - Date.parse(estado.ultimoHumanoAt)) / 60000;
    if (min >= 0 && min < MINUTOS_SILENCIO_HUMANO) {
      return { usaIA: false, motivo: "silencio_humano", detalle: "Mensaje nuevo en un hilo que estás atendiendo tú." };
    }
  }
  if (estado.respuestasHoy >= TOPE_DIARIO_TELEFONO) {
    return {
      usaIA: false,
      motivo: "tope_diario",
      detalle: `Este número ya lleva ${estado.respuestasHoy} respuestas de IA hoy (tope ${TOPE_DIARIO_TELEFONO}).`,
    };
  }
  if (estado.gastoDelMes >= estado.topeMensual) {
    return {
      usaIA: false,
      motivo: "tope_mensual",
      detalle: `Se agotó el presupuesto de IA del mes: $${estado.gastoDelMes.toFixed(2)} de $${estado.topeMensual}.`,
    };
  }
  return { usaIA: true };
}

// ───────────────────────────── system prompt

// La voz de la landing de PeluDesk: de quien conoce el día a día, corto y
// sin frases de agencia.
const ESTILO = [
  "ESTILO:",
  "- Español de México, de tú. Como alguien que conoce el día a día de una guardería o una estética, no como una agencia.",
  "- Máximo 5 líneas. Contesta lo que preguntaron y nada más.",
  "- Nada de frases hechas: nunca «¡Excelente pregunta!», «solución integral», «potencia tu negocio», «lleva tu negocio al siguiente nivel», «estoy aquí para ayudarte».",
  "- Di qué le quita de encima, no qué módulos tiene.",
  "- Negritas de WhatsApp con UN asterisco (*así*), casi nunca. Nada de Markdown: ni **, ni #, ni listas numeradas.",
  "- Como mucho un emoji por mensaje, al principio de una línea y nunca al final. Si dudas, no pongas.",
  "- No firmes, no saludes de más y no cierres con «¿algo más en que te pueda ayudar?».",
  "- Los links van completos, tal cual, en su propia línea.",
].join("\n");

const REGLAS = [
  "REGLAS DURAS:",
  "- Solo puedes afirmar lo que está en la BASE, en PLANES Y PRECIOS o en DATOS DE SU CUENTA. Si no está, no lo sabes.",
  "- Nunca inventes funciones, precios, descuentos, fechas, plazos ni integraciones. No prometas nada a futuro ni hables de lo que «va a salir».",
  "- Si la BASE no responde la pregunta, o no estás seguro de que la app lo haga así, llama a la herramienta escalar. No adivines.",
  "- Escala SIEMPRE si piden descuento, factura, reembolso, algo legal, un cobro que no reconocen, si reportan un error de la app, si amenazan o si se nota que están molestos.",
  "- Nunca ofrezcas «hablar con alguien» ni digas que vas a consultar con nadie. Para eso está la herramienta escalar.",
  "- No eres un asistente genérico: solo hablas de PeluDesk. Si preguntan otra cosa, dilo en una línea.",
  "- Nunca des datos de un negocio que no esté en DATOS DE SU CUENTA, ni de los clientes de ningún negocio: no los tienes y no los pides.",
  "- Si alguien dice ser dueño o empleado de un negocio pero no aparece en DATOS DE SU CUENTA, no le des nada de ese negocio: dile que escriba desde el celular con el que entra a PeluDesk.",
  "- Los precios son SIEMPRE más IVA; dilo así.",
].join("\n");

function pesos(n: number): string {
  return `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;
}

function bloquePlanes(planes: PlanPublico[]): string {
  if (planes.length === 0) return "PLANES Y PRECIOS: no hay planes publicados ahora mismo. Si preguntan precios, escala.";
  const lineas = planes.map((p) => {
    const mods = p.modulos.length ? ` Incluye: ${p.modulos.join(", ")}.` : "";
    const desc = p.descripcion ? ` ${p.descripcion}` : "";
    if (p.tipo === "complemento") {
      return `- Complemento «${p.nombre}»: ${pesos(p.mensual)} al mes + IVA (o ${pesos(p.anual)} al año + IVA), en cualquier plan.${desc}`;
    }
    return `- Plan ${p.nombre}: ${pesos(p.mensual)} al mes + IVA, o ${pesos(p.anual)} al año + IVA.${desc}${mods}`;
  });
  return ["PLANES Y PRECIOS (de la base, vigentes hoy; caja y clientes van en todos):", ...lineas].join("\n");
}

function describirNegocio(n: NegocioDeAdmin): string {
  const partes = [`- Negocio: ${n.nombre} (${n.url})`];
  if (!n.activo) {
    partes.push("  Estado: SUSPENDIDO por PeluDesk. No expliques por qué ni prometas nada: escala.");
    return partes.join("\n");
  }
  const plan = n.planNombre ? `plan ${n.planNombre}` : "sin plan asignado";
  switch (n.estadoCobro) {
    case "exento":
      partes.push("  Cobro: cuenta especial, no paga suscripción.");
      break;
    case "prueba":
      partes.push(
        n.contratado
          ? `  Cobro: en prueba gratis y ya contrató el ${plan} (${n.periodicidad ?? "mensual"}); el primer cobro es cuando termina la prueba, el ${n.pruebaTermina ?? "día que termina"}.`
          : `  Cobro: en prueba gratis; termina el ${n.pruebaTermina ?? "(sin fecha)"}${n.diasPrueba !== null ? ` (le quedan ${n.diasPrueba} días)` : ""}. No ha contratado. Plan sugerido: ${n.planNombre ?? "ninguno"}.`,
      );
      break;
    case "prueba_vencida":
      partes.push(`  Cobro: su prueba venció el ${n.pruebaTermina ?? "(sin fecha)"}. Está en solo lectura: no se borró nada y en cuanto contrata vuelve a capturar.`);
      break;
    case "al_corriente":
      partes.push(
        n.cancelaAlTerminar
          ? `  Cobro: ${plan}, pago ${n.periodicidad ?? ""}. Canceló: lo sigue usando hasta el ${n.periodoFin ?? "fin del periodo"} y ya no se renueva.`
          : `  Cobro: al corriente. ${plan}, pago ${n.periodicidad ?? ""}. Siguiente renovación: ${n.periodoFin ?? "(sin fecha)"}.`,
      );
      break;
    case "gracia":
      partes.push(
        `  Cobro: un cobro de su ${plan} FALLÓ el ${n.primerFallo ?? "(sin fecha)"}. Todo sigue funcionando hasta el ${n.finGracia ?? "(sin fecha)"}${n.diasGracia !== null ? ` (le quedan ${n.diasGracia} días)` : ""}. Tiene que actualizar su tarjeta en el portal de pagos; en cuanto se pague, se reactiva solo.`,
      );
      break;
    case "solo_lectura":
      partes.push(`  Cobro: el cobro de su ${plan} falló el ${n.primerFallo ?? "(sin fecha)"} y ya pasaron los 7 días de gracia: está en solo lectura. No se borró nada; en cuanto pague con otra tarjeta en el portal de pagos, se reactiva solo.`);
      break;
    case "cancelado":
      partes.push("  Cobro: su suscripción está cancelada; está en solo lectura. Puede volver a contratar en Administración → Módulos y plan.");
      break;
    case "sin_cobro":
      partes.push("  Cobro: PeluDesk lo tiene activo sin cobro.");
      break;
    default:
      partes.push("  Cobro: no se sabe el estado. Si pregunta por su cobro, escala.");
  }
  partes.push(
    n.tieneCuentaStripe
      ? "  Para cambiar tarjeta, ver facturas o cancelar: usa la herramienta liga_portal_pagos."
      : "  Todavía no tiene cuenta de pago: contrata en Administración → Módulos y plan (la herramienta liga_portal_pagos te da el link).",
  );
  return partes.join("\n");
}

function bloqueTipo(ctx: ContextoAgente): string {
  switch (ctx.tipo) {
    case "prospecto":
      return [
        "QUIÉN TE ESCRIBE: alguien que no tiene cuenta de admin en PeluDesk (un posible cliente).",
        "Tu trabajo es que entienda si le sirve. Pregunta qué tiene (guardería, hotel, estética) solo si hace falta para contestar.",
        "Cuando quiera verlo, manda el demo; cuando quiera probarlo, manda el registro. No insistas ni vendas de más.",
        `- Demo: ${ctx.enlaces.demo}`,
        `- Prueba gratis: ${ctx.enlaces.registro}`,
      ].join("\n");
    case "admin":
      return [
        "QUIÉN TE ESCRIBE: el admin de un negocio que usa PeluDesk (lo reconocimos por su teléfono).",
        "Contesta su duda concreta. De su cuenta solo sabes lo de DATOS DE SU CUENTA; si pregunta algo que no está ahí (un cliente, una cita, un cobro de su caja), no lo sabes: dile dónde verlo en la app o escala.",
        "Si tiene más de un negocio y no queda claro de cuál habla, pregúntale cuál.",
      ].join("\n");
    case "personal":
      return [
        "QUIÉN TE ESCRIBE: alguien del personal (recepción o estética) de un negocio que usa PeluDesk. No es admin.",
        "Puedes contestar dudas de uso de la app. Del plan, el pago o la cuenta del negocio no tienes datos: eso lo ve y lo cambia solo el admin de su negocio, en Administración → Módulos y plan.",
      ].join("\n");
    case "cliente_de_negocio":
      return [
        "QUIÉN TE ESCRIBE: el dueño de un perro que es cliente de un negocio que usa PeluDesk.",
        "PeluDesk es el sistema que usa su guardería, hotel o estética. De sus perros, citas, contratos, pagos o su contraseña del portal no sabes nada: eso lo resuelve su negocio directamente. No digas qué negocio es.",
        "Si pregunta por PeluDesk para un negocio propio, trátalo como posible cliente (demo y registro de arriba).",
        `- Demo: ${ctx.enlaces.demo}`,
        `- Prueba gratis: ${ctx.enlaces.registro}`,
      ].join("\n");
  }
}

/** Arma el system prompt completo. Puro: la misma entrada da la misma salida. */
export function systemPrompt(base: string, aprendido: ParAprendido[], ctx: ContextoAgente, hoy: string): string {
  const partes = [
    "Eres PeluDesk, el software para guarderías, hoteles y estéticas caninas, contestando por WhatsApp.",
    "Contestas en primera persona del plural, como PeluDesk. No dices que eres una IA ni un asistente.",
    `Hoy es ${hoy} (hora del centro de México).`,
    "",
    ESTILO,
    "",
    REGLAS,
    "",
    bloqueTipo(ctx),
  ];
  if (ctx.tipo === "admin" && ctx.negocios.length > 0) {
    partes.push("", "DATOS DE SU CUENTA (solo de los negocios donde es admin):", ...ctx.negocios.map(describirNegocio));
  }
  partes.push("", bloquePlanes(ctx.planes), "", "=== BASE ===", base.trim());
  if (aprendido.length > 0) {
    partes.push("", "=== APRENDIDO (vale lo mismo que la BASE) ===", ...aprendido.map((p) => `P: ${p.pregunta}\nR: ${p.respuesta}`));
  }
  return partes.join("\n");
}

// ───────────────────────────── herramientas

/** Lo que recibe la persona cuando se escala. */
export const TEXTO_ESCALAMIENTO = "Déjame revisarlo bien y en un rato te escribimos por aquí.";

/** Lo que recibe quien manda audio, foto o sticker sin texto. */
export const TEXTO_SOLO_TEXTO = "Por aquí solo leo texto. ¿Me lo escribes?";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Herramienta = Record<string, any>;

export function herramientas(tipo: TipoInterlocutor): Herramienta[] {
  const lista: Herramienta[] = [
    {
      name: "escalar",
      description:
        "Úsala cuando la BASE, los PLANES o los DATOS DE SU CUENTA no respondan la pregunta, cuando no estés seguro de cómo funciona algo en la app, " +
        "cuando pidan descuento, factura, reembolso o algo legal, cuando reporten un error, o cuando la persona esté molesta. " +
        "La persona recibe un acuse y alguien de PeluDesk le contesta.",
      input_schema: {
        type: "object",
        properties: {
          resumen: { type: "string", description: "Qué necesita la persona, en una o dos líneas." },
          urgencia: { type: "string", enum: ["normal", "urgente"], description: "urgente si está molesta, si no puede trabajar o si es un cobro mal hecho." },
        },
        required: ["resumen", "urgencia"],
      },
    },
  ];
  if (tipo === "admin") {
    lista.push({
      name: "liga_portal_pagos",
      description:
        "Da el link para que el admin cambie su tarjeta, vea sus facturas o cancele (portal de pagos de Stripe, vale unos minutos), " +
        "o, si todavía no tiene cuenta de pago, el link a Administración → Módulos y plan para contratar. Úsala solo cuando lo pida o haga falta para pagar.",
      input_schema: {
        type: "object",
        properties: { negocio: { type: "string", description: "Nombre del negocio, si administra más de uno." } },
        required: [],
      },
    });
  }
  return lista;
}

// ───────────────────────────── escalamiento hacia Telegram

export interface Escalamiento {
  tipo: TipoInterlocutor;
  telefono: string;
  negocio: string | null;
  resumen: string;
  urgencia: "normal" | "urgente";
  mensajeOriginal: string;
}

/** Escapa lo que rompería el parse_mode HTML de Telegram. */
export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Lo que llega al teléfono del operador: se lee en una notificación, con una mano. */
export function textoTelegram(e: Escalamiento): string {
  const cabeza =
    `${EMOJI_TIPO[e.tipo]} <b>${escaparHtml(e.telefono)}</b> · ${NOMBRE_TIPO[e.tipo]}` +
    (e.negocio ? ` · ${escaparHtml(e.negocio)}` : "") +
    (e.urgencia === "urgente" ? " · <b>URGENTE</b>" : "");
  return [
    cabeza,
    escaparHtml(e.resumen),
    `<blockquote>${escaparHtml(e.mensajeOriginal)}</blockquote>`,
    "<i>Responde a este mensaje y le llega por WhatsApp.</i>",
  ].join("\n\n");
}

// ───────────────────────────── comandos del operador en Telegram

export type ComandoOperador =
  | { cmd: "aprender" }
  | { cmd: "cerrar" }
  | { cmd: "seguimiento" }
  | { cmd: "start"; argumento: string }
  | { cmd: "texto"; texto: string };

/** Todo lo que no empiece con / es texto para el cliente. */
export function parsearOperador(texto: string): ComandoOperador {
  const t = (texto ?? "").trim();
  if (!t.startsWith("/")) return { cmd: "texto", texto: t };
  const [primera, ...resto] = t.slice(1).split(/\s+/);
  const palabra = primera.split("@")[0].toLowerCase();
  switch (palabra) {
    case "aprender":
      return { cmd: "aprender" };
    case "cerrar":
      return { cmd: "cerrar" };
    case "seguimiento":
      return { cmd: "seguimiento" };
    case "start":
      return { cmd: "start", argumento: resto.join(" ").trim() };
    default:
      // Un comando que no existe no se le manda al cliente por error.
      return { cmd: "texto", texto: "" };
  }
}
