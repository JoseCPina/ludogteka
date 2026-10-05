// El soporte por WhatsApp de PeluDesk: el agente que contesta y el hilo por
// el que el operador toma el control desde Telegram. Portado del bot de
// Checaíto (supabase/functions/_compartido/soporte.ts).
//
// Depende de puertos, no de Supabase ni de HTTP: las pruebas inyectan dobles
// y corren sin red (scripts/auditoria/whatsapp-bot.mjs). Las implementaciones
// de verdad están en ./infra.ts.
//
// Dos decisiones que explican casi todo:
//   1. Lo que el agente sabe de un negocio lo decide la BASE
//      (bot_cuenta_por_telefono, con el teléfono que Meta verificó), nunca lo
//      que la persona dice ser. El modelo no tiene ninguna herramienta que
//      lea datos de un negocio.
//   2. Cuando hay duda, se escala. Un escalamiento cuesta un mensaje de
//      Telegram; una respuesta inventada cuesta un cliente.

import { URL_AVISO_PRIVACIDAD } from "@/lib/peludesk/legal";
import {
  type ClaveCaptura,
  type ContextoAgente,
  costoMxn,
  CAPTURAS,
  decidirIA,
  escalamientoVacio,
  type Escalamiento,
  herramientas,
  type NegocioDeAdmin,
  type ParAprendido,
  parsearOperador,
  type PiezaSalida,
  piezasDeSalida,
  ponerLinks,
  SEPARADOR_MENSAJES,
  type SeguimientoContexto,
  systemPrompt,
  TEXTO_ESCALAMIENTO,
  textoCaptura,
  textoTelegram,
  type TipoInterlocutor,
} from "./agente";
import { aFormatoWhatsApp, enDosSiEsLargo, formatoDelBot, hayQueReescribir, juntarCortos, unLinkAlFinal } from "./texto";

// ───────────────────────────── puertos

export interface Hilo {
  telefono: string;
  tipo: TipoInterlocutor;
  negocioId: string | null;
  negocioNombre: string | null;
  resumen: string | null;
  urgencia: "normal" | "urgente";
  estado: "abierto" | "cerrado";
  telegramMessageId: number | null;
  ultimoHumanoAt: string | null;
}

export type QuienHabla = "usuario" | "agente" | "humano";

export interface MensajeHilo {
  quien: QuienHabla;
  texto: string;
}

export interface UsoIA {
  telefono: string;
  tokensIn: number;
  tokensOut: number;
  costoMxn: number;
  resultado: "respondio" | "escalo" | "error";
}

export interface DatosSoporte {
  config(clave: string): Promise<string | null>;
  guardarConfig(clave: string, valor: string | null): Promise<void>;
  hiloPorTelefono(telefono: string): Promise<Hilo | null>;
  hiloPorMensajeTelegram(messageId: number): Promise<Hilo | null>;
  guardarHilo(h: Hilo): Promise<void>;
  apuntarMensaje(telefono: string, quien: QuienHabla, texto: string): Promise<void>;
  ultimosMensajes(telefono: string, limite: number): Promise<MensajeHilo[]>;
  aprendido(limite: number): Promise<ParAprendido[]>;
  aprender(pregunta: string, respuesta: string, origen: string): Promise<void>;
  respuestasIADesde(telefono: string, desdeIso: string): Promise<number>;
  gastoIADesde(desdeIso: string): Promise<number>;
  registrarUsoIA(u: UsoIA): Promise<void>;
  /** ¿Escribió esa persona en las últimas 24 h? (ventana de servicio de WhatsApp) */
  ventanaAbierta(telefono: string): Promise<boolean>;
}

export interface TicketsBandeja {
  /** El ticket del aviso al que se respondió (o null si no es de un ticket). */
  porMensaje(messageId: number): Promise<{ id: string; numero: number } | null>;
  responder(ticketId: string, texto: string): Promise<string>;
  estado(ticketId: string, estado: "en_proceso" | "resuelto"): Promise<string>;
}

