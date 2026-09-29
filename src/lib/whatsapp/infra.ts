import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { urlDemo } from "@/lib/peludesk/landing";
import { urlPlataforma } from "@/lib/pagos/urls";
import { stripe } from "@/lib/cobro/stripe";
import { configuracionPortal } from "@/lib/cobro/portal";
import { type ClaveCaptura, MAX_TOKENS_IA, MODELO_IA, type NegocioDeAdmin, OPCIONES_IA, type PlanPublico, type TipoInterlocutor, TOPE_MENSUAL_MXN } from "./agente";
import { CONOCIMIENTO } from "./conocimiento";
import type { BloqueIA, Cuenta, DatosSoporte, DepsSoporte, Hilo, IA, RespuestaIA, SalidaWA, Telegram } from "./soporte";

/**
 * Lo de afuera del bot de WhatsApp de PeluDesk: la base (con la secret key,
 * SOLO tablas de la plataforma y bot_cuenta_por_telefono), la Cloud API de
 * WhatsApp, la Bot API de Telegram y la API de Anthropic.
 *
 * Variables (Vercel, server-side, nunca en el repo):
 *   WHATSAPP_TOKEN            token del usuario de sistema del portafolio de Meta
 *   WHATSAPP_PHONE_NUMBER_ID  el número de PeluDesk en la Cloud API
 *   WHATSAPP_APP_SECRET       secreto de la app de Meta (firma X-Hub-Signature-256)
 *   WHATSAPP_VERIFY_TOKEN     (opcional) si no, se deriva de WHATSAPP_APP_SECRET
 *   TELEGRAM_BOT_TOKEN        el bot de la bandeja de PeluDesk
 *   TELEGRAM_SECRET_TOKEN     (opcional) si no, se deriva de TELEGRAM_BOT_TOKEN
 *   ANTHROPIC_API_KEY
 *   ANTHROPIC_WORKSPACE_ID    (opcional) solo si la llave no está ligada a un
 *                             workspace: Anthropic la rechaza sin el encabezado
 *                             anthropic-workspace-id («not scoped to a workspace»)
 *   WHATSAPP_IA_TOPE_MENSUAL_MXN (opcional)
 */
export const VERSION_GRAPH = "v23.0";
// Fuera de producción, WHATSAPP_GRAPH_URL / TELEGRAM_API_URL / ANTHROPIC_API_URL
// apuntan a dobles locales (scripts/auditoria/whatsapp-bot.mjs): así se prueba
// el camino real del webhook sin red hacia Meta. En producción se ignoran.
const sustituto = (nombre: string) => (process.env.VERCEL_ENV !== "production" ? process.env[nombre]?.trim().replace(/\/$/, "") || null : null);
const GRAPH = () => sustituto("WHATSAPP_GRAPH_URL") ?? "https://graph.facebook.com";
const TELEGRAM = () => sustituto("TELEGRAM_API_URL") ?? "https://api.telegram.org";
const ANTHROPIC = () => sustituto("ANTHROPIC_API_URL") ?? "https://api.anthropic.com";
const ZONA = "America/Mexico_City";
const TIMEOUT_IA_MS = 25_000;
const TIMEOUT_RED_MS = 10_000;

/**
 * El verify_token de Meta y el secret_token de Telegram se DERIVAN del
 * secreto que ya existe (HMAC), igual que en scripts/whatsapp/*.mjs: así no
 * hay dos variables más que capturar y el script que suscribe el webhook
 * sabe el valor sin leerlo de Vercel. Si vienen puestos, ganan.
 */
export function derivado(secreto: string, proposito: string): string {
  return secreto ? createHmac("sha256", secreto).update(`peludesk:${proposito}`).digest("hex").slice(0, 48) : "";
}

