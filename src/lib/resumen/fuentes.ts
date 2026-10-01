/**
 * De dónde sale cada número del resumen diario. Cada fuente se lee sola: si
 * una falla, el resumen sale igual con «No pude leer X: motivo» (nunca se
 * queda callado). Lo que el token de Meta no permite leer (comprobado el 30
 * de septiembre de 2026 con PELUDESK_META_TOKEN) se deja fuera y se anota en
 * `faltan` con el permiso que lo daría:
 *   - comentarios de Facebook ............ pages_read_user_content
 *   - alcance/guardados/compartidos/vistas  read_insights (Facebook) e
 *     instagram_manage_insights (Instagram)
 *   - seguidores de TikTok ............... scope user.info.stats
 * Todo lo demás (seguidores, me gusta y comentarios de Instagram, comentarios
 * de los anuncios que salen por Instagram, la campaña) sí lo da.
 * Ningún token se imprime, se guarda ni viaja en un mensaje.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { modoStripe } from "@/lib/cobro/stripe";
import { credencialesMeta, fbTokenPagina, peticion, ErrorRed } from "@/lib/redes/meta";
import { seguidoresTikTok, tokenTikTok } from "@/lib/redes/tiktok";
import { ANUNCIO_UTM, CAMPANA_ID, CAMPANA_NOMBRE_CONTIENE, CUENTA_PUBLICITARIA, UTM_CAMPANA, ZONA } from "./config";

export type Fuente<T> = { ok: true; datos: T } | { ok: false; motivo: string };

/** Quita cualquier rastro de credenciales de un mensaje de error. */
export function limpiarMotivo(m: string): string {
  let t = m;
  for (const s of [process.env.PELUDESK_META_TOKEN, process.env.TELEGRAM_BOT_TOKEN, process.env.TIKTOK_CLIENT_SECRET]) if (s && s.length > 8) t = t.split(s).join("«token»");
  return t.replace(/(access_token|input_token)=[^&\s"]+/g, "$1=«token»").replace(/\s+/g, " ").slice(0, 200);
}

export async function leer<T>(fn: () => Promise<T>): Promise<Fuente<T>> {
  try {
    return { ok: true, datos: await fn() };
  } catch (e) {
    return { ok: false, motivo: limpiarMotivo(e instanceof Error ? e.message : String(e)) };
  }
}

const esPermiso = (e: unknown) => e instanceof Error && /code (10|200|190)\b|permission|scope/i.test(e.message);

// ── Fechas del negocio (Ciudad de México) ──
export function diaCDMX(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function horaCDMX(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", hour12: false }).format(d)) % 24;
}
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const diaSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0 domingo … 1 lunes

// ── Base de datos ──
export type DatosInternos = {
  registros: { dia: number; antes: number; mes: number; semana: number; semana_antes: number; campana_dia: number; campana_mes: number; origen_dia: { origen: string; n: number }[]; origen_mes: { origen: string; n: number }[]; anuncio_dia: Record<string, number>; anuncio_mes: Record<string, number> };
  negocios: { pruebas_activas: number; vencen: { nombre: string; dias: number }[]; convertidas_dia: number; convertidas_mes: number; cancelaciones_dia: number; cancelaciones_mes: number; pagos_fallidos_dia: number; en_gracia: { nombre: string; estado: string }[]; mrr_centavos: number };
  chats: { prospectos: number; clientes: number; antes_prospectos: number; antes_clientes: number; ia_sola: number; escaladas: number; escaladas_abiertas: number; primera_respuesta_seg: number | null; primera_respuesta_n: number; sin_contestar: { tel4: string; horas: number }[]; ia_errores_24h: number; ia_ultimo: string | null; ia_costo_mxn: number };
  redes: { publicadas: { video: string; red: string; formato: string; url: string | null; publicacion_id: string | null }[]; hoy: { video: string; red: string; hora: string }[]; borradores: { video: string; fecha: string }[]; con_problema: { video: string; red: string; estado: string; error: string }[] };
};

export async function datosInternos(dia: string, umbralHoras: number): Promise<DatosInternos> {
  const { data, error } = await createSupabaseAdminClient().rpc("resumen_datos", { p_dia: dia, p_modo: modoStripe(), p_utm_campana: UTM_CAMPANA, p_horas_sin_contestar: umbralHoras });
  if (error) throw new Error(`resumen_datos: ${error.message}`);
  return data as DatosInternos;
}

// ── Meta ──
const meta = () => {
  const c = credencialesMeta();
  if (!c.token) throw new ErrorRed("falta PELUDESK_META_TOKEN");
  return c as { token: string; pagina: string | null; ig: string | null };
};
const g = (ruta: string, params: Record<string, string>, token: string) => peticion(ruta, { params: { ...params, access_token: token }, etiqueta: ruta.split("/").pop()!.split("?")[0], intentos: 2 });
type J = Record<string, unknown>;
const lista = (j: J): J[] => (Array.isArray(j.data) ? (j.data as J[]) : []);

export async function tokenMeta(): Promise<{ valido: boolean; caducaEnDias: number | null; accesoEnDias: number | null }> {
  const { token } = meta();
  try {
    const j = await g("debug_token", { input_token: token }, token);
    const d = (j.data ?? {}) as { is_valid?: boolean; expires_at?: number; data_access_expires_at?: number };
    const dias = (s?: number) => (s && s > 0 ? Math.floor((s * 1000 - Date.now()) / 86_400_000) : null);
    return { valido: d.is_valid !== false, caducaEnDias: dias(d.expires_at), accesoEnDias: dias(d.data_access_expires_at) };
  } catch (e) {
    if (e instanceof Error && /code 190/.test(e.message)) return { valido: false, caducaEnDias: null, accesoEnDias: null };
    throw e;
  }
}

export type Comentario = { red: string; origen: "orgánico" | "anuncio"; autor: string; texto: string; cuando: string; pregunta: boolean };
const PREGUNTA = /[?¿]|\b(precio|cu[aá]nto|cuesta|costo|informes?|info|c[oó]mo|d[oó]nde|tienen|contratar|demo|prueba|quiero|interesa|disponible|incluye|factura)\b/i;
export const pareceDuda = (t: string) => PREGUNTA.test(t);

export type DatosIg = {
  seguidores: number | null;
  publicadas: { video: string; url: string | null; likes: number | null; comentarios: number | null; alcance?: number; guardados?: number; compartidos?: number; vistas?: number }[];
  comentarios: Comentario[];
  faltan: string[];
};

export async function instagram(dia: string, publicadas: DatosInternos["redes"]["publicadas"], idsAnuncio: string[]): Promise<DatosIg> {
  const { token, ig } = meta();
  if (!ig) throw new ErrorRed("falta PELUDESK_IG_USER_ID");
  const faltan: string[] = [];
  const perfil = await g(ig, { fields: "followers_count" }, token);
  const media = lista(await g(`${ig}/media`, { fields: "id,permalink,timestamp,like_count,comments_count", limit: "30" }, token));
  const porId = new Map(media.map((m) => [String(m.id), m]));
  let sinInsights = false;
  const pub: DatosIg["publicadas"] = [];
  for (const p of publicadas.filter((x) => x.red === "instagram")) {
    const m = p.publicacion_id ? porId.get(p.publicacion_id) : undefined;
    const fila: DatosIg["publicadas"][number] = { video: p.video, url: p.url ?? (m?.permalink as string) ?? null, likes: m ? Number(m.like_count ?? 0) : null, comentarios: m ? Number(m.comments_count ?? 0) : null };
    if (p.publicacion_id && !sinInsights) {
      try {
        const ins = lista(await g(`${p.publicacion_id}/insights`, { metric: "reach,saved,shares,views" }, token));
        const v = (n: string) => Number((ins.find((i) => i.name === n)?.values as { value: number }[] | undefined)?.[0]?.value ?? 0);
        Object.assign(fila, { alcance: v("reach"), guardados: v("saved"), compartidos: v("shares"), vistas: v("views") });
      } catch (e) {
        if (!esPermiso(e)) throw e;
        sinInsights = true;
        faltan.push("instagram_manage_insights (alcance, guardados, compartidos y vistas de Instagram)");
      }
    }
    pub.push(fila);
  }
  const desde = Date.parse(`${dia}T00:00:00-06:00`);
  const hasta = desde + 86_400_000;
  const comentarios: Comentario[] = [];
  const mirar: { id: string; origen: Comentario["origen"] }[] = [
    ...media.filter((m) => Number(m.comments_count ?? 0) > 0).slice(0, 12).map((m) => ({ id: String(m.id), origen: "orgánico" as const })),
    ...idsAnuncio.map((id) => ({ id, origen: "anuncio" as const })),
  ];
  const vistos = new Set<string>();
  for (const { id, origen } of mirar) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    const cs = lista(await g(`${id}/comments`, { fields: "text,username,timestamp", limit: "50" }, token).catch((e) => {
      if (esPermiso(e)) return { data: [] } as J;
      throw e;
    }));
    for (const c of cs) {
      const t = Date.parse(String(c.timestamp));
      if (t >= desde && t < hasta) comentarios.push({ red: "Instagram", origen, autor: String(c.username ?? "?"), texto: String(c.text ?? ""), cuando: String(c.timestamp), pregunta: pareceDuda(String(c.text ?? "")) });
    }
  }
  return { seguidores: Number(perfil.followers_count ?? 0), publicadas: pub, comentarios, faltan };
}

export type DatosFb = { seguidores: number | null; publicadas: { video: string; url: string | null; likes: number | null; comentarios: number | null }[] };

export async function facebook(publicadas: DatosInternos["redes"]["publicadas"]): Promise<DatosFb> {
  const { token: tokenUsuario, pagina } = meta();
  if (!pagina) throw new ErrorRed("falta PELUDESK_FB_PAGE_ID");
  const perfil = await g(pagina, { fields: "followers_count,fan_count" }, tokenUsuario);
  const pub: DatosFb["publicadas"] = [];
  const fb = publicadas.filter((x) => x.red === "facebook");
  if (fb.length) {
    const token = await fbTokenPagina({ pagina, token: tokenUsuario });
    for (const p of fb) {
      let likes: number | null = null;
      let comentarios: number | null = null;
      if (p.publicacion_id) {
        try {
          const j = await g(p.publicacion_id, { fields: "likes.summary(true).limit(0),comments.summary(true).limit(0)" }, token);
          likes = Number((j.likes as { summary?: { total_count?: number } } | undefined)?.summary?.total_count ?? 0);
          comentarios = Number((j.comments as { summary?: { total_count?: number } } | undefined)?.summary?.total_count ?? 0);
        } catch (e) {
          if (!esPermiso(e)) throw e;
        }
      }
      pub.push({ video: p.video, url: p.url, likes, comentarios });
    }
  }
  return { seguidores: Number(perfil.followers_count ?? perfil.fan_count ?? 0), publicadas: pub };
}

// ── TikTok ──
export type DatosTikTok = { seguidores: number | null; faltan: string[] };
export async function tiktok(): Promise<DatosTikTok> {
  const token = await tokenTikTok(); // si no renueva, es una alerta: hay que reconectar
  try {
    return { seguidores: await seguidoresTikTok(token), faltan: [] };
  } catch (e) {
    if (e instanceof Error && /scope|unauthorized|permission/i.test(e.message)) return { seguidores: null, faltan: ["user.info.stats (seguidores de TikTok): agrégalo al scope de la app de TikTok y vuelve a conectar la cuenta"] };
    throw e;
  }
}

// ── Campaña de PeluDesk ──
export type M = { gasto: number; impresiones: number; clics: number; ctr: number; registros: number };
export type Anuncio = { id: string; nombre: string; utm: string | null; estado: string; problema: string | null; dia: M; mes: M; igMedia: string | null };
export type DatosCampana = { nombre: string; estado: string; dia: M; antes: M; mes: M; semana: M | null; semanaAntes: M | null; anuncios: Anuncio[]; restoCuentaDia: number | null };

const REGISTRO = ["offsite_conversion.fb_pixel_complete_registration", "complete_registration", "omni_complete_registration"];
function aM(f: J | undefined): M {
  if (!f) return { gasto: 0, impresiones: 0, clics: 0, ctr: 0, registros: 0 };
  const acciones = (f.actions as { action_type: string; value: string }[] | undefined) ?? [];
  const reg = REGISTRO.map((t) => acciones.find((a) => a.action_type === t)).find(Boolean);
  return { gasto: Number(f.spend ?? 0), impresiones: Number(f.impressions ?? 0), clics: Number(f.clicks ?? 0), ctr: Number(f.ctr ?? 0), registros: Number(reg?.value ?? 0) };
}
const rango = (a: string, b: string) => JSON.stringify({ since: a, until: b });
const CAMPOS = "spend,impressions,clicks,ctr,actions";

export async function campana(dia: string, lunes: boolean): Promise<DatosCampana> {
  const { token } = meta();
  // Sólo la campaña de PeluDesk: si el id apuntara a otra cosa (p. ej. de Checaíto), se aborta.
  const info = await g(CAMPANA_ID, { fields: "name,effective_status" }, token);
  const nombre = String(info.name ?? "");
  if (!nombre.includes(CAMPANA_NOMBRE_CONTIENE)) throw new ErrorRed(`la campaña ${CAMPANA_ID} no es de PeluDesk; no se lee`);
  const mes0 = `${dia.slice(0, 7)}-01`;
  const pedir = async (a: string, b: string, nivel?: "ad") => lista(await g(`${CAMPANA_ID}/insights`, { time_range: rango(a, b), fields: nivel ? `ad_id,ad_name,${CAMPOS}` : CAMPOS, ...(nivel ? { level: nivel, limit: "50" } : {}) }, token));
  const [d, a, m, ad, am] = await Promise.all([pedir(dia, dia), pedir(sumarDias(dia, -1), sumarDias(dia, -1)), pedir(mes0, dia), pedir(dia, dia, "ad"), pedir(mes0, dia, "ad")]);
  let semana: M | null = null;
  let semanaAntes: M | null = null;
  if (lunes) {
    const [s, sa] = await Promise.all([pedir(sumarDias(dia, -6), dia), pedir(sumarDias(dia, -13), sumarDias(dia, -7))]);
    semana = aM(s[0]);
    semanaAntes = aM(sa[0]);
  }
  const ads = lista(await g(`${CAMPANA_ID}/ads`, { fields: "id,name,effective_status,issues_info,creative{effective_instagram_media_id}", limit: "50" }, token));
  const anuncios: Anuncio[] = ads.map((x) => {
    const id = String(x.id);
    const nom = String(x.name ?? "");
    const issues = (x.issues_info as { error_summary?: string; level?: string }[] | undefined) ?? [];
    const estado = String(x.effective_status ?? "");
    return {
      id,
      nombre: nom,
      utm: ANUNCIO_UTM[nom] ?? null,
      estado,
      problema: ["DISAPPROVED", "WITH_ISSUES"].includes(estado) || issues.length ? `${estado}${issues[0]?.error_summary ? `: ${issues[0].error_summary}` : ""}`.slice(0, 160) : null,
      dia: aM(ad.find((r) => r.ad_id === id)),
      mes: aM(am.find((r) => r.ad_id === id)),
      igMedia: ((x.creative as { effective_instagram_media_id?: string } | undefined)?.effective_instagram_media_id as string) ?? null,
    };
  });
  let resto: number | null = null;
  try {
    const cuenta = lista(await g(`${CUENTA_PUBLICITARIA}/insights`, { time_range: rango(dia, dia), fields: "spend" }, token));
    resto = Math.max(0, Number(cuenta[0]?.spend ?? 0) - aM(d[0]).gasto);
  } catch {
    resto = null;
  }
  return { nombre, estado: String(info.effective_status ?? ""), dia: aM(d[0]), antes: aM(a[0]), mes: aM(m[0]), semana, semanaAntes, anuncios, restoCuentaDia: resto };
}