export interface Telegram {
  enviar(chatId: number, htmlTexto: string, responderA?: number): Promise<number | null>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BloqueIA = any;

export interface RespuestaIA {
  texto: string;
  usos: { id: string; nombre: string; entrada: Record<string, unknown> }[];
  tokensIn: number;
  tokensOut: number;
  bloques: BloqueIA[];
}

export interface IA {
  responder(system: string | BloqueIA[], mensajes: BloqueIA[], tools: BloqueIA[]): Promise<RespuestaIA>;
}

export interface SalidaWA {
  texto(a: string, cuerpo: string): Promise<{ ok: boolean }>;
  plantilla(a: string, nombre: string): Promise<{ ok: boolean }>;
  /** Una captura del demo con su pie (la imagen se sube una vez y se reusa). */
  captura(a: string, clave: ClaveCaptura, pie: string): Promise<{ ok: boolean }>;
}

/** Lo que el bot sabe de quien escribe. Lo resuelve la base, por teléfono. */
export interface Cuenta {
  tipo: TipoInterlocutor;
  negocios: NegocioDeAdmin[];
}

export interface DepsSoporte {
  datos: DatosSoporte;
  tg: Telegram;
  wa: SalidaWA;
  ia: IA;
  base: string;
  topeMensual: number;
  ahora(): Date;
  /** "28 de septiembre de 2026", en la zona de la plataforma. */
  hoyTexto(): string;
  cuenta(telefono: string): Promise<Cuenta>;
  contexto(cuenta: Cuenta, seguimiento?: SeguimientoContexto | null): Promise<ContextoAgente>;
  /**
   * Los tickets de soporte de la app, que también avisan en esta bandeja.
   * Responder a su aviso contesta el ticket (sin esto, solo hilos de WhatsApp).
   */
  tickets?: TicketsBandeja;
  /** Link al portal de pagos de un negocio DE ESTA cuenta (nunca de otro). */
  ligaPortal(negocio: NegocioDeAdmin): Promise<string>;
  alerta(detalle: string, e?: unknown): void;
}

// ───────────────────────────── entrada desde WhatsApp

export type Desenlace = "respondio" | "escalo" | "callado" | "error";

/** Milisegundos por etapa de una respuesta, para los logs (dónde se va el tiempo). */
export type Tiempos = Record<string, number>;

function cronometro(tiempos: Tiempos | undefined) {
  let marca = Date.now();
  return (etapa: string) => {
    const ahora = Date.now();
    if (tiempos) tiempos[etapa] = (tiempos[etapa] ?? 0) + (ahora - marca);
    marca = ahora;
  };
}

const LIMITE_HISTORIAL = 12;
const LIMITE_APRENDIDO = 60;
export const PLANTILLA_SEGUIMIENTO = "peludesk_seguimiento_v1";
const CLAVE_CHAT_OPERADOR = "telegram_chat_operador";
const CLAVE_CODIGO_INICIO = "telegram_codigo_inicio";

function inicioDelDia(ahora: Date): string {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate())).toISOString();
}
function inicioDelMes(ahora: Date): string {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();
}

function negocioDelHilo(c: Cuenta): { id: string | null; nombre: string | null } {
  if (c.tipo !== "admin" || c.negocios.length === 0) return { id: null, nombre: null };
  return { id: c.negocios[0].id, nombre: c.negocios.map((n) => n.nombre).join(", ") };
}

/**
 * Atiende un mensaje de texto. Nunca lanza: si la IA o la red fallan, se
 * escala y la persona recibe el acuse. Un mensaje sin contestar es peor que
 * uno escalado de más.
 */
