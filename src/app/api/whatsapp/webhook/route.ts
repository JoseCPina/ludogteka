import { after, NextResponse, type NextRequest } from "next/server";
import { TEXTO_SOLO_TEXTO } from "@/lib/whatsapp/agente";
import { configWhatsApp, construirSoporte, firmaMetaValida, igualSeguro, telefonoCanonico } from "@/lib/whatsapp/infra";
import { atender, type Tiempos } from "@/lib/whatsapp/soporte";
import { TEXTO_AHORA_NO, TEXTO_BAJA } from "@/lib/seguimiento/respuestas";

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
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string };
};

type Entrada = { telefono: string; id: string; texto: string | null; enviadoMs: number | null };

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
  let payload: { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; messages?: MensajeMeta[] } }[] }[] };
  try {
    payload = JSON.parse(crudo);
  } catch {
    return NextResponse.json({ ok: true, motivo: "ilegible" });
  }

  const entradas: Entrada[] = [];
  for (const e of payload.entry ?? []) {
    for (const c of e.changes ?? []) {
      const v = c.value;
      if (!v?.messages?.length) continue; // estados de entrega, etc.
      if (v.metadata?.phone_number_id !== cfg.phoneNumberId) {
        console.warn("[whatsapp] mensaje de otro número ignorado", { phone_number_id: v.metadata?.phone_number_id });
        continue;
      }
      for (const m of v.messages) {
        if (!m.from || !m.id) continue;
        const ts = Number(m.timestamp);
        entradas.push({ telefono: telefonoCanonico(m.from), id: m.id, texto: textoDe(m), enviadoMs: Number.isFinite(ts) && ts > 0 ? ts * 1000 : null });
      }
    }
  }
  if (entradas.length === 0) return NextResponse.json({ ok: true });

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
        if (!m.texto) {
          await wa.texto(m.telefono, TEXTO_SOLO_TEXTO);
          await datos.apuntarMensaje(m.telefono, "agente", TEXTO_SOLO_TEXTO);
          continue;
        }
        const tiempos: Tiempos = {};
        const r = await atender(m.telefono, m.texto, deps, tiempos, seguimiento);
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
