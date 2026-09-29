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

/** Modelo fijo (29 de septiembre de 2026, pedido del dueño: Haiku vendía como catálogo). */
export const MODELO_IA = "claude-sonnet-5";
/** Dos mensajes cortos no necesitan más, y acota el gasto por respuesta. */
export const MAX_TOKENS_IA = 700;
/**
 * Sin razonamiento extendido: es WhatsApp y cada segundo pensando es un
 * segundo de «escribiendo…». Medido el 29 de septiembre de 2026 con las
 * conversaciones de scripts/auditoria/whatsapp-bot.mjs: con adaptive y
 * esfuerzo bajo, ni más rápido ni mejor formato.
 */
export const OPCIONES_IA = { thinking: { type: "disabled" } } as const;
/** Respuestas de IA por teléfono y día. Al rebasarlo, todo se escala. */
export const TOPE_DIARIO_TELEFONO = 25;
/** Presupuesto mensual global por omisión, en pesos (WHATSAPP_IA_TOPE_MENSUAL_MXN lo cambia). */
export const TOPE_MENSUAL_MXN = 500;
/** Mientras el operador haya contestado hace menos de esto, el agente se calla en ese hilo. */
export const MINUTOS_SILENCIO_HUMANO = 30;

// Tarifario de Sonnet 5 (dólares por millón de tokens). No es contabilidad:
// es un freno de mano.
const USD_POR_MTOK_IN = 2.0;
const USD_POR_MTOK_OUT = 10.0;
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

// ───────────────────────────── capturas del demo

/**
 * Capturas reales del demo (Patitas & Co., datos inventados), tomadas en
 * tamaño celular: public/peludesk/whatsapp/<clave>.jpg. El pie lo pone el
 * código, no el modelo: así nunca describe algo que la imagen no muestra.
 */
export const CAPTURAS = {
  estetica: "Así se ve la agenda de estética: una columna por estilista y sin citas encimadas.",
  caja: "La caja del día: lo que falta cobrar y cada cuenta abierta, en una sola pantalla.",
  hotel: "La ocupación de la casa: cuánto cupo queda de día y de noche, varios días adelante.",
  vacunas: "El expediente avisa qué vacuna venció y no deja reservar hasta que se registre la nueva.",
} as const;
export type ClaveCaptura = keyof typeof CAPTURAS;
export const esCaptura = (x: string): x is ClaveCaptura => Object.hasOwn(CAPTURAS, x);

/** Separa dos mensajes seguidos en la respuesta del modelo. */
export const SEPARADOR_MENSAJES = "===";
const MARCA_CAPTURA = /^[ \t]*\[\[captura:([a-z]+)\]\][ \t]*$/gm;

export type PiezaSalida = { tipo: "texto"; cuerpo: string } | { tipo: "captura"; clave: ClaveCaptura };

/**
 * La respuesta del modelo en piezas, en orden: textos (partidos por el
 * separador) y a lo más UNA captura, solo si viene al caso y no repite.
 * `yaMandadas`: las capturas de este hilo; `ultimaFueCaptura`: si lo último
 * que mandó el bot fue una imagen (nunca dos seguidas). Nunca más de dos
 * textos: lo que sobre se junta en el segundo.
 */
export function piezasDeSalida(texto: string, yaMandadas: Set<string>, ultimaFueCaptura: boolean): PiezaSalida[] {
  const piezas: PiezaSalida[] = [];
  let captura = false;
  let anterior = 0;
  const empujarTexto = (bruto: string) => {
    for (const parte of bruto.split(new RegExp(`^[ \\t]*${SEPARADOR_MENSAJES}[ \\t]*$`, "m"))) {
      const t = parte.trim();
      if (t) piezas.push({ tipo: "texto", cuerpo: t });
    }
  };
  for (const m of (texto ?? "").matchAll(MARCA_CAPTURA)) {
    empujarTexto(texto.slice(anterior, m.index));
    anterior = (m.index ?? 0) + m[0].length;
    const clave = m[1];
    const ultima = piezas[piezas.length - 1];
    const tocaImagen = esCaptura(clave) && !captura && !yaMandadas.has(clave) && !(piezas.length === 0 && ultimaFueCaptura) && ultima?.tipo !== "captura";
    if (tocaImagen) {
      piezas.push({ tipo: "captura", clave });
      captura = true;
    }
  }
  empujarTexto(texto.slice(anterior));
  // Más de dos textos: el segundo se queda con el resto.
  const textos = piezas.filter((p) => p.tipo === "texto");
  if (textos.length > 2) {
    const segundo = textos[1];
    for (const extra of textos.slice(2)) {
      (segundo as { cuerpo: string }).cuerpo += `\n\n${(extra as { cuerpo: string }).cuerpo}`;
      piezas.splice(piezas.indexOf(extra), 1);
    }
  }
  // Una imagen al final de todo, después del link, se pierde: va antes del último texto.
  if (piezas.length >= 2 && piezas[piezas.length - 1].tipo === "captura") {
    const img = piezas.pop()!;
    piezas.splice(piezas.length - 1, 0, img);
  }
  return piezas;
}

