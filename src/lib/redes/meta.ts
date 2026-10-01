/**
 * Facebook e Instagram por la Graph API, para publicar los videos de
 * PeluDesk. Portado de JoseCPina/video-pipeline (src/lib/meta.mjs), que ya
 * publica Menteo y Checaíto; se conservan sus lecciones:
 *
 *  - El error trae SIEMPRE el code/subcode/mensaje/fbtrace_id de Meta (190 =
 *    token caducado, 100 = parámetro malo, 4 = límite). Solo los 5xx se
 *    reintentan: un 400 contesta lo mismo las cuatro veces.
 *  - Instagram: contenedor REELS con video_url → sondear status_code hasta
 *    FINISHED (y `status`, que dice POR QUÉ falló) → media_publish.
 *  - Reel de Facebook: tres llamadas. La URL del paso 2 LA DA el paso 1
 *    (`upload_url`, host rupload.facebook.com; componerla da
 *    InvalidEndpointError), con cabeceras `Authorization: OAuth` y
 *    `file_url` (Facebook descarga el video de nuestra URL pública). La
 *    descripción va en el finish: en el start se acepta y se pierde.
 *  - Video del muro: una llamada a /<página>/videos con file_url.
 *  - El permalink lo da Meta (no se compone: la URL armada a mano no abre) y
 *    a veces tarda: se pregunta con esperas crecientes.
 *
 * Credenciales (Vercel, sensitive; nunca al navegador ni a los logs):
 *   PELUDESK_META_TOKEN   token de usuario del sistema, no caduca
 *   PELUDESK_FB_PAGE_ID   la página de PeluDesk
 *   PELUDESK_IG_USER_ID   la cuenta de Instagram de empresa ligada a esa página
 * Fuera de producción, META_API_URL apunta a un doble local (scripts/auditoria/redes-dev.mjs).
 */

const VERSION = "v25.0";
const sustituto = (n: string) => (process.env.VERCEL_ENV !== "production" ? process.env[n]?.trim().replace(/\/$/, "") || null : null);
const GRAPH = () => sustituto("META_API_URL") ?? "https://graph.facebook.com";
const REINTENTABLES = new Set([500, 502, 503, 504]);
const TOPE_MS = 120_000;

export class ErrorRed extends Error {
  /** Si con otro intento más tarde puede salir (red, 5xx, contenedor que no termina). */
  constructor(mensaje: string, public reintentable = false) {
    super(mensaje);
  }
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function credencialesMeta() {
  const token = process.env.PELUDESK_META_TOKEN?.trim();
  const pagina = process.env.PELUDESK_FB_PAGE_ID?.trim();
  const ig = process.env.PELUDESK_IG_USER_ID?.trim();
  return { token: token || null, pagina: pagina || null, ig: ig || null };
}

type Json = Record<string, unknown> & { error?: { message?: string; code?: number; error_subcode?: number; type?: string; error_user_msg?: string; fbtrace_id?: string } };

export async function peticion(ruta: string, { metodo = "GET", params = {}, etiqueta, intentos = 3 }: { metodo?: "GET" | "POST" | "DELETE"; params?: Record<string, string | undefined>; etiqueta: string; intentos?: number }): Promise<Json> {
  const url = new URL(`${GRAPH()}/${VERSION}/${ruta}`);
  const cuerpo = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (metodo === "GET") url.searchParams.set(k, v);
    else cuerpo.set(k, v);
  }
  let ultimo: ErrorRed | null = null;
  for (let i = 0; i < intentos; i++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: metodo,
        body: metodo === "GET" ? undefined : cuerpo,
        headers: metodo === "GET" ? undefined : { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(TOPE_MS),
      });
    } catch (e) {
      ultimo = new ErrorRed(`${etiqueta}: fallo de red (${e instanceof Error ? e.name : "error"})`, true);
      if (i < intentos - 1) await dormir(1500 * 2 ** i);
      continue;
    }
    const texto = await res.text();
    let json: Json | null = null;
    try {
      json = JSON.parse(texto) as Json;
    } catch {
      /* abajo */
    }
    if (res.ok && json && !json.error) return json;
    if (!json) throw new ErrorRed(`${etiqueta}: HTTP ${res.status} y la respuesta no era JSON`, res.status >= 500);
    const e = json.error ?? {};
    const partes = [`${etiqueta}: HTTP ${res.status}`, e.code !== undefined ? `code ${e.code}` : null, e.error_subcode !== undefined ? `subcode ${e.error_subcode}` : null].filter(Boolean);
    // El mensaje de Meta nunca trae el token; se recorta por si acaso.
    const detalle = String(e.error_user_msg || e.message || "").slice(0, 300);
    ultimo = new ErrorRed(`${partes.join(" · ")} -- ${detalle}${e.fbtrace_id ? ` [fbtrace_id ${e.fbtrace_id}]` : ""}`, REINTENTABLES.has(res.status) || e.code === 4 || e.code === 2);
    if (!REINTENTABLES.has(res.status) || i === intentos - 1) throw ultimo;
    await dormir(2000 * 2 ** i);
  }
  throw ultimo ?? new ErrorRed(`${etiqueta}: sin respuesta`, true);
}

