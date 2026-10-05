import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mpFetch, mpFetchSinToken } from "./api";
import { MP_AUTH, RENOVAR_ANTES_DIAS, appId, appSecret, esProduccion, hayAplicacion } from "./config";
import { ErrorMercadoPago } from "./errores";
import { urlPlataforma, urlRegresoOauthMp } from "@/lib/pagos/urls";
import type { CredencialesMp } from "@/lib/pagos/tipos";
import { cancelarOrdenesEnCola, restaurarTerminal } from "@/lib/pagos/reconexion";

/**
 * "Conectar Mercado Pago" por OAuth (con PKCE), para que cada negocio cobre
 * con SU cuenta sin copiar tokens.
 *
 * 1. El admin aprieta el botón en su dominio: se guarda un intento (nonce de
 *    un solo uso + verificador PKCE, 15 minutos) y se le manda a Mercado Pago
 *    con un `state` FIRMADO que dice de qué negocio es.
 * 2. Mercado Pago regresa a la redirect_uri registrada (una sola, en el
 *    dominio de la plataforma: /api/mercadopago/oauth). Ahí no hay sesión
 *    del negocio (otro dominio): lo que autoriza es la firma del state y el
 *    nonce sin usar, que solo pudo crear un admin de ese negocio.
 * 3. Se cambia el código por los tokens, que van cifrados a Vault; la fila
 *    de integraciones_cobro guarda solo la cuenta, el nombre y cuándo vence.
 *
 * Sin la aplicación de PeluDesk (MERCADOPAGO_APP_ID/SECRET) y fuera de
 * producción, el paso 1 lleva a una autorización SIMULADA y la conexión
 * queda marcada como simulada: todo lo que cobre es simulación.
 */
const VIGENCIA_INTENTO_MIN = 15;

const b64url = (b: Buffer) => b.toString("base64url");
const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

function llaveEstado(): Buffer {
  const s = process.env.SUPABASE_SECRET_KEY;
  if (!s) throw new Error("Falta SUPABASE_SECRET_KEY para firmar la conexión.");
  return createHash("sha256").update(`peludesk-oauth|${s}`).digest();
}

export function firmarEstado(datos: { n: string; nonce: string; exp: number }): string {
  const cuerpo = b64url(Buffer.from(JSON.stringify(datos)));
  const firma = b64url(createHmac("sha256", llaveEstado()).update(cuerpo).digest());
  return `${cuerpo}.${firma}`;
}

export function leerEstado(state: string | null): { n: string; nonce: string; exp: number } | null {
  if (!state || !state.includes(".")) return null;
  const [cuerpo, firma] = state.split(".");
  const esperada = createHmac("sha256", llaveEstado()).update(cuerpo).digest();
  const dada = Buffer.from(firma, "base64url");
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as { n: string; nonce: string; exp: number };
    if (!/^[0-9a-f-]{36}$/i.test(d.n) || typeof d.nonce !== "string" || !(d.exp > Date.now())) return null;
    return d;
  } catch {
    return null;
  }
}

export function oauthSimulado(): boolean {
  return !hayAplicacion() && !esProduccion();
}

export function oauthDisponible(): boolean {
  return hayAplicacion() || oauthSimulado();
}