export function configWhatsApp() {
  const appSecret = process.env.WHATSAPP_APP_SECRET ?? "";
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  return {
    token: process.env.WHATSAPP_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    appSecret,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || derivado(appSecret, "whatsapp-verify"),
    telegramToken,
    telegramSecreto: process.env.TELEGRAM_SECRET_TOKEN || derivado(telegramToken, "telegram-webhook"),
    anthropic: process.env.ANTHROPIC_API_KEY ?? "",
    anthropicWorkspace: process.env.ANTHROPIC_WORKSPACE_ID?.trim() ?? "",
  };
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, cuerpo crudo). */
export function firmaMetaValida(encabezado: string | null, cuerpoCrudo: string, secreto: string): boolean {
  if (!encabezado || !secreto) return false;
  const esperado = `sha256=${createHmac("sha256", secreto).update(cuerpoCrudo, "utf8").digest("hex")}`;
  const a = Buffer.from(encabezado.trim().toLowerCase());
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Comparación en tiempo constante para los tokens de verificación. */
export function igualSeguro(a: string | null, b: string): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** "5214441234567" / "+52 444…" → "524441234567" (forma canónica del hilo). */
export function telefonoCanonico(wa: string): string {
  let d = (wa ?? "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) d = `52${d.slice(3)}`;
  if (d.length === 10) d = `52${d}`;
  return d;
}

// ───────────────────────────── base

type Fila = Record<string, unknown>;

function hiloDeFila(f: Fila): Hilo {
  return {
    telefono: f.telefono as string,
    tipo: f.tipo as TipoInterlocutor,
    negocioId: (f.negocio_afectado as string | null) ?? null,
    negocioNombre: (f.negocio_nombre as string | null) ?? null,
    resumen: (f.resumen as string | null) ?? null,
    urgencia: (f.urgencia as "normal" | "urgente") ?? "normal",
    estado: (f.estado as "abierto" | "cerrado") ?? "abierto",
    telegramMessageId: f.telegram_message_id != null ? Number(f.telegram_message_id) : null,
    ultimoHumanoAt: (f.ultimo_humano_at as string | null) ?? null,
  };
}

export class DatosSupabase implements DatosSoporte {
  #sb = createSupabaseAdminClient();

  async config(clave: string) {
    const { data } = await this.#sb.from("wa_config").select("valor").eq("clave", clave).is("deleted_at", null).maybeSingle();
    return (data?.valor as string | undefined) ?? null;
  }

  async guardarConfig(clave: string, valor: string | null) {
    await this.#sb.from("wa_config").update({ deleted_at: new Date().toISOString() }).eq("clave", clave).is("deleted_at", null);
    if (valor !== null) {
      const { error } = await this.#sb.from("wa_config").insert({ clave, valor });
      if (error) throw new Error(`wa_config: ${error.message}`);
    }
  }

  async hiloPorTelefono(telefono: string) {
    const { data } = await this.#sb.from("wa_hilos").select("*").eq("telefono", telefono).is("deleted_at", null).maybeSingle();
    return data ? hiloDeFila(data) : null;
  }

  async hiloPorMensajeTelegram(messageId: number) {
    const { data } = await this.#sb
      .from("wa_hilos")
      .select("*")
      .eq("telegram_message_id", messageId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1);
    return data?.[0] ? hiloDeFila(data[0]) : null;
  }

  async guardarHilo(h: Hilo) {
    const fila = {
      telefono: h.telefono,
      tipo: h.tipo,
      negocio_afectado: h.negocioId,
      negocio_nombre: h.negocioNombre,
      resumen: h.resumen,
      urgencia: h.urgencia,
      estado: h.estado,
      telegram_message_id: h.telegramMessageId,
      ultimo_humano_at: h.ultimoHumanoAt,
    };
    const { data } = await this.#sb.from("wa_hilos").update(fila).eq("telefono", h.telefono).is("deleted_at", null).select("id");
    if (!data?.length) {
      const { error } = await this.#sb.from("wa_hilos").insert(fila);
      if (error) throw new Error(`wa_hilos: ${error.message}`);
    }
  }

  /** El entrante: false si ya estaba (Meta reintenta; no se contesta dos veces). */
  async registrarEntrante(telefono: string, texto: string, waMessageId: string): Promise<boolean> {
    const { error } = await this.#sb.from("wa_mensajes").insert({ telefono, quien: "usuario", texto, wa_message_id: waMessageId });
    if (error) {
      if (error.code === "23505") return false;
      throw new Error(`wa_mensajes: ${error.message}`);
    }
    const ahora = new Date().toISOString();
    const { data } = await this.#sb.from("wa_hilos").update({ ultimo_entrante_at: ahora }).eq("telefono", telefono).is("deleted_at", null).select("id");
    if (!data?.length) await this.#sb.from("wa_hilos").insert({ telefono, ultimo_entrante_at: ahora });
    return true;
  }

  async apuntarMensaje(telefono: string, quien: "usuario" | "agente" | "humano", texto: string) {
    const { error } = await this.#sb.from("wa_mensajes").insert({ telefono, quien, texto });
    if (error) console.error("[whatsapp] no se apuntó el mensaje", error.message);
  }

  async ultimosMensajes(telefono: string, limite: number) {
    const { data } = await this.#sb
      .from("wa_mensajes")
      .select("quien, texto")
      .eq("telefono", telefono)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limite);
    return ((data ?? []) as { quien: "usuario" | "agente" | "humano"; texto: string }[]).reverse();
  }

  async aprendido(limite: number) {
    const { data } = await this.#sb.from("wa_aprendido").select("pregunta, respuesta").is("deleted_at", null).order("created_at", { ascending: false }).limit(limite);
    return (data ?? []) as { pregunta: string; respuesta: string }[];
  }

  async aprender(pregunta: string, respuesta: string, origen: string) {
    const { error } = await this.#sb.from("wa_aprendido").insert({ pregunta, respuesta, origen });
    if (error) throw new Error(`wa_aprendido: ${error.message}`);
  }

  async respuestasIADesde(telefono: string, desde: string) {
    const { count } = await this.#sb.from("wa_uso_ia").select("id", { count: "exact", head: true }).eq("telefono", telefono).gte("created_at", desde);
    return count ?? 0;
  }

  async gastoIADesde(desde: string) {
    const { data } = await this.#sb.from("wa_uso_ia").select("costo_mxn").gte("created_at", desde);
    return (data ?? []).reduce((s, f) => s + Number(f.costo_mxn ?? 0), 0);
  }

  async registrarUsoIA(u: { telefono: string; tokensIn: number; tokensOut: number; costoMxn: number; resultado: string }) {
    await this.#sb.from("wa_uso_ia").insert({
      telefono: u.telefono,
      modelo: MODELO_IA,
      tokens_in: u.tokensIn,
      tokens_out: u.tokensOut,
      costo_mxn: u.costoMxn,
      resultado: u.resultado,
    });
  }

  async ventanaAbierta(telefono: string) {
    const { data } = await this.#sb.from("wa_hilos").select("ultimo_entrante_at").eq("telefono", telefono).is("deleted_at", null).maybeSingle();
    const t = data?.ultimo_entrante_at ? Date.parse(data.ultimo_entrante_at as string) : 0;
    return Date.now() - t < 24 * 3600_000 - 60_000;
  }
}