// ── Instagram ──

/**
 * Contenedor REELS con su portada propia (`cover_url`: Instagram la descarga de
 * nuestra URL pública). Si Meta rechaza la portada (4xx) se reintenta con
 * `thumb_offset` —un cuadro del propio video— para que el reel salga igual y
 * no se pierda la publicación; el motivo queda en los logs.
 */
export async function igCrearContenedor({ ig, token, videoUrl, pie, portadaUrl, portadaOffsetMs = 2000 }: { ig: string; token: string; videoUrl: string; pie: string; portadaUrl?: string; portadaOffsetMs?: number }): Promise<string> {
  const base = { media_type: "REELS", video_url: videoUrl, caption: pie, share_to_feed: "true", access_token: token };
  let j: Json;
  try {
    j = await peticion(`${ig}/media`, { metodo: "POST", params: { ...base, ...(portadaUrl ? { cover_url: portadaUrl } : {}) }, etiqueta: "instagram/media" });
  } catch (e) {
    if (!portadaUrl || (e instanceof ErrorRed && e.reintentable)) throw e;
    console.error("[redes] Instagram rechazó cover_url; se usa thumb_offset:", e instanceof Error ? e.message : e);
    j = await peticion(`${ig}/media`, { metodo: "POST", params: { ...base, thumb_offset: String(portadaOffsetMs) }, etiqueta: "instagram/media(thumb_offset)" });
  }
  if (!j.id) throw new ErrorRed("instagram/media: no devolvió id de contenedor");
  return String(j.id);
}

/** FINISHED | IN_PROGRESS | PUBLISHED | ERROR | EXPIRED, con el motivo. */
export async function igEstado({ contenedor, token }: { contenedor: string; token: string }): Promise<{ estado: string; motivo: string | null }> {
  const j = await peticion(contenedor, { params: { fields: "status_code,status", access_token: token }, etiqueta: "instagram/estado" });
  return { estado: String(j.status_code ?? "").toUpperCase(), motivo: (j.status as string) ?? null };
}

/** Sondea hasta FINISHED o hasta `topeMs`; lo que no termina, se retoma en la siguiente corrida. */
export async function igEsperar({ contenedor, token, topeMs }: { contenedor: string; token: string; topeMs: number }): Promise<string> {
  const limite = Date.now() + topeMs;
  for (;;) {
    const e = await igEstado({ contenedor, token });
    if (e.estado === "FINISHED" || e.estado === "PUBLISHED") return e.estado;
    if (e.estado === "ERROR" || e.estado === "EXPIRED") throw new ErrorRed(`instagram: el contenedor terminó en ${e.estado}. ${e.motivo ?? ""}`.trim());
    if (Date.now() > limite) throw new ErrorRed(`instagram: el contenedor sigue en ${e.estado || "?"}; se retoma en la siguiente corrida`, true);
    await dormir(10_000);
  }
}

export async function igPublicar({ ig, token, contenedor }: { ig: string; token: string; contenedor: string }): Promise<string> {
  const j = await peticion(`${ig}/media_publish`, { metodo: "POST", params: { creation_id: contenedor, access_token: token }, etiqueta: "instagram/media_publish" });
  if (!j.id) throw new ErrorRed("instagram/media_publish: no devolvió id");
  return String(j.id);
}

export async function igPermalink(id: string, token: string): Promise<string | null> {
  try {
    const j = await peticion(id, { params: { fields: "permalink", access_token: token }, etiqueta: "instagram/permalink", intentos: 2 });
    return (j.permalink as string) ?? null;
  } catch {
    return null;
  }
}

// ── Facebook ──

/** Facebook exige el token DE LA PÁGINA (error 210 con el del usuario del sistema): se pide al vuelo, sin guardarlo. */
export async function fbTokenPagina({ pagina, token }: { pagina: string; token: string }): Promise<string> {
  const j = await peticion(pagina, { params: { fields: "access_token", access_token: token }, etiqueta: "facebook/token-pagina", intentos: 2 });
  if (!j.access_token) throw new ErrorRed("facebook/token-pagina: Meta no devolvió el token de la página (¿el usuario del sistema tiene la página asignada con control total?)");
  return String(j.access_token);
}

/** Paso 1 del reel: da el video_id y la URL de subida (no se compone). */
export async function fbReelIniciar({ pagina, token }: { pagina: string; token: string }): Promise<{ videoId: string; subida: string }> {
  const j = await peticion(`${pagina}/video_reels`, { metodo: "POST", params: { upload_phase: "start", access_token: token }, etiqueta: "facebook/reel/start" });
  if (!j.video_id || !j.upload_url) throw new ErrorRed("facebook/reel/start: no devolvió video_id o upload_url");
  return { videoId: String(j.video_id), subida: String(j.upload_url) };
}

