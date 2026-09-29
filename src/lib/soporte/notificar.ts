import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { urlPlataforma } from "@/lib/pagos/urls";
import { telefonoDeCorreoSintetico } from "@/lib/auth/identidad";
import { ARTICULOS } from "@/lib/ayuda";
import { Anthropic, ClienteWA, DatosSupabase, TelegramHttp, configWhatsApp, telefonoCanonico } from "@/lib/whatsapp/infra";
import { escaparHtml } from "@/lib/whatsapp/agente";
import { PLANTILLA_SEGUIMIENTO } from "@/lib/whatsapp/soporte";

/**
 * Los avisos de los tickets de soporte, fuera de la app:
 *   - a PeluDesk, en la bandeja de Telegram del bot de WhatsApp (el mismo
 *     chat vinculado en /plataforma/whatsapp). Responder al aviso contesta
 *     el ticket (src/app/api/telegram/webhook).
 *   - a quien creó el ticket, si es ADMIN y su cuenta es de teléfono, por
 *     WhatsApp (texto si escribió en las últimas 24 h; si no, la plantilla
 *     de seguimiento). En la app siempre ve el aviso arriba.
 * Nada de aquí detiene el ticket: si Telegram o WhatsApp fallan, se anota
 * en los logs y el ticket queda igual.
 */
const CLAVE_CHAT_OPERADOR = "telegram_chat_operador";

async function chatOperador(): Promise<number | null> {
  return Number(await new DatosSupabase().config(CLAVE_CHAT_OPERADOR)) || null;
}