// ───────────────────────────── quién escribe (la base decide)

function fecha(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: ZONA }).format(new Date(iso));
}

function diasHasta(iso: string | null | undefined, ahora = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((Date.parse(iso) - ahora) / 86_400_000));
}

/** Lo único que el bot sabe de un negocio: lo que devuelve la base para ESE teléfono. */
export async function cuentaPorTelefono(telefono: string): Promise<Cuenta> {
  const { data, error } = await createSupabaseAdminClient().rpc("bot_cuenta_por_telefono", { p_telefono: telefono });
  if (error) throw new Error(`bot_cuenta_por_telefono: ${error.message}`);
  const r = data as { tipo: TipoInterlocutor; negocios: Fila[] };
  const negocios: NegocioDeAdmin[] = (r?.negocios ?? []).map((n) => {
    const primerFallo = (n.primer_fallo_at as string | null) ?? null;
    const finGracia = primerFallo ? new Date(Date.parse(primerFallo) + 7 * 86_400_000).toISOString() : null;
    return {
      id: n.negocio_id as string,
      nombre: n.nombre as string,
      url: urlDelNegocio({ slug: n.slug as string, dominio: (n.dominio as string | null) ?? null, url_publica: (n.url_publica as string | null) ?? null }),
      activo: n.activo !== false,
      plan: n.plan as string,
      planNombre: (n.plan_nombre as string | null) ?? null,
      estadoCobro: (n.estado_cobro as string | null) ?? null,
      contratado: Boolean(n.periodicidad),
      periodicidad: (n.periodicidad as string | null) ?? null,
      pruebaTermina: fecha(n.prueba_termina_at as string | null),
      diasPrueba: diasHasta(n.prueba_termina_at as string | null),
      periodoFin: fecha(n.periodo_fin as string | null),
      cancelaAlTerminar: Boolean(n.cancela_al_terminar),
      primerFallo: fecha(primerFallo),
      finGracia: fecha(finGracia),
      diasGracia: diasHasta(finGracia),
      tieneCuentaStripe: Boolean(n.tiene_cuenta_stripe),
    };
  });
  return { tipo: r?.tipo ?? "prospecto", negocios };
}