export async function atender(telefono: string, texto: string, deps: DepsSoporte, tiempos?: Tiempos, seguimiento?: SeguimientoContexto | null): Promise<Desenlace> {
  const marcar = cronometro(tiempos);
  const ahora = deps.ahora();
  // Todo lo que no depende de nada, a la vez: cada consulta en serie eran
  // cientos de milisegundos antes de siquiera llamar a la IA.
  const historialP = deps.datos.ultimosMensajes(telefono, LIMITE_HISTORIAL);
  const aprendidoP = deps.datos.aprendido(LIMITE_APRENDIDO);
  historialP.catch(() => {});
  aprendidoP.catch(() => {});
  const [cuenta, previo, respuestasHoy, gastoDelMes] = await Promise.all([
    deps.cuenta(telefono),
    deps.datos.hiloPorTelefono(telefono),
    deps.datos.respuestasIADesde(telefono, inicioDelDia(ahora)),
    deps.datos.gastoIADesde(inicioDelMes(ahora)),
  ]);
  const neg = negocioDelHilo(cuenta);
  const hilo: Hilo = {
    telefono,
    tipo: cuenta.tipo,
    negocioId: neg.id,
    negocioNombre: neg.nombre,
    resumen: previo?.resumen ?? null,
    urgencia: previo?.urgencia ?? "normal",
    estado: previo?.estado ?? "abierto",
    telegramMessageId: previo?.telegramMessageId ?? null,
    ultimoHumanoAt: previo?.ultimoHumanoAt ?? null,
  };

  const v = decidirIA(
    {
      respuestasHoy,
      gastoDelMes,
      topeMensual: deps.topeMensual,
      ultimoHumanoAt: hilo.ultimoHumanoAt,
    },
    ahora,
  );
  if (!v.usaIA) {
    // Con el operador en medio de la conversación, no se le manda un acuse
    // automático encima de lo que ya le está escribiendo.
    const callado = v.motivo === "silencio_humano";
    await escalar(hilo, texto, v.detalle ?? "", "normal", deps, { avisar: !callado });
    return callado ? "callado" : "escalo";
  }

  try {
    const [historial, aprendido, ctx] = await Promise.all([historialP, aprendidoP, deps.contexto(cuenta, seguimiento)]);
    marcar("preparar");
    const texto_ = systemPrompt(deps.base, aprendido, ctx, deps.hoyTexto());
    // La documentación de uso (admin y personal) va primero y en caché: es
    // la misma para todos y es lo más largo del prompt.
    const system: string | BloqueIA[] = ctx.documentacion
      ? [
          { type: "text", text: ctx.documentacion, cache_control: { type: "ephemeral" } },
          { type: "text", text: texto_ },
        ]
      : texto_;
    const tools = herramientas(cuenta.tipo);
    const mensajes: BloqueIA[] = [];
    for (const m of historial) {
      const role = m.quien === "usuario" ? "user" : "assistant";
      // La API pide turnos alternados: se juntan los seguidos del mismo lado.
      const ultimo = mensajes[mensajes.length - 1];
      if (ultimo && ultimo.role === role) ultimo.content += `\n\n${m.texto}`;
      else mensajes.push({ role, content: m.texto });
    }
    if (mensajes.length === 0 || mensajes[mensajes.length - 1].role !== "user") mensajes.push({ role: "user", content: texto });
    if (mensajes[0].role !== "user") mensajes.shift();
    return await conversar(telefono, texto, hilo, cuenta, system, mensajes, tools, historial, ctx.enlaces, deps, marcar);
  } catch (e) {
    deps.alerta(`La IA falló para ${telefono}`, e);
    await deps.datos.registrarUsoIA({ telefono, tokensIn: 0, tokensOut: 0, costoMxn: 0, resultado: "error" });
    await escalar(hilo, texto, "La IA no contestó. Revisa tú.", "normal", deps);
    return "error";
  }
}