/** Paso 2: Facebook descarga el video de nuestra URL pública. Repetirlo es inofensivo. */
export async function fbReelSubir({ subida, token, videoUrl }: { subida: string; token: string; videoUrl: string }): Promise<void> {
  const url = sustituto("META_API_URL") ? subida.replace(/^https?:\/\/[^/]+/, sustituto("META_API_URL")!) : subida;
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { Authorization: `OAuth ${token}`, file_url: videoUrl }, signal: AbortSignal.timeout(TOPE_MS * 2) });
  } catch (e) {
    throw new ErrorRed(`facebook/reel/upload: fallo de red (${e instanceof Error ? e.name : "error"})`, true);
  }
  const j = (await res.json().catch(() => ({}))) as Json & { success?: boolean };
  if (!res.ok || j.error || j.success === false) throw new ErrorRed(`facebook/reel/upload: HTTP ${res.status} ${String(j.error?.message ?? "").slice(0, 200)}`, res.status >= 500);
}

/** Paso 3: publica, con la descripción aquí (en el start se pierde). */
export async function fbReelPublicar({ pagina, token, videoId, pie }: { pagina: string; token: string; videoId: string; pie: string }): Promise<void> {
  const j = await peticion(`${pagina}/video_reels`, { metodo: "POST", params: { upload_phase: "finish", video_id: videoId, video_state: "PUBLISHED", description: pie, access_token: token }, etiqueta: "facebook/reel/finish" });
  if (j.success === false) throw new ErrorRed("facebook/reel/finish: Meta contestó success=false");
}

/** Si el video ya quedó publicado (para retomar sin volver a publicar). */
export async function fbVideoPublicado({ videoId, token }: { videoId: string; token: string }): Promise<boolean> {
  const j = await peticion(videoId, { params: { fields: "status,published", access_token: token }, etiqueta: "facebook/video/estado" });
  const st = j.status as { video_status?: string; publishing_phase?: { status?: string } } | undefined;
  return j.published === true || st?.publishing_phase?.status === "complete";
}

/** Video del muro (16:9), en una llamada. `publicado: false` = privado (para la prueba). */
export async function fbVideoMuro({ pagina, token, videoUrl, pie, publicado = true }: { pagina: string; token: string; videoUrl: string; pie: string; publicado?: boolean }): Promise<string> {
  const j = await peticion(`${pagina}/videos`, { metodo: "POST", params: { file_url: videoUrl, description: pie, published: publicado ? "true" : "false", access_token: token }, etiqueta: "facebook/videos", intentos: 1 });
  const id = (j.id ?? j.video_id) as string | undefined;
  if (!id) throw new ErrorRed("facebook/videos: no devolvió id");
  return String(id);
}

/** Pone la miniatura preferida de un video o reel ya subido (sin republicarlo). */
export async function fbMiniatura({ videoId, token, imagenUrl }: { videoId: string; token: string; imagenUrl: string }): Promise<void> {
  const img = await fetch(imagenUrl, { signal: AbortSignal.timeout(TOPE_MS) }).catch(() => null);
  if (!img?.ok) throw new ErrorRed(`facebook/miniatura: no se pudo leer la portada (${imagenUrl})`, true);
  const form = new FormData();
  form.set("source", new Blob([await img.arrayBuffer()], { type: "image/jpeg" }), "portada.jpg");
  form.set("is_preferred", "true");
  form.set("access_token", token);
  const res = await fetch(`${GRAPH()}/${VERSION}/${videoId}/thumbnails`, { method: "POST", body: form, signal: AbortSignal.timeout(TOPE_MS) }).catch(() => null);
  const j = (await res?.json().catch(() => ({}))) as (Json & { success?: boolean }) | undefined;
  if (!res || !res.ok || j?.error || j?.success === false) throw new ErrorRed(`facebook/miniatura: HTTP ${res?.status ?? "red"} ${String(j?.error?.message ?? "").slice(0, 200)}`, !res || res.status >= 500);
}

export async function fbBorrar({ id, token }: { id: string; token: string }): Promise<void> {
  await peticion(id, { metodo: "DELETE", params: { access_token: token }, etiqueta: "facebook/borrar", intentos: 2 });
}

/** Absoluto para posts, relativo para videos: se completa el host cuando falta. */
export async function fbPermalink(id: string, token: string): Promise<string | null> {
  for (const espera of [3000, 5000, 8000]) {
    try {
      const j = await peticion(id, { params: { fields: "permalink_url", access_token: token }, etiqueta: "facebook/permalink", intentos: 1 });
      const u = j.permalink_url as string | undefined;
      if (u) return /^https?:\/\//.test(u) ? u : `https://www.facebook.com${u}`;
    } catch {
      return null;
    }
    await dormir(espera);
  }
  return null;
}
