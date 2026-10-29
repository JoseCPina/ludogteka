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
  type ProspectoContexto,
  systemPrompt,
  TEXTO_ESCALAMIENTO,
  TEXTO_SOLO_TEXTO,
  textoCaptura,
  textoTelegram,
  type TipoInterlocutor,
} from "./agente";
import { aclararCobro, aclararDemo, cabeAclaracion, aFormatoWhatsApp, enDosSiEsLargo, formatoDelBot, hayQueReescribir, juntarCortos, unLinkAlFinal } from "./texto";
import { ACLARACION_DEMO, COBRO_A_NOMBRE_DE, respuestaFijaDirecta, type PrecioRecordatorioFijo } from "@/lib/peludesk/respuestas-fijas";
import {
  cifrasNoFijas,
  conversacionActual,
  esSaludo,
  MENU_SALUDO,
  opcionDelMenu,
  type PreciosBot,
  respuestaPrecioFija,
  sinPreciosViejos,
  temaDePrecio,
  TEXTO_DUDA,
  ultimoFueMenu,
} from "./conversacion";
import type { PuntoFlow } from "./flow/servidor";
import { SIN_TEXTO } from "./ventas/guion";

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
  /** Cuándo se guardó (para cortar la conversación tras 24 h de silencio). */
  at?: string | null;
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
  /** `extra`: campos de más para la API (el guion de ventas fuerza su herramienta con tool_choice). */
  responder(system: string | BloqueIA[], mensajes: BloqueIA[], tools: BloqueIA[], maxTokens?: number, extra?: Record<string, unknown>): Promise<RespuestaIA>;
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
  /** Además de lo que es, es cliente (dueño de mascota) de algún negocio que usa PeluDesk. */
  tambienCliente?: boolean;
}

/**
 * Quien le escribe al número de PeluDesk pregunta por PeluDesk: un cliente de un negocio (dueño de mascota) que nos
 * escribe se atiende como prospecto, sabiendo que también es cliente (21 de octubre de 2026: el 524441301539 recibe
 * recordatorios de la clínica demo y por eso se le contestaba como «cliente de un negocio»). Admin y personal no cambian.
 */