async function conversar(
  telefono: string,
  texto: string,
  hilo: Hilo,
  cuenta: Cuenta,
  system: string | BloqueIA[],
  mensajes: BloqueIA[],
  tools: BloqueIA[],
  historial: MensajeHilo[],
  enlaces: ContextoAgente["enlaces"],
  deps: DepsSoporte,
  marcar: (etapa: string) => void,
): Promise<Desenlace> {
  // Lo que el modelo escribió ANTES de pedir una herramienta también es
  // respuesta: sin esto se perdía (le contestaba los días de prueba, pedía el
  // link y a la persona solo le llegaba «Ahí puedes contratar…»).
  let escritoAntes = "";
  let reescrita = false;
  let reintentoEscalar = false;
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    let r = await deps.ia.responder(system, mensajes, tools);
    marcar("ia");
    // Llamó a escalar sin motivo («placeholder»): se le pregunta una vez más.
    const vacio = r.usos.find((u) => u.nombre === "escalar" && escalamientoVacio(u.entrada.resumen));
    if (vacio && !reintentoEscalar) {
      reintentoEscalar = true;
      deps.alerta(`La IA escaló sin motivo («${String(vacio.entrada.resumen ?? "")}»); se reintenta`);
      await deps.datos.registrarUsoIA({ telefono, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costoMxn: costoMxn(r.tokensIn, r.tokensOut), resultado: "error" });
      r = await deps.ia.responder(system, mensajes, tools);
      marcar("ia");
    }
    const apuntar = (resultado: UsoIA["resultado"]) =>
      deps.datos.registrarUsoIA({ telefono, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costoMxn: costoMxn(r.tokensIn, r.tokensOut), resultado });

    const esc = r.usos.find((u) => u.nombre === "escalar");
    if (esc) {
      await apuntar("escalo");
      const resumen = escalamientoVacio(esc.entrada.resumen) ? `La IA escaló sin decir por qué. Lo que escribió: «${texto.slice(0, 200)}»` : String(esc.entrada.resumen);
      await escalar(hilo, texto, resumen, esc.entrada.urgencia === "urgente" ? "urgente" : "normal", deps);
      return "escalo";
    }

    const portal = r.usos.find((u) => u.nombre === "liga_portal_pagos");
    if (portal && vuelta < 2) {
      if (r.texto.trim()) escritoAntes += `${r.texto.trim()}\n\n`;
      await apuntar("respondio");
      mensajes.push({ role: "assistant", content: r.bloques });
      mensajes.push({ role: "user", content: [{ type: "tool_result", tool_use_id: portal.id, content: JSON.stringify(await resultadoPortal(cuenta, portal.entrada, deps)) }] });
      continue;
    }

    // Un párrafo de más de dos renglones que no se pudo partir entre frases, o
    // un mensaje de más de cuatro párrafos: se le pide UNA vez que lo
    // reescriba (el borrador no sale ni se guarda).
    if (!reescrita && !r.usos.length && hayQueReescribir(ponerLinks(escritoAntes + r.texto, enlaces), SEPARADOR_MENSAJES)) {
      reescrita = true;
      await apuntar("respondio");
      const borrador = await deps.ia
        .responder(
          system,
          [
            ...mensajes,
            { role: "assistant", content: (escritoAntes + r.texto).trim() },
            { role: "user", content: "[Nota interna de PeluDesk, no es del cliente] Reescribe tu último mensaje igual, con el mismo contenido, pero cada párrafo de UNA frase corta (dos renglones en el celular) y máximo cuatro párrafos por mensaje (si no cabe, junta ideas o quita lo que sobre). Conserva los [[captura:...]], [[link:...]] y === donde estaban. Contesta solo con el mensaje reescrito." },
          ],
          tools,
        )
        .catch(() => null);
      marcar("ia");
      if (borrador?.texto.trim() && !borrador.usos.length) {
        r = borrador;
        escritoAntes = "";
      }
    }

    // Capturas ya mandadas en el hilo y si lo último del bot fue una imagen:
    // una por tema y nunca dos seguidas.
    const delBot = historial.filter((m) => m.quien !== "usuario");
    const yaMandadas = new Set([...historial.map((m) => m.texto).join("\n").matchAll(/\[\[captura:([a-z]+)\]\]/g)].map((m) => m[1]));
    const ultimaFueCaptura = delBot.length > 0 && delBot[delBot.length - 1].texto.startsWith("[[captura:");
    const piezas = piezasDeSalida(ponerLinks(escritoAntes + r.texto, enlaces), yaMandadas, ultimaFueCaptura)
      .flatMap((p): PiezaSalida[] => (p.tipo === "texto" ? unLinkAlFinal(juntarCortos(formatoDelBot(aFormatoWhatsApp(p.cuerpo)))).map((cuerpo) => ({ tipo: "texto", cuerpo })) : [p]))
      .filter((p) => p.tipo !== "texto" || p.cuerpo);
    // Una respuesta de un solo mensaje que se pasó de largo se manda en dos.
    if (piezas.filter((p) => p.tipo === "texto").length === 1) {
      const i = piezas.findIndex((p) => p.tipo === "texto");
      const [uno, dos] = enDosSiEsLargo((piezas[i] as { cuerpo: string }).cuerpo);
      if (dos) piezas.splice(i, 1, { tipo: "texto", cuerpo: uno }, { tipo: "texto", cuerpo: dos });
    }
    // Con un posible cliente, toda respuesta deja un siguiente paso: si el
    // modelo cerró con una pregunta y sin link, va el del demo.
    const ultimoTexto = [...piezas].reverse().find((p) => p.tipo === "texto");
    const textos = piezas.flatMap((p) => (p.tipo === "texto" ? [p.cuerpo] : []));
    if (cuenta.tipo === "prospecto" && ultimoTexto?.tipo === "texto" && !/https?:\/\//.test(textos.join(" "))) {
      ultimoTexto.cuerpo += `\n\nSi quieres ir viendo cómo se ve por dentro:\n\n${enlaces.demo}`;
    }
    // A un número nuevo, en la primera respuesta, una línea corta con el aviso de privacidad.
    if (cuenta.tipo === "prospecto" && delBot.length === 0 && piezas.some((p) => p.tipo === "texto")) {
      piezas.push({ tipo: "texto", cuerpo: `Así cuidamos tus datos: ${URL_AVISO_PRIVACIDAD}` });
    }
    if (!piezas.some((p) => p.tipo === "texto")) {
      await apuntar("escalo");
      await escalar(hilo, texto, "La IA contestó en blanco.", "normal", deps);
      return "escalo";
    }
    await apuntar("respondio");
    let enviados = 0;
    for (const p of piezas) {
      if (p.tipo === "captura") {
        // Una imagen que no sale no detiene la respuesta: el texto es lo que importa.
        const c = await deps.wa.captura(telefono, p.clave, CAPTURAS[p.clave]);
        if (c.ok) await deps.datos.apuntarMensaje(telefono, "agente", textoCaptura(p.clave));
        else deps.alerta(`No salió la captura ${p.clave} a ${telefono}`);
        continue;
      }
      const env = await deps.wa.texto(telefono, p.cuerpo);
      if (!env.ok) {
        if (enviados === 0) {
          await escalar(hilo, texto, "WhatsApp rechazó la respuesta del bot. Revisa tú.", "normal", deps, { avisar: false });
          return "error";
        }
        deps.alerta(`WhatsApp rechazó la segunda parte de la respuesta a ${telefono}`);
        break;
      }
      enviados++;
      await deps.datos.apuntarMensaje(telefono, "agente", p.cuerpo);
    }
    marcar("enviar");
    await deps.datos.guardarHilo(hilo);
    return "respondio";
  }
  await escalar(hilo, texto, "La IA se quedó dando vueltas.", "normal", deps);
  return "escalo";
}