export async function avisarTelegramTicket(t: {
  id: string;
  numero: number;
  negocio: string;
  persona: string;
  rol: string;
  asunto: string;
  texto: string;
  pantalla?: string | null;
  nuevo: boolean;
  sinDocumentar?: boolean;
}): Promise<void> {
  try {
    const chat = await chatOperador();
    if (!chat) return console.warn("[soporte] ticket sin bandeja de Telegram vinculada", t.id);
    const html = [
      `🎫 <b>Ticket #${t.numero}</b> · ${escaparHtml(t.negocio)} · ${escaparHtml(t.persona)} (${t.rol === "admin" ? "admin" : "recepción"})${t.nuevo ? " · <b>NUEVO</b>" : ""}`,
      `<b>${escaparHtml(t.asunto)}</b>`,
      `<blockquote>${escaparHtml(t.texto.slice(0, 1500))}</blockquote>`,
      [t.pantalla ? `Pantalla: ${escaparHtml(t.pantalla)}` : null, t.sinDocumentar ? "No estaba en la documentación." : null].filter(Boolean).join(" · "),
      `<i>Responde a este mensaje y le llega en la app. /proceso · /resolver</i> · ${urlPlataforma()}/plataforma/soporte/${t.id}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const id = await new TelegramHttp(configWhatsApp().telegramToken).enviar(chat, html);
    if (id) await createSupabaseAdminClient().rpc("plataforma_anotar_telegram", { p_ticket_id: t.id, p_message_id: id });
  } catch (e) {
    console.error("[soporte] no salió el aviso de Telegram", t.id, e instanceof Error ? e.message : e);
  }
}

/** A quien creó el ticket, por WhatsApp, si es admin con cuenta de teléfono. */
export async function avisarWhatsAppRespuesta(r: {
  ticketId: string;
  negocioId: string;
  profileId: string;
  rol: string;
  numero: number;
  asunto: string;
  texto: string;
  resuelto?: boolean;
}): Promise<"whatsapp" | "plantilla" | "no_aplica" | "fallo"> {
  if (r.rol !== "admin") return "no_aplica";
  try {
    const admin = createSupabaseAdminClient();
    const { data: u } = await admin.auth.admin.getUserById(r.profileId);
    const tel = telefonoDeCorreoSintetico(u?.user?.email);
    if (!tel) return "no_aplica";
    const { data: n } = await admin.from("negocios").select("slug, dominio, url_publica").eq("id", r.negocioId).single();
    const url = n ? `${urlDelNegocio(n as { slug: string; dominio: string | null; url_publica: string | null })}/ayuda/tickets/${r.ticketId}` : null;
    const cfg = configWhatsApp();
    const wa = new ClienteWA(cfg.token, cfg.phoneNumberId);
    if (!wa.configurado) return "no_aplica";
    const destino = telefonoCanonico(tel);
    const datos = new DatosSupabase();
    if (await datos.ventanaAbierta(destino)) {
      const cuerpo = [
        `${r.resuelto ? "Resolvimos" : "Te contestamos"} tu ticket #${r.numero}: *${r.asunto}*`,
        r.texto.slice(0, 900),
        url ? `Míralo en la app:\n\n${url}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");
      const env = await wa.texto(destino, cuerpo);
      if (env.ok) await datos.apuntarMensaje(destino, "humano", cuerpo);
      return env.ok ? "whatsapp" : "fallo";
    }
    const env = await wa.plantilla(destino, PLANTILLA_SEGUIMIENTO);
    return env.ok ? "plantilla" : "fallo";
  } catch (e) {
    console.error("[soporte] no salió el WhatsApp del ticket", r.ticketId, e instanceof Error ? e.message : e);
    return "fallo";
  }
}

/**
 * Al resolver un ticket que no estaba documentado: el borrador del artículo
 * nuevo, en el formato de src/lib/ayuda/articulos (para pegarlo en el repo).
 * Con la IA si hay llave; si no, una plantilla con lo que ya se sabe.
 */
export async function proponerArticulo(t: {
  asunto: string;
  pantalla: string | null;
  mensajes: { autor: string; texto: string }[];
}): Promise<string> {
  const hilo = t.mensajes.map((m) => `${m.autor === "plataforma" ? "PeluDesk" : "Negocio"}: ${m.texto}`).join("\n\n");
  const slugs = ARTICULOS.map((a) => a.slug).join(", ");
  const plantilla = [
    "{",
    `  slug: "${t.asunto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}",`,
    `  titulo: "Cómo …",`,
    `  resumen: "…",`,
    `  grupo: "inicio",`,
    `  modulo: null,`,
    `  roles: ["admin", "recepcion"],`,
    `  rutas: [${t.pantalla ? `"${t.pantalla}"` : ""}],`,
    "  cuerpo: `",
    "…pasos a partir de la respuesta de PeluDesk…",
    "`,",
    "},",
  ].join("\n");
  const cfg = configWhatsApp();
  if (!cfg.anthropic) return `${plantilla}\n\n/* Hilo del ticket:\n${hilo}\n*/`;
  try {
    const r = await new Anthropic(cfg.anthropic, cfg.anthropicWorkspace).responder(
      [
        "Escribes artículos del centro de ayuda de PeluDesk (software para guarderías, hoteles y estéticas caninas).",
        "Voz: español de México, de tú, corto, humano, paso a paso. Nunca voseo. Sin frases de agencia.",
        "Contesta SOLO con un objeto TypeScript del tipo Articulo (sin import ni export), con: slug, titulo (con verbo: «Cómo …»), resumen (una frase), grupo, modulo (null o la clave), roles, rutas (prefijos de pantalla), palabras (3-8), cuerpo.",
        "El cuerpo, en Markdown reducido (párrafos, «## », listas «1. » y «- », **negritas**, [texto](/ruta), «> nota»), de 80 a 250 palabras: para qué sirve y los pasos numerados.",
        "Usa SOLO lo que dice la respuesta de PeluDesk en el hilo; no inventes botones ni pantallas. Si algo no está claro, déjalo marcado con «…».",
        `Slugs que ya existen (no los repitas): ${slugs}.`,
      ].join("\n"),
      [{ role: "user", content: `Ticket: ${t.asunto}\nPantalla: ${t.pantalla ?? "—"}\n\n${hilo}` }],
      [],
      1500
    );
    return r.texto.trim() || plantilla;
  } catch (e) {
    console.error("[soporte] no salió la propuesta de artículo", e instanceof Error ? e.message : e);
    return `${plantilla}\n\n/* Hilo del ticket:\n${hilo}\n*/`;
  }
}