/** Los planes publicados (tabla compartida `planes`, la edita la plataforma). */
export async function planesPublicos(): Promise<PlanPublico[]> {
  const sb = createSupabaseAdminClient();
  const [{ data: planes }, { data: modulos }] = await Promise.all([
    sb.from("planes").select("nombre, descripcion, tipo, precio_mensual, precio_anual, modulos").eq("activo", true).is("deleted_at", null).order("orden"),
    sb.from("modulos").select("clave, nombre"),
  ]);
  const nombre = Object.fromEntries((modulos ?? []).map((m) => [m.clave as string, m.nombre as string]));
  return (planes ?? []).map((p) => ({
    nombre: p.nombre as string,
    descripcion: (p.descripcion as string | null) ?? null,
    tipo: p.tipo as "plan" | "complemento",
    mensual: Number(p.precio_mensual),
    anual: Number(p.precio_anual),
    modulos: ((p.modulos as string[]) ?? []).map((m) => nombre[m] ?? m),
  }));
}

/**
 * El portal de Stripe de un negocio de la cuenta (el negocio sale de
 * cuentaPorTelefono, nunca de lo que escribió la persona). Sin cuenta de
 * Stripe: el link para contratar.
 */
export async function ligaPortalDe(n: NegocioDeAdmin): Promise<string> {
  const contratar = `${n.url}/admin/modulos`;
  if (!n.tieneCuentaStripe) return contratar;
  const { data } = await createSupabaseAdminClient(n.id)
    .from("suscripciones")
    .select("stripe_customer_id")
    .eq("negocio_id", n.id)
    .is("deleted_at", null)
    .maybeSingle();
  const customer = data?.stripe_customer_id as string | undefined;
  if (!customer) return contratar;
  const portal = await stripe().billingPortal.sessions.create({
    customer,
    configuration: await configuracionPortal(),
    locale: "es-419",
    return_url: contratar,
  });
  return portal.url;
}

// ───────────────────────────── WhatsApp Cloud API

const MAX_INTENTOS = 3;

/**
 * Las capturas se suben a WhatsApp UNA vez y se reusa el media id (así la
 * imagen sale al instante). Meta guarda un media 30 días: pasados 25 se
 * vuelve a subir. Si cambian las imágenes, se sube VERSION_CAPTURAS.
 */
const VERSION_CAPTURAS = 1;
const DIAS_MEDIA = 25;
const claveMedia = (clave: ClaveCaptura) => `wa_media_${clave}_v${VERSION_CAPTURAS}`;

