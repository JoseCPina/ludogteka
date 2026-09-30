/**
 * El publicador de redes de PeluDesk: toma de redes_publicaciones lo que ya
 * toca (redes_tomar, atómico) y lo publica. Lo corre la tarea de Vercel cada
 * hora (/api/cron/redes) y «Publicar ahora» de /plataforma/redes.
 *
 * Nunca publica dos veces lo mismo:
 *  - Cada fila se toma con bloqueo (skip locked + vencimiento): dos corridas
 *    a la vez no toman la misma.
 *  - `paso` y los ids intermedios se guardan ANTES del paso que publica. Si
 *    una corrida muere a la mitad, la siguiente retoma: Instagram pregunta
 *    si el contenedor ya salió (PUBLISHED) antes de volver a publicarlo; el
 *    reel de Facebook, si el video ya quedó publicado. Donde no hay forma de
 *    saberlo (video del muro, init de TikTok) la fila queda 'revisar' y una
 *    persona decide en /plataforma/redes.
 *  - Cada red es su propia fila: si una falla, las otras siguen.
 * Fallas: reintenta con espera (15 min, 30, 60) lo que puede salir más tarde
 * (red, 5xx, límite de Meta, contenedor que no termina); lo demás (token,
 * parámetro) queda 'fallida'. Cada publicación y cada falla avisan en la
 * bandeja de Telegram del bot. Nada de aquí escribe un token en los logs.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { urlPlataforma } from "@/lib/pagos/urls";
import { escaparHtml } from "@/lib/whatsapp/agente";
import { DatosSupabase, TelegramHttp, configWhatsApp } from "@/lib/whatsapp/infra";
import * as meta from "./meta";
import { ErrorRed } from "./meta";
import * as tt from "./tiktok";
import { TITULOS, urlVideo } from "./serie";

export type Publicacion = {
  id: string;
  video: string;
  red: "facebook" | "instagram" | "tiktok";
  formato: "reel" | "muro" | "borrador";
  archivo: string;
  programada_at: string;
  pie: string;
  estado: string;
  paso: string | null;
  intentos: number;
  contenedor_id: string | null;
  publicacion_id: string | null;
  prueba: boolean;
};

const MAX_INTENTOS = 4;
const BLOQUEO_MIN = 12;
const RED: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok" };

const bd = () => createSupabaseAdminClient();
async function anotar(id: string, cambios: Record<string, unknown>) {
  const { error } = await bd().from("redes_publicaciones").update(cambios).eq("id", id);
  if (error) throw new Error(`No se pudo anotar la publicación ${id}: ${error.message}`);
}

type Resultado = { publicacionId?: string | null; url?: string | null; nota?: string };

export async function correrPublicador({ limite = 6 }: { limite?: number } = {}) {
  const { data, error } = await bd().rpc("redes_tomar", { p_limite: limite, p_bloqueo_min: BLOQUEO_MIN });
  if (error) throw new Error(`redes_tomar: ${error.message}`);
  const filas = (data ?? []) as Publicacion[];
  const resumen = { tomadas: filas.length, publicadas: 0, reintentar: 0, fallidas: 0, revisar: 0 };
  for (const f of filas) {
    const r = await publicarUna(f);
    resumen[r] += 1;
  }
  return resumen;
}

async function publicarUna(f: Publicacion): Promise<"publicadas" | "reintentar" | "fallidas" | "revisar"> {
  try {
    const r = f.red === "instagram" ? await instagram(f) : f.red === "facebook" ? await facebook(f) : await tiktok(f);
    await anotar(f.id, { estado: "publicada", paso: null, bloqueo_hasta: null, publicada_at: new Date().toISOString(), publicacion_id: r.publicacionId ?? f.publicacion_id, url: r.url ?? null, error: r.nota ?? null });
    await avisar(exito(f, r));
    return "publicadas";
  } catch (e) {
    if (e instanceof Revisar) {
      await anotar(f.id, { estado: "revisar", bloqueo_hasta: null, error: e.message });
      await avisar(falla(f, e.message, "revisar"));
      return "revisar";
    }
    const mensaje = e instanceof Error ? e.message : String(e);
    const intentos = f.intentos + 1;
    const reintenta = e instanceof ErrorRed && e.reintentable && intentos < MAX_INTENTOS;
    const proximo = new Date(Date.now() + 15 * 60_000 * 2 ** (intentos - 1));
    // Un rechazo definitivo (4xx) quiere decir que ese paso NO publicó: se
    // limpia `paso` para que al reprogramarla no quede por revisar. Una falla
    // ambigua (red, 5xx) conserva el paso y la siguiente corrida decide.
    const definitivo = !(e instanceof ErrorRed && e.reintentable);
    await anotar(f.id, { estado: reintenta ? "reintentar" : "fallida", intentos, bloqueo_hasta: null, error: mensaje, proximo_intento_at: reintenta ? proximo.toISOString() : null, ...(definitivo ? { paso: null } : {}) });
    await avisar(falla(f, mensaje, reintenta ? proximo : "fallida"));
    console.error("[redes] falló", f.red, f.video, mensaje);
    return reintenta ? "reintentar" : "fallidas";
  }
}

/** La corrida anterior murió en un paso que pudo haber publicado sin dejar id. */
class Revisar extends Error {}