/**
 * El link del portal, SOLO de un negocio de esta cuenta. El nombre que pide
 * el modelo se busca dentro de la lista de la base; si no está ahí, no hay
 * link (el modelo no puede pedir el de otro negocio).
 */
async function resultadoPortal(cuenta: Cuenta, entrada: Record<string, unknown>, deps: DepsSoporte): Promise<Record<string, unknown>> {
  if (cuenta.tipo !== "admin" || cuenta.negocios.length === 0) return { error: "Quien escribe no es admin de ningún negocio." };
  const pedido = String(entrada.negocio ?? "").trim().toLowerCase();
  let n: NegocioDeAdmin | undefined;
  if (cuenta.negocios.length === 1) n = cuenta.negocios[0];
  else if (pedido) n = cuenta.negocios.find((x) => x.nombre.toLowerCase().includes(pedido) || pedido.includes(x.nombre.toLowerCase()));
  if (!n) return { error: "Administra más de un negocio: pregúntale de cuál.", negocios: cuenta.negocios.map((x) => x.nombre) };
  try {
    const url = await deps.ligaPortal(n);
    return n.tieneCuentaStripe
      ? { negocio: n.nombre, portal_de_pagos: url, nota: "El link vale unos minutos; si vence, que lo vuelva a pedir o entre por Administración → Módulos y plan." }
      : { negocio: n.nombre, contratar_en: url, nota: "Aún no tiene cuenta de pago: contrata ahí, con tarjeta." };
  } catch (e) {
    deps.alerta(`No salió el link del portal de ${n.nombre}`, e);
    return { error: "No se pudo generar el link ahora.", alternativa: `${n.url}/admin/modulos` };
  }
}

// ───────────────────────────── escalamiento

