/**
 * TikTok: el video llega como BORRADOR al buzón de la cuenta de PeluDesk y
 * una persona lo publica desde la app (endpoint /inbox/, no /content/, que
 * publica directo y pide la revisión de TikTok). Es la misma app en sandbox
 * que usan Menteo y Checaíto (JoseCPina/video-pipeline, src/lib/tiktok.mjs):
 * la cuenta de PeluDesk va dada de alta como Target User y lo único propio
 * son los tokens. Lecciones que se conservan:
 *
 *  - TikTok contesta 200 con `error` adentro: se mira el cuerpo, no el HTTP.
 *  - El access token dura 24 h y el refresh 365 días; al renovar PUEDE
 *    llegar otro refresh_token y hay que guardar el nuevo (ignorarlo sirve
 *    un tiempo y un día deja de servir). Por eso viven en Vault
 *    (redes_secreto_guardar), no en una variable.
 *  - El `code` del OAuth llega percent-encoded: se canjea decodificado.
 *  - La subida es init (publish_id + upload_url, válida 1 h) y PUT de los
 *    bytes; un archivo de hasta 64 MB va en un solo trozo, y 206/201 son éxito.
 *  - El redirect_uri es el que ya tiene la app: la página de Menteo que solo
 *    ENSEÑA el code para copiarlo (menteo-publicacion.vercel.app/tiktok).
 *
 * El buzón no lleva pie: el aviso de Telegram lo trae para copiarlo al publicar.
 * Credenciales: TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET (Vercel, las de la
 * app sandbox); fuera de producción TIKTOK_API_URL apunta a un doble local.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ErrorRed } from "./meta";

const sustituto = (n: string) => (process.env.VERCEL_ENV !== "production" ? process.env[n]?.trim().replace(/\/$/, "") || null : null);
const API = () => sustituto("TIKTOK_API_URL") ?? "https://open.tiktokapis.com";
export const REDIRECT_TIKTOK = process.env.TIKTOK_REDIRECT_URI?.trim() || "https://menteo-publicacion.vercel.app/tiktok";
const MAX_TROZO = 64 * 1024 * 1024;

type Tokens = { accessToken: string; refreshToken: string; caduca: string; openId: string | null; cuenta: string | null };

export function appTikTok() {
  const clave = process.env.TIKTOK_CLIENT_KEY?.trim();
  const secreto = process.env.TIKTOK_CLIENT_SECRET?.trim();
  return clave && secreto ? { clave, secreto } : null;
}

export function urlAutorizarTikTok(estado: string): string | null {
  const app = appTikTok();
  if (!app) return null;
  const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
  u.searchParams.set("client_key", app.clave);
  u.searchParams.set("scope", "video.upload,user.info.basic");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", REDIRECT_TIKTOK);
  u.searchParams.set("state", estado);
  return u.toString();
}

async function pedir(ruta: string, { cuerpo, cabeceras, etiqueta, metodo = "POST" }: { cuerpo?: string; cabeceras: Record<string, string>; etiqueta: string; metodo?: string }) {
  let res: Response;
  try {
    res = await fetch(`${API()}${ruta}`, { method: metodo, headers: cabeceras, body: cuerpo, signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    throw new ErrorRed(`${etiqueta}: fallo de red (${e instanceof Error ? e.name : "error"})`, true);
  }
  const texto = await res.text();
  let j: Record<string, unknown> | null = null;
  try {
    j = JSON.parse(texto);
  } catch {
    throw new ErrorRed(`${etiqueta}: HTTP ${res.status} y la respuesta no era JSON`, res.status >= 500);
  }
  const err = j && typeof j.error === "object" ? (j.error as { code?: string; message?: string; log_id?: string }) : null;
  const codigo = err?.code ?? (typeof j?.error === "string" ? (j.error as string) : null);
  if (res.ok && (!codigo || codigo === "ok")) return j!;
  const detalle = String(err?.message || j?.error_description || "").slice(0, 200);
  throw new ErrorRed(`${etiqueta}: HTTP ${res.status} · ${codigo ?? "error"} -- ${detalle}${err?.log_id ? ` [log_id ${err.log_id}]` : ""}`, res.status === 429 || res.status >= 500);
}

const FORM = { "Content-Type": "application/x-www-form-urlencoded" };

async function guardar(t: Tokens) {
  const { error } = await createSupabaseAdminClient().rpc("redes_secreto_guardar", { p_nombre: "tiktok", p_valor: JSON.stringify(t) });
  if (error) throw new Error("No se pudieron guardar los permisos de TikTok.");
}

function normalizar(j: Record<string, unknown>, cuenta: string | null): Tokens {
  if (!j.access_token || !j.refresh_token) throw new ErrorRed("tiktok/oauth: no devolvió los tokens");
  return {
    accessToken: String(j.access_token),
    refreshToken: String(j.refresh_token),
    caduca: new Date(Date.now() + Number(j.expires_in ?? 0) * 1000).toISOString(),
    openId: (j.open_id as string) ?? null,
    cuenta,
  };
}

/** Canjea el code que enseñó la página de redirección y guarda los tokens en Vault. */
export async function conectarTikTok(code: string): Promise<{ cuenta: string | null }> {
  const app = appTikTok();
  if (!app) throw new Error("Faltan TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET en Vercel.");
  let limpio = code.trim();
  try {
    limpio = decodeURIComponent(limpio);
  } catch {
    /* se queda como vino */
  }
  const j = await pedir("/v2/oauth/token/", {
    cabeceras: FORM,
    cuerpo: new URLSearchParams({ client_key: app.clave, client_secret: app.secreto, code: limpio, grant_type: "authorization_code", redirect_uri: REDIRECT_TIKTOK }).toString(),
    etiqueta: "tiktok/oauth/token",
  });
  const t = normalizar(j, null);
  t.cuenta = await quienSoy(t.accessToken).catch(() => null);
  await guardar(t);
  return { cuenta: t.cuenta };
}