/** Cómo queda apuntada una captura en el historial del hilo (el modelo la ve así). */
export function textoCaptura(clave: ClaveCaptura): string {
  return `[[captura:${clave}]] ${CAPTURAS[clave]}`;
}

// ───────────────────────────── system prompt

// La voz de la landing de PeluDesk: de quien conoce el día a día, corto y
// sin frases de agencia.
const ESTILO = [
  "ESTILO:",
  "- Español de México, de tú, humano y cercano. Como alguien que conoce el día a día de una guardería o una estética, no como una agencia.",
  "- Nunca voseo: «eres, quieres, tienes, te registras, completas», jamás «sos, querés, tenés, te registrás, completás».",
  "- Contesta lo que preguntaron y nada más. Nada de frases hechas: nunca «¡Excelente pregunta!», «solución integral», «potencia tu negocio», «lleva tu negocio al siguiente nivel», «estoy aquí para ayudarte».",
  "- No firmes, no saludes de más y no cierres con «¿algo más en que te pueda ayudar?».",
  "",
  "FORMATO (esto es WhatsApp y se lee en el celular):",
  "- Un renglón en blanco entre cada idea. Cada párrafo es UNA frase corta, de dos renglones en el celular como mucho (unas 15 palabras). Mal: «PeluDesk te ordena la agenda de estética: una columna por estilista, sin encimar citas, y los precios salen solos». Bien: «Tu agenda queda con una columna por estilista.» (renglón en blanco) «Y ya no se te enciman las citas.»",
  "- Vale igual para las dudas de uso: «Se conecta en Administración → Cobro con terminal.» (renglón en blanco) «Ahí ligas tu cuenta de Mercado Pago.» Una frase con comas que pase de 15 palabras son dos frases.",
  "- Cada mensaje, máximo cuatro párrafos cortos. Si hay que decir más, pártelo en DOS mensajes seguidos: escribe una línea que diga solo === entre los dos. O mejor, pregunta y espera la respuesta.",
  "- Negritas con UN asterisco (*así*), solo para el dato clave (un precio, «15 días gratis»). Nunca ** doble. Nada de Markdown: ni #, ni listas, ni viñetas.",
  "- Los links van completos y solos en su propio renglón, al final del mensaje. Un solo link por mensaje. Si ofreces un link, mándalo ahí mismo; nunca «te mando el link».",
  "- Como mucho un emoji por mensaje, al principio de una línea y nunca al final. Si dudas, no pongas.",
].join("\n");