/** Paso 1: el intento y la URL a la que se manda al admin. */
export async function iniciarConexion(negocioId: string, usuarioId: string): Promise<string> {
  if (!oauthDisponible()) {
    throw new ErrorMercadoPago("La conexión con Mercado Pago todavía no está disponible.", 0, "Falta dar de alta la aplicación de PeluDesk en Mercado Pago.", null);
  }
  const nonce = b64url(randomBytes(24));
  const verificador = b64url(randomBytes(48));
  const reto = b64url(createHash("sha256").update(verificador).digest());
  const admin = createSupabaseAdminClient(negocioId);
  const { error } = await admin.from("integraciones_oauth").insert({
    negocio_id: negocioId,
    proveedor: "mercadopago",
    nonce_hash: sha256(nonce),
    verificador,
    expira_at: new Date(Date.now() + VIGENCIA_INTENTO_MIN * 60_000).toISOString(),
    created_by: usuarioId,
  });
  if (error) throw new Error(`No se pudo iniciar la conexión: ${error.message}`);
  const state = firmarEstado({ n: negocioId, nonce, exp: Date.now() + VIGENCIA_INTENTO_MIN * 60_000 });

  if (oauthSimulado()) {
    return `${urlPlataforma()}/api/mercadopago/oauth/simulacion?state=${encodeURIComponent(state)}`;
  }
  const url = new URL(MP_AUTH);
  url.searchParams.set("client_id", appId()!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", urlRegresoOauthMp());
  url.searchParams.set("code_challenge", reto);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

type RespuestaToken = {
  access_token: string;
  refresh_token?: string;
  public_key?: string;
  user_id?: number | string;
  expires_in?: number;
  live_mode?: boolean;
};

function aCredenciales(t: RespuestaToken): CredencialesMp {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    publicKey: t.public_key ?? null,
    userId: t.user_id != null ? String(t.user_id) : null,
    expiraAt: new Date(Date.now() + (t.expires_in ?? 15_552_000) * 1000).toISOString(),
    liveMode: t.live_mode ?? null,
  };
}

function credencialesSimuladas(negocioId: string): CredencialesMp {
  return {
    accessToken: `SIM-AT-${b64url(randomBytes(12))}`,
    refreshToken: `SIM-RT-${b64url(randomBytes(12))}`,
    publicKey: null,
    userId: `SIM-${negocioId.slice(0, 8)}`,
    expiraAt: new Date(Date.now() + 180 * 86_400_000).toISOString(),
    liveMode: false,
    simulada: true,
  };
}

async function guardar(admin: SupabaseClient, creds: CredencialesMp) {
  const { error } = await admin.rpc("integracion_guardar_secreto", { p_proveedor: "mercadopago", p_secreto: JSON.stringify(creds) });
  if (error) throw new Error(`No se pudieron guardar las credenciales: ${error.message}`);
}

export type ResultadoConexion = { negocioId: string; ok: boolean; error: string | null };

/** Paso 3: Mercado Pago regresó con el código. */
export async function completarConexion(state: string | null, code: string | null): Promise<ResultadoConexion> {
  const estado = leerEstado(state);
  if (!estado) return { negocioId: "", ok: false, error: "El enlace de conexión no es válido o ya venció. Vuelve a apretar «Conectar Mercado Pago»." };
  const negocioId = estado.n;
  const admin = createSupabaseAdminClient(negocioId);

  // El nonce se usa UNA vez: marcarlo y leer el verificador es atómico.
  const { data: intento } = await admin
    .from("integraciones_oauth")
    .update({ usado_at: new Date().toISOString() })
    .eq("negocio_id", negocioId)
    .eq("nonce_hash", sha256(estado.nonce))
    .is("usado_at", null)
    .gt("expira_at", new Date().toISOString())
    .select("id, verificador, created_by")
    .maybeSingle();
  if (!intento) return { negocioId, ok: false, error: "Este intento de conexión ya se usó o venció. Vuelve a apretar «Conectar Mercado Pago»." };
  const cerrar = (resultado: string) => admin.from("integraciones_oauth").update({ resultado }).eq("id", intento.id);

  if (!code) {
    await cerrar("sin_codigo");
    return { negocioId, ok: false, error: "Mercado Pago no autorizó la conexión (se canceló o se negó el permiso)." };
  }

  let creds: CredencialesMp;
  let nombre: string | null = null;
  try {
    if (code.startsWith("SIM-")) {
      if (!oauthSimulado()) throw new Error("Código simulado fuera de simulación.");
      creds = credencialesSimuladas(negocioId);
      nombre = "Cuenta simulada";
    } else {
      const t = await mpFetchSinToken<RespuestaToken>("/oauth/token", {
        client_id: appId() ?? "",
        client_secret: appSecret() ?? "",
        grant_type: "authorization_code",
        code,
        redirect_uri: urlRegresoOauthMp(),
        code_verifier: intento.verificador as string,
      });
      creds = aCredenciales(t);
      try {
        const yo = await mpFetch<{ id?: number; nickname?: string; email?: string; site_id?: string }>(creds.accessToken, "/users/me");
        nombre = yo.nickname ?? yo.email ?? null;
        if (yo.site_id && yo.site_id !== "MLM") {
          await cerrar("cuenta_no_mexico");
          return { negocioId, ok: false, error: "Esa cuenta de Mercado Pago no es de México: los cobros saldrían en otra moneda." };
        }
      } catch {
        // El nombre es cortesía: sin él la conexión sirve igual.
      }
    }
  } catch (e) {
    await cerrar("error_intercambio");
    return { negocioId, ok: false, error: e instanceof ErrorMercadoPago ? `${e.message} ${e.sugerencia ?? ""}`.trim() : "No pudimos terminar la conexión con Mercado Pago. Vuelve a intentar." };
  }

  // Una cuenta de Mercado Pago cobra para UN negocio: el webhook reconoce el
  // negocio por la cuenta, y dos negocios con la misma serían ambiguos.
  if (creds.userId) {
    const { data: otra } = await createSupabaseAdminClient()
      .from("integraciones_cobro")
      .select("negocio_id")
      .eq("proveedor", "mercadopago")
      .eq("cuenta_id", creds.userId)
      .eq("estado", "conectada")
      .neq("negocio_id", negocioId)
      .is("deleted_at", null)
      .limit(1);
    if (otra?.length) {
      await cerrar("cuenta_de_otro_negocio");
      return { negocioId, ok: false, error: "Esa cuenta de Mercado Pago ya está conectada a otro negocio de PeluDesk. Usa la cuenta de este negocio." };
    }
  }

  await guardar(admin, creds);
  const { data: previa } = await admin
    .from("integraciones_cobro")
    .select("cuenta_id, terminal_id")
    .eq("negocio_id", negocioId)
    .eq("proveedor", "mercadopago")
    .is("deleted_at", null)
    .maybeSingle();
  const mismaCuenta = previa?.cuenta_id && previa.cuenta_id === creds.userId;
  await admin
    .from("integraciones_cobro")
    .update({ elegida: false })
    .eq("negocio_id", negocioId)
    .neq("proveedor", "mercadopago")
    .is("deleted_at", null);
  const { error } = await admin
    .from("integraciones_cobro")
    .update({
      elegida: true,
      estado: "conectada",
      modo: "oauth",
      cuenta_id: creds.userId,
      cuenta_nombre: nombre,
      live_mode: creds.liveMode ?? null,
      token_expira_at: creds.expiraAt,
      renovado_at: null,
      conectada_at: new Date().toISOString(),
      conectada_por: intento.created_by,
      desconectada_at: null,
      ultimo_error: null,
      ...(mismaCuenta ? {} : { terminal_id: null, terminal_nombre: null, terminal_compatible: null }),
    })
    .eq("negocio_id", negocioId)
    .eq("proveedor", "mercadopago")
    .is("deleted_at", null);
  if (error) {
    await cerrar("error_guardado");
    return { negocioId, ok: false, error: "Se autorizó, pero no pudimos guardar la conexión. Vuelve a intentar." };
  }
  // Reconectar deja todo consistente: órdenes viejas fuera de la cola y la
  // terminal de antes (en modo integrado). Nada de esto frena la conexión.
  try {
    await cancelarOrdenesEnCola(admin, negocioId, creds.accessToken, "Orden de antes de reconectar la cuenta de Mercado Pago.");
    if (!creds.simulada) await restaurarTerminal(admin, negocioId, creds.accessToken);
  } catch (e) {
    console.warn("[oauth] no se pudo dejar la terminal lista tras reconectar", e instanceof Error ? e.message : e);
  }
  await cerrar("conectada");
  return { negocioId, ok: true, error: null };
}

/**
 * Renovar el token si le quedan menos de RENOVAR_ANTES_DIAS (o si se pide
 * a la fuerza). Devuelve las credenciales vigentes. Si Mercado Pago ya no
 * acepta el refresh token (se revocó el permiso), la conexión queda en
 * error y el admin ve que tiene que reconectar.
 */
export async function renovarSiHaceFalta(
  admin: SupabaseClient,
  negocioId: string,
  creds: CredencialesMp,
  forzar = false
): Promise<CredencialesMp> {
  const vence = creds.expiraAt ? new Date(creds.expiraAt).getTime() : 0;
  if (!forzar && vence - Date.now() > RENOVAR_ANTES_DIAS * 86_400_000) return creds;

  let nuevas: CredencialesMp;
  try {
    if (creds.simulada) {
      nuevas = { ...creds, accessToken: `SIM-AT-${b64url(randomBytes(12))}`, expiraAt: new Date(Date.now() + 180 * 86_400_000).toISOString() };
    } else {
      if (!creds.refreshToken || !hayAplicacion()) return creds;
      const t = await mpFetchSinToken<RespuestaToken>("/oauth/token", {
        client_id: appId() ?? "",
        client_secret: appSecret() ?? "",
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
      });
      nuevas = { ...aCredenciales(t), userId: t.user_id != null ? String(t.user_id) : creds.userId };
    }
  } catch (e) {
    const rechazado = e instanceof ErrorMercadoPago && (e.status === 400 || e.status === 401);
    await admin
      .from("integraciones_cobro")
      .update({
        ultimo_error: `No se pudo renovar el permiso de Mercado Pago${rechazado ? ": Mercado Pago lo rechazó. Vuelve a conectar la cuenta." : "."}`,
        ...(rechazado && vence < Date.now() ? { estado: "error" } : {}),
      })
      .eq("negocio_id", negocioId)
      .eq("proveedor", "mercadopago")
      .is("deleted_at", null);
    return creds;
  }
  await guardar(admin, nuevas);
  await admin
    .from("integraciones_cobro")
    .update({ token_expira_at: nuevas.expiraAt, renovado_at: new Date().toISOString(), ultimo_error: null, estado: "conectada" })
    .eq("negocio_id", negocioId)
    .eq("proveedor", "mercadopago")
    .is("deleted_at", null);
  return nuevas;
}

/**
 * Desconectar: se borran las credenciales de Vault y la cuenta deja de
 * reconocerse en el webhook. Mercado Pago no tiene cómo revocar el permiso
 * por API: el dueño lo quita desde su cuenta (Seguridad → Aplicaciones
 * conectadas) si quiere.
 */
export async function desconectar(negocioId: string): Promise<void> {
  const admin = createSupabaseAdminClient(negocioId);
  // Antes de borrar las credenciales: las órdenes en cola se cancelan (con las
  // credenciales todavía vigentes) y se recuerda la terminal para reconectar.
  let token: string | null = null;
  try {
    const { data: s } = await admin.rpc("integracion_leer_secreto", { p_proveedor: "mercadopago" });
    if (typeof s === "string" && s) token = (JSON.parse(s) as CredencialesMp).accessToken ?? null;
  } catch {
    token = null;
  }
  await cancelarOrdenesEnCola(admin, negocioId, token, "Se desconectó la cuenta de Mercado Pago.");
  const { data: previa } = await admin
    .from("integraciones_cobro")
    .select("terminal_id")
    .eq("negocio_id", negocioId)
    .eq("proveedor", "mercadopago")
    .is("deleted_at", null)
    .maybeSingle();
  const { error } = await admin.rpc("integracion_borrar_secreto", { p_proveedor: "mercadopago" });
  if (error) throw new Error(error.message);
  await admin
    .from("integraciones_cobro")
    .update({
      estado: "desconectada",
      modo: null,
      cuenta_id: null,
      token_expira_at: null,
      terminal_id: null,
      terminal_nombre: null,
      terminal_compatible: null,
      ...(previa?.terminal_id ? { terminal_previa_id: previa.terminal_id } : {}),
      desconectada_at: new Date().toISOString(),
      ultimo_error: null,
    })
    .eq("negocio_id", negocioId)
    .eq("proveedor", "mercadopago")
    .is("deleted_at", null);
}
