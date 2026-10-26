import { after, NextResponse, type NextRequest } from "next/server";
import { TEXTO_SOLO_TEXTO } from "@/lib/whatsapp/agente";
import { configWhatsApp, construirSoporte, firmaMetaValida, igualSeguro, telefonoCanonico } from "@/lib/whatsapp/infra";
import { atender, type Tiempos } from "@/lib/whatsapp/soporte";
import { TEXTO_AHORA_NO, TEXTO_BAJA, TEXTO_BAJA_PROSPECTO, clasificarRespuesta } from "@/lib/seguimiento/respuestas";
import { guardarEstado, esFalloDeCuenta, type EstadoMeta } from "@/lib/whatsapp/entregas";
import { avisarFalloDeEntrega } from "@/lib/soporte/notificar";
import { procesarSesion } from "@/lib/whatsapp/flow/servidor";

const TEXTO_FORMULARIO_ENVIADO = "[Envió el formulario «Prueba gratis»]";

/**
 * Webhook de WhatsApp (Cloud API) del número de PeluDesk. Vive en el dominio
 * de la plataforma: https://peludesk.mx/api/whatsapp/webhook (en el de un
 * negocio da 404).
 *
 *   GET   verificación de Meta con WHATSAPP_VERIFY_TOKEN.
 *   POST  1. firma X-Hub-Signature-256 con el secreto de la app ANTES de leer nada;
 *         2. solo mensajes del número de PeluDesk (la app de Meta es la del
 *            portafolio de Checaíto: lo de otro número se ignora);
 *         3. guarda el entrante (único por id de WhatsApp: un reintento de
 *            Meta no se contesta dos veces; si no se pudo guardar, 500 para
 *            que Meta reintente);
 *         4. contesta 200 y atiende después (after), porque Meta espera
 *            respuesta rápida y la IA tarda unos segundos. Lo primero en
 *            after: palomitas azules + «escribiendo…».
 *         Cada respuesta deja en el log «[whatsapp] tiempos»: cuánto tardó
 *         Meta en entregarnos el mensaje (su timestamp contra la llegada) y
 *         cuánto se fue en preparar, en la IA y en enviar.
 * Quién escribe lo decide la base con el teléfono que Meta entrega
 * (bot_cuenta_por_telefono), nunca lo que la persona diga ser.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && igualSeguro(p.get("hub.verify_token"), configWhatsApp().verifyToken)) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type MensajeMeta = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { type?: string; button_reply?: { title?: string }; list_reply?: { title?: string }; nfm_reply?: { response_json?: string; name?: string } };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string };
  /** Mensaje que llega desde un anuncio de clic a WhatsApp. */
  referral?: { source_id?: string; source_type?: string; source_url?: string; ctwa_clid?: string; headline?: string; body?: string };
};

type Entrada = {
  telefono: string;
  id: string;
  texto: string | null;
  enviadoMs: number | null;
  /** Nombre del perfil de WhatsApp (contacts[].profile.name). */
  perfil: string | null;
  anuncio: { adId: string | null; clid: string | null } | null;
  /** El flow_token de un formulario de WhatsApp que la persona acaba de enviar (nfm_reply). */
  flowToken: string | null;
};