async function quienSoy(token: string): Promise<string | null> {
  // `username` pide user.info.profile y con el scope básico tumba la llamada
  // entera (401 scope_not_authorized): solo display_name.
  const j = await pedir("/v2/user/info/?fields=open_id,display_name", { metodo: "GET", cabeceras: { Authorization: `Bearer ${token}` }, etiqueta: "tiktok/user/info" });
  return ((j.data as { user?: { display_name?: string } })?.user?.display_name as string) ?? null;
}

export async function estadoTikTok(): Promise<{ conectada: boolean; cuenta: string | null; app: boolean }> {
  const { data } = await createSupabaseAdminClient().rpc("redes_secreto_leer", { p_nombre: "tiktok" });
  const t = typeof data === "string" && data ? (JSON.parse(data) as Tokens) : null;
  return { conectada: Boolean(t), cuenta: t?.cuenta ?? null, app: Boolean(appTikTok()) };
}

/** Token vigente: renueva si le queda menos de una hora y guarda el refresh nuevo. */
export async function tokenTikTok(): Promise<string> {
  const app = appTikTok();
  if (!app) throw new ErrorRed("tiktok: faltan TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET");
  const { data } = await createSupabaseAdminClient().rpc("redes_secreto_leer", { p_nombre: "tiktok" });
  if (typeof data !== "string" || !data) throw new ErrorRed("tiktok: la cuenta no está conectada (/plataforma/redes → Conectar TikTok)");
  const t = JSON.parse(data) as Tokens;
  if (Date.parse(t.caduca) - Date.now() > 3600_000) return t.accessToken;
  const j = await pedir("/v2/oauth/token/", {
    cabeceras: FORM,
    cuerpo: new URLSearchParams({ client_key: app.clave, client_secret: app.secreto, grant_type: "refresh_token", refresh_token: t.refreshToken }).toString(),
    etiqueta: "tiktok/oauth/refresh",
  });
  const nuevo = normalizar(j, t.cuenta);
  await guardar(nuevo);
  return nuevo.accessToken;
}

export async function tiktokIniciar({ token, tamano }: { token: string; tamano: number }): Promise<{ publishId: string; subida: string }> {
  if (tamano > MAX_TROZO) throw new ErrorRed("tiktok: el video pasa de 64 MB (un solo trozo)");
  const j = await pedir("/v2/post/publish/inbox/video/init/", {
    cabeceras: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    cuerpo: JSON.stringify({ source_info: { source: "FILE_UPLOAD", video_size: tamano, chunk_size: tamano, total_chunk_count: 1 } }),
    etiqueta: "tiktok/inbox/init",
  });
  const d = (j.data ?? {}) as { publish_id?: string; upload_url?: string };
  if (!d.publish_id || !d.upload_url) throw new ErrorRed("tiktok/inbox/init: faltó publish_id o upload_url");
  return { publishId: d.publish_id, subida: d.upload_url };
}

export async function tiktokSubir({ subida, bytes }: { subida: string; bytes: Uint8Array }): Promise<void> {
  const url = sustituto("TIKTOK_API_URL") ? subida.replace(/^https?:\/\/[^/]+/, sustituto("TIKTOK_API_URL")!) : subida;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length), "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}` },
    body: bytes as unknown as BodyInit,
    signal: AbortSignal.timeout(300_000),
  }).catch((e) => {
    throw new ErrorRed(`tiktok/subida: fallo de red (${e instanceof Error ? e.name : "error"})`, true);
  });
  if (!(res.status === 201 || res.status === 206 || res.ok)) throw new ErrorRed(`tiktok/subida: HTTP ${res.status}`, res.status >= 500 || res.status === 429);
}

/** SEND_TO_USER_INBOX = ya está en borradores. */
export async function tiktokEstado({ token, publishId }: { token: string; publishId: string }): Promise<{ estado: string | null; motivo: string | null }> {
  const j = await pedir("/v2/post/publish/status/fetch/", {
    cabeceras: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    cuerpo: JSON.stringify({ publish_id: publishId }),
    etiqueta: "tiktok/estado",
  });
  const d = (j.data ?? {}) as { status?: string; fail_reason?: string };
  return { estado: d.status ?? null, motivo: d.fail_reason ?? null };
}

export const URL_BORRADORES_TIKTOK = "https://www.tiktok.com/creator-center/upload";

/**
 * Seguidores de la cuenta. Pide el scope `user.info.stats`, que la conexión
 * actual (video.upload + user.info.basic) no trae: sin él TikTok contesta
 * scope_not_authorized y el resumen diario deja los seguidores de TikTok fuera.
 */
export async function seguidoresTikTok(token: string): Promise<number | null> {
  const j = await pedir("/v2/user/info/?fields=follower_count", { metodo: "GET", cabeceras: { Authorization: `Bearer ${token}` }, etiqueta: "tiktok/user/info" });
  const n = (j.data as { user?: { follower_count?: number } })?.user?.follower_count;
  return typeof n === "number" ? n : null;
}