function exigirMeta() {
  const c = meta.credencialesMeta();
  if (!c.token || !c.pagina || !c.ig) throw new ErrorRed("Faltan PELUDESK_META_TOKEN, PELUDESK_FB_PAGE_ID o PELUDESK_IG_USER_ID en Vercel.");
  return c as { token: string; pagina: string; ig: string };
}

async function instagram(f: Publicacion): Promise<Resultado> {
  const { token, ig } = exigirMeta();
  let contenedor = f.contenedor_id;
  if (contenedor && f.paso === "publicar") {
    // Se cortó al publicar: si ya salió, no se vuelve a publicar.
    const e = await meta.igEstado({ contenedor, token });
    if (e.estado === "PUBLISHED") return { nota: "Salió en una corrida que se cortó; el enlace hay que buscarlo en Instagram." };
  }
  if (!contenedor) {
    await anotar(f.id, { paso: "contenedor" });
    contenedor = await meta.igCrearContenedor({ ig, token, videoUrl: urlVideo(f.archivo), pie: f.pie });
    await anotar(f.id, { contenedor_id: contenedor, paso: "esperar" });
  }
  await meta.igEsperar({ contenedor, token, topeMs: 150_000 });
  if (f.prueba) return { nota: "Prueba: el contenedor quedó listo y NO se publicó (caduca solo en 24 h)." };
  await anotar(f.id, { paso: "publicar" });
  const id = await meta.igPublicar({ ig, token, contenedor });
  await anotar(f.id, { publicacion_id: id });
  return { publicacionId: id, url: await meta.igPermalink(id, token) };
}

async function facebook(f: Publicacion): Promise<Resultado> {
  const { token: tokenUsuario, pagina } = exigirMeta();
  const token = await meta.fbTokenPagina({ pagina, token: tokenUsuario });
  if (f.prueba) {
    // Privado y borrado: nadie lo ve.
    const id = await meta.fbVideoMuro({ pagina, token, videoUrl: urlVideo(f.archivo), pie: f.pie, publicado: false });
    await meta.fbBorrar({ id, token });
    return { publicacionId: id, nota: "Prueba: se subió como video sin publicar y se borró." };
  }
  if (f.formato === "muro") {
    if (f.paso === "enviar" && !f.publicacion_id) {
      throw new Revisar("La corrida anterior se cortó mientras Facebook recibía el video del muro y no dejó id: revisa la página antes de reintentar.");
    }
    await anotar(f.id, { paso: "enviar" });
    const id = await meta.fbVideoMuro({ pagina, token, videoUrl: urlVideo(f.archivo), pie: f.pie });
    await anotar(f.id, { publicacion_id: id });
    return { publicacionId: id, url: await meta.fbPermalink(id, token) };
  }
  // Reel: start (inofensivo) → subir (inofensivo) → finish (publica).
  if (f.contenedor_id && f.paso === "publicar") {
    if (await meta.fbVideoPublicado({ videoId: f.contenedor_id, token })) {
      return { publicacionId: f.contenedor_id, url: await meta.fbPermalink(f.contenedor_id, token) };
    }
    await meta.fbReelPublicar({ pagina, token, videoId: f.contenedor_id, pie: f.pie });
    return { publicacionId: f.contenedor_id, url: await meta.fbPermalink(f.contenedor_id, token) };
  }
  // Sin finish de por medio, se empieza de nuevo: un video sin publicar no se ve.
  const { videoId, subida } = await meta.fbReelIniciar({ pagina, token });
  await anotar(f.id, { contenedor_id: videoId, paso: "subir" });
  await meta.fbReelSubir({ subida, token, videoUrl: urlVideo(f.archivo) });
  await anotar(f.id, { paso: "publicar" });
  await meta.fbReelPublicar({ pagina, token, videoId, pie: f.pie });
  return { publicacionId: videoId, url: await meta.fbPermalink(videoId, token) };
}