const IMAGENES = [
  "IMÁGENES (capturas reales del demo):",
  "- Puedes mandar UNA captura escribiendo en su propio renglón [[captura:clave]] (el pie lo pone el sistema). Claves:",
  ...Object.entries(CAPTURAS).map(([k, pie]) => `  · ${k}: ${pie}`),
  "- Solo cuando viene al caso por lo que la persona contó: agenda en libreta o citas encimadas → estetica; cobros, cuentas o el corte de caja → caja; hotel o cupo → hotel; vacunas o cartillas → vacunas.",
  "- Una por tema y nunca dos seguidas. Si ya la mandaste en esta conversación (la ves en el historial como [[captura:...]]), no la repitas. Ponla antes del renglón del link.",
  "- Si la persona no ha contado nada de cómo trabaja, no mandes imagen.",
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

/** El precio con el que se abre: el plan más barato, al mes. */
export function precioDesde(planes: PlanPublico[]): number | null {
  const mensuales = planes.filter((p) => p.tipo === "plan" && p.mensual > 0).map((p) => p.mensual);
  return mensuales.length ? Math.min(...mensuales) : null;
}

function bloquePlanes(planes: PlanPublico[]): string {
  if (planes.length === 0) return "PLANES Y PRECIOS: no hay planes publicados ahora mismo. Si preguntan precios, escala.";
  const desde = precioDesde(planes);
  const lineas = planes.map((p) => {
    const desc = p.descripcion ? ` ${p.descripcion}` : "";
    if (p.tipo === "complemento") {
      return (
        `- «${p.nombre}»: se da de REGALO si completa su perfil en la primera semana de la prueba. ` +
        `Solo si pregunta qué pasa si no lo completa: ${pesos(p.mensual)} al mes + IVA. Nunca la ofrezcas primero como extra con precio.`
      );
    }
    const mods = p.modulos.length ? ` Módulos (para ti, no para listarlos): ${p.modulos.join(", ")}.` : "";
    return `- Plan ${p.nombre}: ${pesos(p.mensual)} al mes + IVA.${desc}${mods} [Pago anual, SOLO si pregunta por pagar el año: ${pesos(p.anual)} + IVA; nunca lo menciones por tu cuenta.]`;
  });
  return [
    "PLANES Y PRECIOS (de la base, vigentes hoy; caja y clientes van en todos):",
    ...(desde ? [`- Desde ${pesos(desde)} al mes + IVA.`] : []),
    ...lineas,
  ].join("\n");
}

/** Un escalamiento sin motivo real («placeholder», vacío): el modelo se trabó, no hay duda que escalar. */
export function escalamientoVacio(resumen: unknown): boolean {
  const t = String(resumen ?? "").trim();
  return t.length < 12 || /^(placeholder|resumen|n\/?a|todo|xxx+|\.\.\.)$/i.test(t);
}

function comoVender(ctx: ContextoAgente): string {
  const desde = precioDesde(ctx.planes);
  return [
    "CÓMO VENDES:",
    desde
      ? [
          "- El precio, solo cuando lo pregunten, y siempre directo: nunca contestes «¿cuánto cuesta?» solo con una pregunta.",
          `- Si NO sabes qué servicios tiene: el PRIMER renglón es «Desde *${pesos(desde)} al mes + IVA*, y los primeros *15 días son gratis*, sin tarjeta». Después le preguntas qué tiene (guardería, hotel o estética) para darle su plan.`,
          "- Si YA sabes qué servicios tiene (lo dijo en este mensaje o antes en la conversación): directo el precio de SU plan en negritas con los 15 días gratis, sin «desde»: «Para guardería y estética te toca el Plan Completo: *$X al mes + IVA*, y los primeros *15 días son gratis*, sin tarjeta».",
        ].join("\n")
      : "- No hay precios publicados: si preguntan, escala.",
    "- Precio anual solo si lo pregunta.",
    "- Nunca listes módulos ni funciones, ni en una frase con comas («agenda, precios, inventario y caja» es un catálogo), ni digas «trae todo: esto, esto y lo demás». Escoge UNA cosa que le quite de encima, la que va con lo que te contó: la libreta, los recordatorios que manda a mano por WhatsApp, el corte de caja que no cuadra, las vacunas vencidas que se le pasan.",
    "- Pregúntale cómo lo lleva hoy (libreta, Excel, WhatsApp, otra app) y conecta su respuesta con lo que PeluDesk le resuelve, con la captura que corresponda.",
    "- Si ya usa otra app, no la critiques: pregúntale qué le falta o qué le cuesta trabajo, y conecta con eso. Nunca prometas migrar sus datos.",
    "- La página web es un regalo: «si completas tu perfil en la primera semana, tu página web te queda gratis para siempre». Nunca la ofrezcas primero como extra con precio.",
    "- Cada respuesta termina empujando a UN siguiente paso concreto, con su link en el último renglón: ver el demo o empezar la prueba. Aunque le hagas una pregunta, el último renglón es ese link (demo si apenas está conociendo; prueba si ya se interesó o quiere meter sus datos).",
    "- Un solo link por mensaje: nunca el demo y la prueba juntos. Escoge el que va con lo que pidió.",
    `- Los dos links NO los escribes tú: pon en su propio renglón [[link:demo]] o [[link:prueba]] y el sistema pone la dirección (demo: ${ctx.enlaces.demo} · prueba: ${ctx.enlaces.registro}; así se ven en el historial y son los correctos).`,
    "- Si no sabes qué negocio tiene, pregúntale «¿Qué tienes: guardería, hotel o estética?». Quien pregunta por PeluDesk casi siempre es dueño o encargado de un negocio, no dueño de un perro.",
    "- Si te cuenta que lo lleva en libreta, Excel o WhatsApp, manda la captura de lo que más le duele (estética → estetica; guardería u hotel → hotel; cobros → caja; vacunas → vacunas).",
  ].join("\n");
}

/** Los links que el modelo pide por nombre (nunca los escribe: una vez se comió los dos puntos del puerto). */
export function ponerLinks(texto: string, enlaces: { demo: string; registro: string }): string {
  return (texto ?? "").replace(/\[\[link:(demo|prueba)\]\]/g, (_, cual: string) => (cual === "demo" ? enlaces.demo : enlaces.registro));
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
        "Tu trabajo es que vea si le sirve y dé el siguiente paso (demo o prueba).",
        "",
        comoVender(ctx),
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
        "Si pregunta por PeluDesk para un negocio propio, trátalo como posible cliente:",
        "",
        comoVender(ctx),
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
    IMAGENES,
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