/** El flow_token de la respuesta de un WhatsApp Flow (el formulario de prueba gratis), o null. */
function flowTokenDe(m: MensajeMeta): string | null {
  if (m.type !== "interactive" || m.interactive?.type !== "nfm_reply") return null;
  try {
    const t = (JSON.parse(m.interactive.nfm_reply?.response_json ?? "{}") as { flow_token?: unknown }).flow_token;
    return typeof t === "string" && /^[A-Za-z0-9_-]{20,80}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}

/** El id del anuncio (source_id, cuando source_type es «ad») y el ctwa_clid del referral, o null si no viene de un anuncio. */
function anuncioDe(m: MensajeMeta): Entrada["anuncio"] {
  const r = m.referral;
  if (!r || (!r.ctwa_clid && r.source_type !== "ad")) return null;
  const adId = r.source_type === "ad" && /^[0-9]{1,40}$/.test(r.source_id ?? "") ? r.source_id! : null;
  return { adId, clid: r.ctwa_clid ? r.ctwa_clid.slice(0, 300) : null };
}

function textoDe(m: MensajeMeta): string | null {
  const t =
    m.text?.body ??
    m.button?.text ??
    m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title ??
    m.image?.caption ??
    m.video?.caption ??
    m.document?.caption ??
    null;
  return t && t.trim() ? t.trim().slice(0, 4000) : null;
}

export async function POST(request: NextRequest) {
  const llegada = Date.now();
  const cfg = configWhatsApp();
  const crudo = await request.text();
  if (!firmaMetaValida(request.headers.get("x-hub-signature-256"), crudo, cfg.appSecret)) {
    console.warn("[whatsapp] firma inválida");
    return new NextResponse("Firma inválida", { status: 401 });
  }
  let payload: { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: MensajeMeta[]; statuses?: EstadoMeta[] } }[] }[] };
  try {
    payload = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ ok: true, motivo: "ilegible" });
  }

  const entradas: Entrada[] = [];
  const estados: EstadoMeta[] = [];
  for (const e of payload.entry ?? []) {
    for (const c of e.changes ?? []) {
      const v = c.value;
      if (v?.statuses?.length && v.metadata?.phone_number_id === cfg.phoneNumberId) estados.push(...v.statuses);
      if (!v?.messages?.length) continue;
      if (v.metadata?.phone_number_id !== cfg.phoneNumberId) {
        console.warn("[whatsapp] mensaje de otro número ignorado", { phone_number_id: v.metadata?.phone_number_id });
        continue;
      }
      for (const m of v.messages) {
        if (!m.from || !m.id) continue;
        const ts = Number(m.timestamp);
        const perfil = (v.contacts ?? []).find((c) => c.wa_id === m.from)?.profile?.name ?? v.contacts?.[0]?.profile?.name ?? null;
        const flowToken = flowTokenDe(m);
        entradas.push({
          telefono: telefonoCanonico(m.from),
          id: m.id,
          texto: flowToken ? TEXTO_FORMULARIO_ENVIADO : textoDe(m),
          flowToken,
          enviadoMs: Number.isFinite(ts) && ts > 0 ? ts * 1000 : null,
          perfil: perfil ? perfil.slice(0, 120) : null,
          anuncio: anuncioDe(m),
        });
      }
    }
  }

  // Estados de entrega (sent, delivered, read, failed): se guardan SIEMPRE. Si no se pudo, 500 para que Meta reintente.
  const avisos: { origen?: string; etiqueta?: string | null; codigo?: number | null; motivo?: string; cuenta: boolean }[] = [];
  try {
    for (const st of estados) {
      const r = await guardarEstado(st);
      if (r?.avisar) avisos.push({ origen: r.origen, etiqueta: r.etiqueta, codigo: r.codigo, motivo: r.motivo, cuenta: esFalloDeCuenta(r.codigo) });
      if (st.status === "failed") console.warn("[whatsapp] mensaje fallido", { codigo: st.errors?.[0]?.code, titulo: st.errors?.[0]?.title });
    }
  } catch (e) {
    console.error("[whatsapp] no se pudo guardar el estado de entrega", e instanceof Error ? e.message : e);
    return new NextResponse("No se guardó", { status: 500 });
  }
  if (avisos.length) after(async () => { for (const a of avisos) await avisarFalloDeEntrega(a); });
  if (entradas.length === 0) return NextResponse.json({ ok: true, estados: estados.length });

  const { deps, datos, wa } = construirSoporte();
  const nuevas: Entrada[] = [];
  try {
    for (const m of entradas) {
      if (await datos.registrarEntrante(m.telefono, m.texto ?? "[mensaje sin texto]", m.id)) nuevas.push(m);
    }
  } catch (e) {
    console.error("[whatsapp] no se pudo guardar el entrante", e instanceof Error ? e.message : e);
    return new NextResponse("No se guardó", { status: 500 });
  }

  after(async () => {
    // Todos a la vez y antes que nada: la persona ve que sí llegó.
    await Promise.all(nuevas.map((m) => wa.marcarLeido(m.id).catch(() => {})));
    for (const m of nuevas) {
      const inicio = Date.now();
      try {
        // El formulario de prueba gratis enviado: el negocio se abre (si el endpoint no lo abrió ya) y el mensaje con
        // el acceso sale de ahí; el bot no contesta nada más.
        if (m.flowToken) {
          console.info("[whatsapp] formulario de prueba gratis enviado", { estado: await procesarSesion(m.flowToken) });
          continue;
        }
        // Si es la respuesta a un mensaje de seguimiento de su prueba, se registra
        // (detiene el seguimiento) y el bot sabe de qué se trata; «Ahora no» y las
        // bajas se contestan con una línea fija, sin IA.
        const seguimiento = await datos.registrarRespuestaSeguimiento(m.telefono, m.texto ?? "[mensaje sin texto]");
        if (seguimiento?.tipo === "ahora_no" || seguimiento?.tipo === "baja") {
          const aviso = seguimiento.tipo === "baja" ? TEXTO_BAJA : TEXTO_AHORA_NO;
          await wa.texto(m.telefono, aviso);
          await datos.apuntarMensaje(m.telefono, "agente", aviso);
          continue;
        }
        // BAJA de quien no está en el seguimiento (un prospecto): fuera de mensajes y de la publicidad (aviso de privacidad).
        if (!seguimiento && m.texto && clasificarRespuesta(m.texto) === "baja" && (await datos.bajaWhatsapp(m.telefono))) {
          await wa.texto(m.telefono, TEXTO_BAJA_PROSPECTO);
          await datos.apuntarMensaje(m.telefono, "agente", TEXTO_BAJA_PROSPECTO);
          continue;
        }
        if (!m.texto) {
          await wa.texto(m.telefono, TEXTO_SOLO_TEXTO);
          await datos.apuntarMensaje(m.telefono, "agente", TEXTO_SOLO_TEXTO);
          continue;
        }
        const tiempos: Tiempos = {};
        // Un prospecto que llega desde su página (/para/<slug>) o desde un anuncio de clic a WhatsApp: queda «respondió»
        // en el CRM y el bot sabe quién es (y de qué giro, si vino del anuncio).
        const prospecto = seguimiento
          ? null
          : (m.anuncio ? await datos.registrarAnuncio(m.telefono, m.perfil, m.anuncio, m.texto) : null) ?? (await datos.registrarProspecto(m.telefono, m.texto));
        const r = await atender(m.telefono, m.texto, deps, tiempos, seguimiento, prospecto);
        console.info("[whatsapp] tiempos", {
          desenlace: r,
          // Del envío en el celular a que Meta nos lo entregó (su reloj contra el nuestro).
          retraso_meta_s: m.enviadoMs ? Math.round((llegada - m.enviadoMs) / 100) / 10 : null,
          ...tiempos,
          total_ms: Date.now() - inicio,
          desde_llegada_ms: Date.now() - llegada,
        });
      } catch (e) {
        console.error("[whatsapp] error atendiendo", e instanceof Error ? e.message : e);
      }
    }
  });
  return NextResponse.json({ ok: true, nuevos: nuevas.length });
}