async function tiktok(f: Publicacion): Promise<Resultado> {
  const token = await tt.tokenTikTok();
  if (f.paso === "init" && !f.contenedor_id) {
    throw new Revisar("La corrida anterior se cortó al pedirle el buzón a TikTok y no dejó id: revisa los borradores antes de reintentar.");
  }
  if (f.contenedor_id) {
    const e = await tt.tiktokEstado({ token, publishId: f.contenedor_id });
    if (e.estado === "SEND_TO_USER_INBOX" || e.estado === "PUBLISH_COMPLETE") return { publicacionId: f.contenedor_id, url: tt.URL_BORRADORES_TIKTOK };
    if (e.estado && e.estado !== "FAILED") return esperarTikTok(token, f.contenedor_id);
    // FAILED o sin estado: la subida anterior no llegó; se pide otra.
  }
  const r = await fetch(urlVideo(f.archivo), { signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!r?.ok) throw new ErrorRed(`tiktok: no se pudo leer el video (${urlVideo(f.archivo)})`, true);
  const bytes = new Uint8Array(await r.arrayBuffer());
  await anotar(f.id, { paso: "init", contenedor_id: null });
  const { publishId, subida } = await tt.tiktokIniciar({ token, tamano: bytes.length });
  await anotar(f.id, { contenedor_id: publishId, paso: "subir" });
  await tt.tiktokSubir({ subida, bytes });
  return esperarTikTok(token, publishId);
}

async function esperarTikTok(token: string, publishId: string): Promise<Resultado> {
  const limite = Date.now() + 120_000;
  for (;;) {
    const e = await tt.tiktokEstado({ token, publishId });
    if (e.estado === "SEND_TO_USER_INBOX" || e.estado === "PUBLISH_COMPLETE") return { publicacionId: publishId, url: tt.URL_BORRADORES_TIKTOK };
    if (e.estado === "FAILED") throw new ErrorRed(`tiktok: la subida terminó en FAILED${e.motivo ? `: ${e.motivo}` : ""}`, true);
    if (Date.now() > limite) throw new ErrorRed(`tiktok: sigue en ${e.estado ?? "?"}; se retoma en la siguiente corrida`, true);
    await new Promise((ok) => setTimeout(ok, 5000));
  }
}

// ── Avisos en la bandeja de Telegram ──

function nombre(f: Publicacion) {
  const formato = f.formato === "muro" ? "muro" : f.formato === "borrador" ? "borrador" : "reel";
  return `${f.prueba ? "PRUEBA · " : ""}<b>${escaparHtml(TITULOS[f.video] ?? f.video)}</b> · ${RED[f.red]} (${formato})`;
}

function exito(f: Publicacion, r: Resultado): string {
  const lineas = [`📣 Publicado: ${nombre(f)}`];
  if (f.red === "tiktok") {
    lineas.push("Está en los borradores de TikTok: ábrelo en la app, pega el pie y publícalo.");
    if (!f.prueba) lineas.push(`<blockquote>${escaparHtml(f.pie)}</blockquote>`);
  }
  if (r.url) lineas.push(escaparHtml(r.url));
  if (r.nota) lineas.push(`<i>${escaparHtml(r.nota)}</i>`);
  return lineas.join("\n\n");
}

function falla(f: Publicacion, motivo: string, siguiente: Date | "fallida" | "revisar"): string {
  const que =
    siguiente === "fallida"
      ? "Ya no se reintenta: arréglalo y reprográmala."
      : siguiente === "revisar"
        ? "Revisa si salió y resuélvela a mano."
        : `Se reintenta a las ${siguiente.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" })}.`;
  return [`⚠️ No salió: ${nombre(f)}`, `<blockquote>${escaparHtml(motivo.slice(0, 600))}</blockquote>`, `${que} ${urlPlataforma()}/plataforma/redes`].join("\n\n");
}

async function avisar(html: string) {
  try {
    const chat = Number(await new DatosSupabase().config("telegram_chat_operador")) || null;
    if (!chat) return console.warn("[redes] sin bandeja de Telegram vinculada");
    await new TelegramHttp(configWhatsApp().telegramToken).enviar(chat, html);
  } catch (e) {
    console.error("[redes] no salió el aviso de Telegram", e instanceof Error ? e.message : e);
  }
}