export async function escalar(
  hilo: Hilo,
  mensajeOriginal: string,
  resumen: string,
  urgencia: "normal" | "urgente",
  deps: DepsSoporte,
  opciones: { avisar?: boolean } = {},
): Promise<void> {
  if (opciones.avisar ?? true) {
    await deps.wa.texto(hilo.telefono, TEXTO_ESCALAMIENTO);
    await deps.datos.apuntarMensaje(hilo.telefono, "agente", TEXTO_ESCALAMIENTO);
  }
  const e: Escalamiento = { tipo: hilo.tipo, telefono: hilo.telefono, negocio: hilo.negocioNombre, resumen, urgencia, mensajeOriginal };
  const chat = Number(await deps.datos.config(CLAVE_CHAT_OPERADOR));
  let messageId = hilo.telegramMessageId;
  if (!chat) {
    // Todavía no hay bandeja: el hilo queda abierto con su resumen.
    deps.alerta(`Escalamiento sin chat de Telegram (${hilo.telefono}): ${resumen}`);
  } else {
    messageId = (await deps.tg.enviar(chat, textoTelegram(e))) ?? messageId;
  }
  await deps.datos.guardarHilo({ ...hilo, resumen, urgencia, estado: "abierto", telegramMessageId: messageId });
}

// ───────────────────────────── entrada desde Telegram