export interface AlmacenMedia {
  leer(clave: string): Promise<string | null>;
  guardar(clave: string, valor: string): Promise<void>;
}

export class ClienteWA implements SalidaWA {
  #medias = new Map<ClaveCaptura, string>();

  /** alContestar: se llama cada vez que Meta acepta un mensaje del número (ver marcarNumeroContesta). */
  constructor(
    private token: string,
    private phoneNumberId: string,
    private alContestar?: () => Promise<void>,
    private almacen?: AlmacenMedia,
  ) {}

  get configurado() {
    return Boolean(this.token && this.phoneNumberId);
  }

  texto(a: string, cuerpo: string) {
    return this.enviar({ messaging_product: "whatsapp", recipient_type: "individual", to: a, type: "text", text: { preview_url: true, body: cuerpo } });
  }

  plantilla(a: string, nombre: string) {
    return this.enviar({ messaging_product: "whatsapp", recipient_type: "individual", to: a, type: "template", template: { name: nombre, language: { code: "es_MX" } } });
  }

  /**
   * Palomitas azules y «escribiendo…» (se quita solo al contestar o a los 25 s):
   * la persona sabe que llegó mientras la IA piensa.
   */
  async marcarLeido(waMessageId: string) {
    await this.enviar({ messaging_product: "whatsapp", status: "read", message_id: waMessageId, typing_indicator: { type: "text" } });
  }

  async captura(a: string, clave: ClaveCaptura, pie: string) {
    const mandar = (id: string) =>
      this.enviar({ messaging_product: "whatsapp", recipient_type: "individual", to: a, type: "image", image: { id, caption: pie } });
    try {
      let id = await this.mediaDe(clave, false);
      let r = await mandar(id);
      if (!r.ok && r.estado && r.estado < 500) {
        // El media id pudo vencer antes de tiempo: se sube de nuevo una vez.
        id = await this.mediaDe(clave, true);
        r = await mandar(id);
      }
      return r;
    } catch (e) {
      console.error("[whatsapp] captura", clave, e instanceof Error ? e.message : e);
      return { ok: false };
    }
  }

