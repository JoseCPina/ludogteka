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

import {
  type ContextoAgente,
  costoMxn,
  decidirIA,
  type Escalamiento,
  herramientas,
  type NegocioDeAdmin,
  type ParAprendido,
  parsearOperador,
  systemPrompt,
  TEXTO_ESCALAMIENTO,
  textoTelegram,
  type TipoInterlocutor,
} from "./agente";
import { aFormatoWhatsApp } from "./texto";

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
  responder(system: string, mensajes: BloqueIA[], tools: BloqueIA[]): Promise<RespuestaIA>;
}

export interface SalidaWA {
  texto(a: string, cuerpo: string): Promise<{ ok: boolean }>;
  plantilla(a: string, nombre: string): Promise<{ ok: boolean }>;
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
  contexto(cuenta: Cuenta): Promise<ContextoAgente>;
  /** Link al portal de pagos de un negocio DE ESTA cuenta (nunca de otro). */
  ligaPortal(negocio: NegocioDeAdmin): Promise<string>;
  alerta(detalle: string, e?: unknown): void;
}

// ───────────────────────────── entrada desde WhatsApp

export type Desenlace = "respondio" | "escalo" | "callado" | "error";

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
export async function atender(telefono: string, texto: string, deps: DepsSoporte): Promise<Desenlace> {
  const ahora = deps.ahora();
  const cuenta = await deps.cuenta(telefono);
  const neg = negocioDelHilo(cuenta);
  const previo = await deps.datos.hiloPorTelefono(telefono);
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
      respuestasHoy: await deps.datos.respuestasIADesde(telefono, inicioDelDia(ahora)),
      gastoDelMes: await deps.datos.gastoIADesde(inicioDelMes(ahora)),
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
    const [historial, aprendido, ctx] = await Promise.all([
      deps.datos.ultimosMensajes(telefono, LIMITE_HISTORIAL),
      deps.datos.aprendido(LIMITE_APRENDIDO),
      deps.contexto(cuenta),
    ]);
    const system = systemPrompt(deps.base, aprendido, ctx, deps.hoyTexto());
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
    return await conversar(telefono, texto, hilo, cuenta, system, mensajes, tools, deps);
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
  system: string,
  mensajes: BloqueIA[],
  tools: BloqueIA[],
  deps: DepsSoporte,
): Promise<Desenlace> {
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const r = await deps.ia.responder(system, mensajes, tools);
    const apuntar = (resultado: UsoIA["resultado"]) =>
      deps.datos.registrarUsoIA({ telefono, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costoMxn: costoMxn(r.tokensIn, r.tokensOut), resultado });

    const esc = r.usos.find((u) => u.nombre === "escalar");
    if (esc) {
      await apuntar("escalo");
      await escalar(hilo, texto, String(esc.entrada.resumen ?? "Sin resumen"), esc.entrada.urgencia === "urgente" ? "urgente" : "normal", deps);
      return "escalo";
    }

    const portal = r.usos.find((u) => u.nombre === "liga_portal_pagos");
    if (portal && vuelta < 2) {
      await apuntar("respondio");
      mensajes.push({ role: "assistant", content: r.bloques });
      mensajes.push({ role: "user", content: [{ type: "tool_result", tool_use_id: portal.id, content: JSON.stringify(await resultadoPortal(cuenta, portal.entrada, deps)) }] });
      continue;
    }

    const salida = aFormatoWhatsApp(r.texto);
    if (!salida) {
      await apuntar("escalo");
      await escalar(hilo, texto, "La IA contestó en blanco.", "normal", deps);
      return "escalo";
    }
    await apuntar("respondio");
    const env = await deps.wa.texto(telefono, salida);
    if (!env.ok) {
      await escalar(hilo, texto, "WhatsApp rechazó la respuesta del bot. Revisa tú.", "normal", deps, { avisar: false });
      return "error";
    }
    await deps.datos.apuntarMensaje(telefono, "agente", salida);
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