export const AYUDA_OPERADOR = [
  "Contesta <b>respondiendo</b> (reply) al mensaje de un hilo y tu texto sale por WhatsApp.",
  "",
  "En un reply: /aprender · /cerrar · /seguimiento",
  "En el aviso de un ticket 🎫: tu respuesta le llega en la app · /proceso · /resolver",
].join("\n");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function procesarUpdate(update: any, deps: DepsSoporte): Promise<string> {
  const msg = update?.message ?? update?.edited_message;
  if (!msg?.chat?.id) return "sin mensaje";
  const chatId = Number(msg.chat.id);
  const texto = String(msg.text ?? "").trim();
  const cmd = parsearOperador(texto);
  const guardado = Number(await deps.datos.config(CLAVE_CHAT_OPERADOR)) || null;

  // Vinculación: el bot es público, así que la bandeja no es "el primero que
  // escriba /start" (así la tomaría cualquiera): es quien abra el link con el
  // código de un solo uso que genera scripts/whatsapp/telegram.mjs.
  if (cmd.cmd === "start" && cmd.argumento) {
    const codigo = await deps.datos.config(CLAVE_CODIGO_INICIO);
    if (codigo && cmd.argumento === codigo) {
      await deps.datos.guardarConfig(CLAVE_CHAT_OPERADOR, String(chatId));
      await deps.datos.guardarConfig(CLAVE_CODIGO_INICIO, null);
      await deps.tg.enviar(chatId, "✅ Listo. Este chat queda como la bandeja de WhatsApp de PeluDesk.\n\n" + AYUDA_OPERADOR);
      return "chat del operador registrado";
    }
  }
  if (!guardado || chatId !== guardado) return "chat ajeno ignorado";

  const respondido = msg.reply_to_message?.message_id ? Number(msg.reply_to_message.message_id) : null;
  if (!respondido) {
    await deps.tg.enviar(chatId, cmd.cmd === "start" ? AYUDA_OPERADOR : "⚠️ Responde al mensaje del hilo al que le quieres contestar.");
    return cmd.cmd === "start" ? "ayuda" : "sin hilo";
  }
  // ¿Es el aviso de un ticket de soporte de la app?
  const ticket = deps.tickets ? await deps.tickets.porMensaje(respondido) : null;
  if (ticket && deps.tickets) {
    try {
      if (cmd.cmd === "texto") {
        if (!cmd.texto) {
          await deps.tg.enviar(chatId, "⚠️ Ese comando no existe. En un ticket: tu respuesta, /proceso o /resolver.", respondido);
          return "comando desconocido";
        }
        const aviso = await deps.tickets.responder(ticket.id, cmd.texto);
        await deps.tg.enviar(chatId, `✅ Contestado el ticket #${ticket.numero}. ${aviso}`, respondido);
        return "ticket contestado";
      }
      if (cmd.cmd === "proceso" || cmd.cmd === "resolver" || cmd.cmd === "cerrar") {
        const aviso = await deps.tickets.estado(ticket.id, cmd.cmd === "proceso" ? "en_proceso" : "resuelto");
        await deps.tg.enviar(chatId, `✅ Ticket #${ticket.numero} ${cmd.cmd === "proceso" ? "en proceso" : "resuelto"}. ${aviso}`, respondido);
        return cmd.cmd === "proceso" ? "ticket en proceso" : "ticket resuelto";
      }
      await deps.tg.enviar(chatId, "⚠️ En un ticket: tu respuesta, /proceso o /resolver.", respondido);
      return "comando de ticket desconocido";
    } catch (e) {
      deps.alerta(`No se pudo contestar el ticket ${ticket.id}`, e);
      await deps.tg.enviar(chatId, "⚠️ No se pudo guardar en el ticket. Contéstalo en /plataforma/soporte.", respondido);
      return "ticket falló";
    }
  }
  const hilo = await deps.datos.hiloPorMensajeTelegram(respondido);
  if (!hilo) {
    await deps.tg.enviar(chatId, "⚠️ Ese mensaje ya no tiene hilo. Busca el más reciente.", respondido);
    return "hilo no encontrado";
  }

  switch (cmd.cmd) {
    case "cerrar":
      await deps.datos.guardarHilo({ ...hilo, estado: "cerrado" });
      await deps.tg.enviar(chatId, `✅ Hilo de ${hilo.telefono} cerrado.`, respondido);
      return "cerrado";
    case "aprender": {
      const previos = await deps.datos.ultimosMensajes(hilo.telefono, LIMITE_HISTORIAL);
      const respuesta = [...previos].reverse().find((m) => m.quien === "humano");
      const pregunta = [...previos].reverse().find((m) => m.quien === "usuario");
      if (!respuesta || !pregunta) {
        await deps.tg.enviar(chatId, "⚠️ Todavía no hay una respuesta tuya en este hilo que guardar.", respondido);
        return "nada que aprender";
      }
      await deps.datos.aprender(pregunta.texto, respuesta.texto, hilo.telefono);
      await deps.tg.enviar(chatId, `✅ Aprendido:\n\n<b>P:</b> ${pregunta.texto}\n<b>R:</b> ${respuesta.texto}`, respondido);
      return "aprendido";
    }
    case "seguimiento": {
      const r = await deps.wa.plantilla(hilo.telefono, PLANTILLA_SEGUIMIENTO);
      await deps.tg.enviar(
        chatId,
        r.ok ? `✅ Plantilla enviada a ${hilo.telefono}. Cuando conteste, escríbele aquí.` : `⚠️ No salió la plantilla a ${hilo.telefono}. Revisa si ya está aprobada.`,
        respondido,
      );
      return r.ok ? "seguimiento" : "seguimiento falló";
    }
    case "start":
    case "proceso":
    case "resolver":
      await deps.tg.enviar(chatId, AYUDA_OPERADOR, respondido);
      return "ayuda";
    case "texto": {
      if (!cmd.texto) {
        await deps.tg.enviar(chatId, "⚠️ Ese comando no existe.", respondido);
        return "comando desconocido";
      }
      if (!(await deps.datos.ventanaAbierta(hilo.telefono))) {
        await deps.tg.enviar(
          chatId,
          `⚠️ Pasaron más de 24 h desde que ${hilo.telefono} escribió: WhatsApp no deja mandarle texto.\n\n` +
            "Responde aquí con <code>/seguimiento</code> y le llega la plantilla; cuando conteste, vuelve a escribirle.",
          respondido,
        );
        return "fuera de ventana";
      }
      const cuerpo = aFormatoWhatsApp(cmd.texto);
      const r = await deps.wa.texto(hilo.telefono, cuerpo);
      if (!r.ok) {
        await deps.tg.enviar(chatId, `⚠️ WhatsApp rechazó el mensaje a ${hilo.telefono}.`, respondido);
        return "rechazado";
      }
      await deps.datos.apuntarMensaje(hilo.telefono, "humano", cuerpo);
      await deps.datos.guardarHilo({ ...hilo, estado: "abierto", ultimoHumanoAt: deps.ahora().toISOString() });
      return "enviado";
    }
  }
}