  private async mediaDe(clave: ClaveCaptura, forzar: boolean): Promise<string> {
    if (!forzar) {
      const enMemoria = this.#medias.get(clave);
      if (enMemoria) return enMemoria;
      const guardado = await this.almacen?.leer(claveMedia(clave)).catch(() => null);
      if (guardado) {
        const { id, subido } = JSON.parse(guardado) as { id: string; subido: string };
        if (id && Date.now() - Date.parse(subido) < DIAS_MEDIA * 86_400_000) {
          this.#medias.set(clave, id);
          return id;
        }
      }
    }
    const datos = new FormData();
    datos.append("messaging_product", "whatsapp");
    datos.append("type", "image/jpeg");
    datos.append("file", new Blob([new Uint8Array(await bytesCaptura(clave))], { type: "image/jpeg" }), `${clave}.jpg`);
    const r = await fetch(`${GRAPH()}/${VERSION_GRAPH}/${this.phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: datos,
      signal: AbortSignal.timeout(TIMEOUT_RED_MS * 2),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!r.ok || !j.id) throw new Error(`subir ${clave}: ${j.error?.message ?? `HTTP ${r.status}`}`);
    this.#medias.set(clave, j.id);
    await this.almacen?.guardar(claveMedia(clave), JSON.stringify({ id: j.id, subido: new Date().toISOString() })).catch(() => {});
    return j.id;
  }

  private async enviar(cuerpo: Record<string, unknown>): Promise<{ ok: boolean; estado?: number; error?: string }> {
    if (!this.configurado) {
      console.error("[whatsapp] WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID sin configurar");
      return { ok: false, error: "sin configurar" };
    }
    const url = `${GRAPH()}/${VERSION_GRAPH}/${this.phoneNumberId}/messages`;
    let ultimo: { ok: boolean; estado?: number; error?: string } = { ok: false };
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(TIMEOUT_RED_MS),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
        ultimo = { ok: r.ok, estado: r.status, error: j.error?.message };
        if (r.ok) break;
        if (r.status !== 429 && r.status < 500) break;
      } catch (e) {
        ultimo = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (intento < MAX_INTENTOS) await new Promise((res) => setTimeout(res, 300 * 2 ** (intento - 1)));
    }
    if (!ultimo.ok) console.error("[whatsapp] envío rechazado", { estado: ultimo.estado, error: ultimo.error, tipo: cuerpo.type ?? cuerpo.status });
    else if (cuerpo.type && this.alContestar) await this.alContestar().catch(() => {});
    return ultimo;
  }
}

/**
 * Los bytes de una captura: del disco (next.config la incluye en la función
 * del webhook) o, si no está, del propio sitio.
 */
async function bytesCaptura(clave: ClaveCaptura): Promise<Buffer> {
  try {
    return await readFile(path.join(process.cwd(), "public", "peludesk", "whatsapp", `${clave}.jpg`));
  } catch {
    const r = await fetch(`${urlPlataforma()}/peludesk/whatsapp/${clave}.jpg`, { signal: AbortSignal.timeout(TIMEOUT_RED_MS) });
    if (!r.ok) throw new Error(`no encontré la captura ${clave} (${r.status})`);
    return Buffer.from(await r.arrayBuffer());
  }
}

// ───────────────────────────── Telegram

export class TelegramHttp implements Telegram {
  constructor(private token: string) {}

  async llamar(metodo: string, cuerpo: Record<string, unknown> = {}) {
    if (!this.token) return { ok: false, resultado: null, descripcion: "falta TELEGRAM_BOT_TOKEN" };
    try {
      const r = await fetch(`${TELEGRAM()}/bot${this.token}/${metodo}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TIMEOUT_RED_MS),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string };
      return { ok: Boolean(j.ok), resultado: j.result ?? null, descripcion: j.description };
    } catch (e) {
      return { ok: false, resultado: null, descripcion: String(e) };
    }
  }

  /** setMyProfilePhoto: la foto se sube como archivo nuevo (attach://). */
  async subirFotoPerfil(urlFoto: string) {
    if (!this.token) return { ok: false, descripcion: "falta TELEGRAM_BOT_TOKEN" };
    try {
      const foto = await fetch(urlFoto, { signal: AbortSignal.timeout(TIMEOUT_RED_MS) });
      if (!foto.ok) return { ok: false, descripcion: `no pude bajar la foto (${foto.status})` };
      const datos = new FormData();
      datos.append("photo", JSON.stringify({ type: "static", photo: "attach://foto" }));
      datos.append("foto", new Blob([await foto.arrayBuffer()], { type: "image/jpeg" }), "peludesk.jpg");
      const r = await fetch(`${TELEGRAM()}/bot${this.token}/setMyProfilePhoto`, { method: "POST", body: datos, signal: AbortSignal.timeout(TIMEOUT_RED_MS) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      return { ok: Boolean(j.ok), descripcion: j.description };
    } catch (e) {
      return { ok: false, descripcion: String(e) };
    }
  }

  async enviar(chatId: number, htmlTexto: string, responderA?: number) {
    const r = await this.llamar("sendMessage", {
      chat_id: chatId,
      text: htmlTexto,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(responderA ? { reply_parameters: { message_id: responderA, allow_sending_without_reply: true } } : {}),
    });
    if (!r.ok) {
      console.error("[telegram] sendMessage", r.descripcion);
      return null;
    }
    const id = (r.resultado as { message_id?: number } | null)?.message_id;
    return typeof id === "number" ? id : null;
  }
}

// ───────────────────────────── Anthropic (sin SDK: un POST y dos campos)

export class Anthropic implements IA {
  constructor(
    private llave: string,
    private workspace = "",
  ) {}

  async responder(system: string, mensajes: BloqueIA[], tools: BloqueIA[]): Promise<RespuestaIA> {
    if (!this.llave) throw new Error("falta ANTHROPIC_API_KEY");
    const r = await fetch(`${ANTHROPIC()}/v1/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_IA_MS),
      headers: {
        "content-type": "application/json",
        "x-api-key": this.llave,
        "anthropic-version": "2023-06-01",
        ...(this.workspace ? { "anthropic-workspace-id": this.workspace } : {}),
      },
      body: JSON.stringify({ model: MODELO_IA, max_tokens: MAX_TOKENS_IA, ...OPCIONES_IA, system, tools, messages: mensajes }),
    });
    const cuerpo = (await r.json().catch(() => ({}))) as {
      content?: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      error?: { message?: string };
    };
    if (!r.ok) throw new Error(`Anthropic: ${cuerpo.error?.message ?? `HTTP ${r.status}`}`);
    const bloques = Array.isArray(cuerpo.content) ? cuerpo.content : [];
    return {
      texto: bloques.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n"),
      usos: bloques.filter((b) => b.type === "tool_use").map((b) => ({ id: String(b.id), nombre: String(b.name), entrada: b.input ?? {} })),
      tokensIn: Number(cuerpo.usage?.input_tokens ?? 0),
      tokensOut: Number(cuerpo.usage?.output_tokens ?? 0),
      bloques,
    };
  }
}

// ───────────────────────────── ¿el número ya contesta?

export const CLAVE_NUMERO_CONTESTA = "whatsapp_contesta_desde";
let numeroYaContesta = false;

/**
 * La primera vez que Meta acepta un mensaje del número, se anota en
 * wa_config: desde ese momento la landing y el aviso de prueba vencida
 * muestran el botón de WhatsApp (whatsappPeluDesk). Antes, el número todavía
 * no está activo y el botón mandaría a un número sin WhatsApp.
 */
export async function marcarNumeroContesta(): Promise<void> {
  if (numeroYaContesta) return;
  const sb = createSupabaseAdminClient();
  const { data } = await sb.from("wa_config").select("id").eq("clave", CLAVE_NUMERO_CONTESTA).is("deleted_at", null).maybeSingle();
  if (!data) await sb.from("wa_config").insert({ clave: CLAVE_NUMERO_CONTESTA, valor: new Date().toISOString() });
  numeroYaContesta = true;
}

// ───────────────────────────── armado

function topeMensual(): number {
  const n = Number(process.env.WHATSAPP_IA_TOPE_MENSUAL_MXN);
  return Number.isFinite(n) && n > 0 ? n : TOPE_MENSUAL_MXN;
}

export function construirSoporte(): { deps: DepsSoporte; datos: DatosSupabase; wa: ClienteWA } {
  const cfg = configWhatsApp();
  const datos = new DatosSupabase();
  const wa = new ClienteWA(cfg.token, cfg.phoneNumberId, marcarNumeroContesta, {
    leer: (clave) => datos.config(clave),
    guardar: (clave, valor) => datos.guardarConfig(clave, valor),
  });
  const deps: DepsSoporte = {
    datos,
    tg: new TelegramHttp(cfg.telegramToken),
    wa,
    ia: new Anthropic(cfg.anthropic, cfg.anthropicWorkspace),
    base: CONOCIMIENTO,
    topeMensual: topeMensual(),
    ahora: () => new Date(),
    hoyTexto: () => new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ZONA }).format(new Date()),
    cuenta: cuentaPorTelefono,
    contexto: async (cuenta) => ({
      tipo: cuenta.tipo,
      negocios: cuenta.negocios,
      planes: await planesPublicos(),
      enlaces: { registro: `${urlPlataforma()}/registro`, demo: `${urlDemo()}/demo` },
    }),
    ligaPortal: ligaPortalDe,
    alerta: (detalle, e) => console.error(`[whatsapp] ${detalle}`, e instanceof Error ? e.message : (e ?? "")),
  };
  return { deps, datos, wa };
}