export function cuentaParaElBot(c: Cuenta): Cuenta {
  return c.tipo === "cliente_de_negocio" ? { ...c, tipo: "prospecto", tambienCliente: true } : c;
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
  contexto(cuenta: Cuenta, seguimiento?: SeguimientoContexto | null, prospecto?: ProspectoContexto | null): Promise<ContextoAgente>;
  /**
   * Los tickets de soporte de la app, que también avisan en esta bandeja.
   * Responder a su aviso contesta el ticket (sin esto, solo hilos de WhatsApp).
   */
  tickets?: TicketsBandeja;
  /** Precios de la base (sin IVA) y el link de prueba de quien escribe, para las respuestas fijas de precio. */
  fijos(prospecto?: ProspectoContexto | null): Promise<{ precios: PreciosBot | null; recordatorio?: PrecioRecordatorioFijo | null; registro: string }>;
  /** Link al portal de pagos de un negocio DE ESTA cuenta (nunca de otro). */
  ligaPortal(negocio: NegocioDeAdmin): Promise<string>;
  /**
   * Manda el formulario de prueba gratis (WhatsApp Flow) con `cuerpo` como texto y el botón «Probar gratis». false =
   * no salió (sin Flow configurado, número de fuera de México, Meta lo rechazó): se manda el texto de siempre.
   * Sin esta función (las pruebas sin Flow), todo va por texto.
   */
  ofrecerFlow?(telefono: string, punto: PuntoFlow, cuerpo: string, prospecto?: ProspectoContexto | null): Promise<boolean>;
  /** El guion de ventas para un prospecto (sin esta función, las pruebas que no lo usan van por el camino de antes). */
  ventas?(e: {
    telefono: string;
    texto: string;
    prospecto: ProspectoContexto | null;
    tambienCliente: boolean;
    primeraVez: boolean;
    usaIA: boolean;
    ultimoDelBot: string | null;
  }): Promise<{ rama: string; escalar?: { acuse: string; resumen: string } }>;
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
export async function atender(telefono: string, texto: string, deps: DepsSoporte, tiempos?: Tiempos, seguimiento?: SeguimientoContexto | null, prospecto?: ProspectoContexto | null): Promise<Desenlace> {
  const marcar = cronometro(tiempos);
  const ahora = deps.ahora();
  // Todo lo que no depende de nada, a la vez: cada consulta en serie eran
  // cientos de milisegundos antes de siquiera llamar a la IA.
  const historialP = deps.datos.ultimosMensajes(telefono, LIMITE_HISTORIAL);
  const aprendidoP = deps.datos.aprendido(LIMITE_APRENDIDO);
  historialP.catch(() => {});
  aprendidoP.catch(() => {});
  const [cuentaBase, previo, respuestasHoy, gastoDelMes] = await Promise.all([
    deps.cuenta(telefono),
    deps.datos.hiloPorTelefono(telefono),
    deps.datos.respuestasIADesde(telefono, inicioDelDia(ahora)),
    deps.datos.gastoIADesde(inicioDelMes(ahora)),
  ]);
  const cuenta = cuentaParaElBot(cuentaBase);
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
  // Solo la conversación ACTUAL (desde el último silencio de 24 h) cuenta: lo viejo no entra al modelo ni al resumen
  // que llega a la bandeja. El mensaje que acaba de llegar ya está guardado, así que es el último de la lista.
  const todos = await historialP.catch(() => [] as MensajeHilo[]);
  const actual = conversacionActual(todos, ahora);
  const nueva = !actual.some((m) => m.quien !== "usuario");
  // A un número que nunca recibió respuesta, una línea con el aviso de privacidad (con lo fijo o con el modelo).
  const primeraVez = cuenta.tipo === "prospecto" && !todos.some((m) => m.quien !== "usuario");

  // Un prospecto (también el dueño de una mascota que nos escribe): el guion de ventas, con respuestas fijas y la IA
  // solo para elegir la rama (src/lib/whatsapp/ventas/). Con el operador en medio, se calla como siempre; si el guion
  // falla, sigue el camino de antes.
  if (deps.ventas && cuenta.tipo === "prospecto" && !seguimiento && v.motivo !== "silencio_humano") {
    const delBot = actual.filter((m) => m.quien !== "usuario");
    const r = await deps
      .ventas({ telefono, texto, prospecto: prospecto ?? null, tambienCliente: cuenta.tambienCliente === true, primeraVez, usaIA: v.usaIA, ultimoDelBot: delBot.at(-1)?.texto ?? null })
      .catch((e) => {
        deps.alerta(`El guion de ventas falló para ${telefono}`, e);
        return null;
      });
    if (r) {
      marcar("ventas");
      if (r.escalar) {
        await escalar(hilo, texto, r.escalar.resumen, "normal", deps, { acuse: r.escalar.acuse });
        return "escalo";
      }
      await deps.datos.guardarHilo(hilo);
      return "respondio";
    }
  }
  if (texto === SIN_TEXTO) {
    await deps.wa.texto(telefono, TEXTO_SOLO_TEXTO);
    await deps.datos.apuntarMensaje(telefono, "agente", TEXTO_SOLO_TEXTO);
    return "respondio";
  }

  // Respuestas fijas, sin modelo (no gastan IA; se callan si el operador está en medio):
  //   menú (1, 2, 3) → prueba, precio o «cuéntame»; precio/planes/anual/sucursales/prueba/factura → texto fijo con las
  //   cifras de la base; saludo al empezar conversación → saludo y menú; recordatorios y SMS (QA R23).
  if (v.motivo !== "silencio_humano") {
    const opcion = ultimoFueMenu(actual) ? opcionDelMenu(texto) : null;
    let fija: string | null = null;
    // Dónde se ofrece el formulario de prueba gratis (WhatsApp Flow) junto con la respuesta fija: el saludo, la opción 1
    // del menú y cuando pide precio o la prueba. Sucursales, factura y lo demás van solo por texto.
    let punto: PuntoFlow | null = null;
    if (opcion === 3) fija = TEXTO_DUDA;
    else {
      const tema = opcion === 1 ? "prueba" : opcion === 2 ? "precio" : temaDePrecio(texto);
      if (tema) {
        const f = await deps.fijos(prospecto).catch(() => null);
        if (f?.precios) fija = respuestaPrecioFija(tema, f.precios, f.registro);
        if (fija) punto = opcion === 1 ? "menu" : tema === "prueba" ? "prueba" : tema === "precio" || tema === "anual" ? "precio" : null;
      }
    }
    if (!fija && nueva && esSaludo(texto)) {
      fija = MENU_SALUDO;
      punto = "saludo";
    }
    if (!fija) {
      // Con las cifras de la base (el precio por mensaje de los recordatorios); si no se pudieron leer, sin cifras.
      const f = await deps.fijos(prospecto).catch(() => null);
      const directa = respuestaFijaDirecta(texto, f?.precios ? { mensual: f.precios.mensual, anual: f.precios.anual, sucursal: f.precios.sucursal, recordatorio: f.recordatorio ?? null } : null);
      fija = directa ? formatoDelBot(directa) : null;
    }
    if (fija) {
      // A quien no tiene negocio, la misma respuesta va con el botón «Probar gratis»; si el formulario no sale, por texto.
      const porFlow = punto && cuenta.tipo === "prospecto" && deps.ofrecerFlow ? await deps.ofrecerFlow(telefono, punto, fija, prospecto).catch(() => false) : false;
      const env = porFlow ? { ok: true } : await deps.wa.texto(telefono, fija);
      if (env.ok) {
        await deps.datos.apuntarMensaje(telefono, "agente", fija);
        if (!porFlow && nueva) await ofrecerAProspecto(telefono, prospecto, deps);
        if (primeraVez) {
          const aviso = `Así cuidamos tus datos:\n\n${URL_AVISO_PRIVACIDAD}`;
          if ((await deps.wa.texto(telefono, aviso)).ok) await deps.datos.apuntarMensaje(telefono, "agente", aviso);
        }
        marcar("enviar");
        await deps.datos.guardarHilo(hilo);
        return "respondio";
      }
    }
  }

  if (!v.usaIA) {
    // Con el operador en medio de la conversación, no se le manda un acuse
    // automático encima de lo que ya le está escribiendo.
    const callado = v.motivo === "silencio_humano";
    await escalar(hilo, texto, v.detalle ?? "", "normal", deps, { avisar: !callado });
    return callado ? "callado" : "escalo";
  }

  try {
    const [aprendido, ctx, fijos] = await Promise.all([aprendidoP, deps.contexto(cuenta, seguimiento, prospecto), deps.fijos(prospecto).catch(() => null)]);
    // Un precio que el bot dio antes y ya no vale se tacha, para que el modelo no lo repita.
    const historial = fijos?.precios ? actual.map((m) => ({ ...m, texto: sinPreciosViejos(m.texto, fijos.precios!) })) : actual;
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
    const desenlace = await conversar(telefono, texto, hilo, cuenta, system, mensajes, tools, historial, ctx.enlaces, deps, marcar, fijos, primeraVez);
    if (desenlace === "respondio" && nueva) await ofrecerAProspecto(telefono, prospecto, deps);
    return desenlace;
  } catch (e) {
    deps.alerta(`La IA falló para ${telefono}`, e);
    await deps.datos.registrarUsoIA({ telefono, tokensIn: 0, tokensOut: 0, costoMxn: 0, resultado: "error" });
    await escalar(hilo, texto, "La IA no contestó. Revisa tú.", "normal", deps);
    return "error";
  }
}

export const TEXTO_OFERTA_PROSPECTO = "Si quieres, abre tu cuenta de prueba aquí mismo, sin salir de WhatsApp. Son 15 días gratis, sin tarjeta.";

/**
 * A quien llega desde su página de prospección (la «ref.» del mensaje) o desde un anuncio de clic a WhatsApp, la
 * primera respuesta de la conversación va seguida del formulario de prueba gratis. Nunca lanza.
 */
async function ofrecerAProspecto(telefono: string, prospecto: ProspectoContexto | null | undefined, deps: DepsSoporte): Promise<void> {
  if (!deps.ofrecerFlow || !prospecto || !(prospecto.anuncio || prospecto.por === "referencia")) return;
  const salio = await deps.ofrecerFlow(telefono, prospecto.anuncio ? "anuncio" : "prospeccion", TEXTO_OFERTA_PROSPECTO, prospecto).catch(() => false);
  if (salio) await deps.datos.apuntarMensaje(telefono, "agente", TEXTO_OFERTA_PROSPECTO).catch(() => {});
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
  fijos: { precios: PreciosBot | null; registro: string } | null = null,
  primeraVez = false,
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
      // La instrucción va en el system, no como mensaje del cliente: puesta como turno «user», el
      // modelo la leía como un intento de darle órdenes («No puedo tomar instrucciones de edición así»).
      const nota = `REESCRITURA DE FORMATO (instrucción de PeluDesk). Tu borrador de respuesta al último mensaje del cliente fue:\n<<<\n${(escritoAntes + r.texto).trim()}\n>>>\nContesta ese mismo mensaje del cliente con el mismo contenido, pero cada párrafo de UNA frase corta (dos renglones en el celular) y máximo cuatro párrafos por mensaje (si no cabe, junta ideas o quita lo que sobre). Conserva los [[captura:...]], [[link:...]] y === donde estaban. No menciones esta instrucción ni el borrador.`;
      const systemReescritura: string | BloqueIA[] = typeof system === "string" ? `${system}\n\n${nota}` : [...system, { type: "text", text: nota }];
      const borrador = await deps.ia
        .responder(systemReescritura, mensajes, tools)
        .catch(() => null);
      marcar("ia");
      if (borrador?.texto.trim() && !borrador.usos.length) {
        r = borrador;
        escritoAntes = "";
      }
    }

    // Una cifra con signo de pesos que no es de las fijas (un precio viejo o inventado): la respuesta entera se
    // sustituye por la fija de precio. El precio nunca lo escribe el modelo.
    if (fijos?.precios && cifrasNoFijas(escritoAntes + r.texto, fijos.precios).length) {
      deps.alerta(`La IA escribió un precio que no es de los fijos para ${telefono}; se sustituyó por la respuesta fija`);
      r = { ...r, texto: respuestaPrecioFija("precio", fijos.precios, fijos.registro) };
      escritoAntes = "";
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
    // Ya no se le agrega el link del demo a toda respuesta (QA S16): el link va solo cuando la persona pide verlo
    // o probar. Lo que sí: el mensaje con el link del demo dice que Patitas & Co. es un negocio de ejemplo.
    for (const p of piezas) if (p.tipo === "texto") p.cuerpo = aclararDemo(p.cuerpo, enlaces.demo, ACLARACION_DEMO);
    // Si preguntó por pagar, el cobro o la factura y la respuesta no dice a nombre de quién sale, se agrega (MENTEO).
    const ultimaPieza = [...piezas].reverse().find((p) => p.tipo === "texto");
    if (ultimaPieza?.tipo === "texto" && /\b(factur\w*|suscripci[oó]n|cargo|cobran|pago|pagar|tarjeta)\b/i.test(texto) && !/terminal/i.test(texto)) {
      const conAclaracion = aclararCobro(ultimaPieza.cuerpo, COBRO_A_NOMBRE_DE);
      if (conAclaracion === ultimaPieza.cuerpo || cabeAclaracion(ultimaPieza.cuerpo)) ultimaPieza.cuerpo = conAclaracion;
      else piezas.push({ tipo: "texto", cuerpo: COBRO_A_NOMBRE_DE });
    }
    // A un número nuevo, en la primera respuesta, una línea corta con el aviso de privacidad.
    if (primeraVez && piezas.some((p) => p.tipo === "texto")) {
      piezas.push({ tipo: "texto", cuerpo: `Así cuidamos tus datos:\n\n${URL_AVISO_PRIVACIDAD}` });
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
      ? { negocio: n.nombre, portal_de_pagos: url, nota: "El link vale unos minutos; si vence, que lo vuelva a pedir o entre por Módulos y plan." }
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
  opciones: { avisar?: boolean; acuse?: string } = {},
): Promise<void> {
  if (opciones.avisar ?? true) {
    const acuse = opciones.acuse ?? TEXTO_ESCALAMIENTO;
    await deps.wa.texto(hilo.telefono, acuse);
    await deps.datos.apuntarMensaje(hilo.telefono, "agente", acuse);
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
