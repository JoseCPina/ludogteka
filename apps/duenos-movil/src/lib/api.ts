import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStoreNativo from "expo-secure-store";

// En web (capturas y pruebas del mismo código) no hay almacén seguro: localStorage.
const SecureStore = Platform.OS === "web"
  ? {
      getItemAsync: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
      setItemAsync: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
      deleteItemAsync: async (k: string) => globalThis.localStorage?.removeItem(k),
    }
  : SecureStoreNativo;

/**
 * La app habla SOLO con /api/movil/<accion> de app.peludesk.mx (src/app/api/movil en la web): las mismas funciones de
 * la web con la sesión del celular. La sesión (access y refresh token de la cuenta del dueño) vive en el almacén
 * seguro del sistema (Keychain en iOS, Keystore en Android) y se renueva sola antes de vencer.
 */
export const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "https://app.peludesk.mx";

const LLAVE = "peludesk.sesion";
const TOPE_MS = 30_000;

export type Tokens = { accessToken: string; refreshToken: string; expiraAt: number };
export type Resultado<T = Record<string, unknown>> = { error: string | null } & T;

let tokens: Tokens | null = null;
let renovando: Promise<Tokens | null> | null = null;
const escuchas = new Set<(t: Tokens | null) => void>();

export function alCambiarSesion(fn: (t: Tokens | null) => void): () => void {
  escuchas.add(fn);
  return () => escuchas.delete(fn);
}

async function guardar(t: Tokens | null) {
  tokens = t;
  if (t) await SecureStore.setItemAsync(LLAVE, JSON.stringify(t));
  else await SecureStore.deleteItemAsync(LLAVE);
  escuchas.forEach((fn) => fn(t));
}

export async function cargarSesion(): Promise<Tokens | null> {
  try {
    const crudo = await SecureStore.getItemAsync(LLAVE);
    tokens = crudo ? (JSON.parse(crudo) as Tokens) : null;
  } catch {
    tokens = null;
  }
  return tokens;
}

export const abrirSesion = (t: Tokens) => guardar(t);
export const cerrarSesion = () => guardar(null);

export class ErrorDeRed extends Error {}

async function crudo(accion: string, cuerpo: BodyInit, json: boolean, token: string | null): Promise<Response> {
  const control = new AbortController();
  const tope = setTimeout(() => control.abort(), TOPE_MS);
  try {
    return await fetch(`${API_URL}/api/movil/${accion}`, {
      method: "POST",
      headers: { accept: "application/json", ...(json ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: cuerpo,
      signal: control.signal,
    });
  } catch {
    throw new ErrorDeRed(control.signal.aborted ? "Tardó demasiado. Revisa tu conexión e intenta de nuevo." : "No hay conexión. Revisa tu internet e intenta de nuevo.");
  } finally {
    clearTimeout(tope);
  }
}

async function renovar(): Promise<Tokens | null> {
  if (!tokens?.refreshToken) return null;
  renovando ??= (async () => {
    try {
      const r = await crudo("renovarSesion", JSON.stringify({ args: [tokens!.refreshToken] }), true, null);
      const j = (await r.json()) as { tokens?: Tokens };
      if (j.tokens) {
        await guardar(j.tokens);
        return j.tokens;
      }
      await guardar(null);
      return null;
    } catch {
      return tokens; // sin red: se queda la sesión; la siguiente petición vuelve a intentar.
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

async function tokenVigente(): Promise<string | null> {
  if (!tokens) return null;
  // Se renueva cinco minutos antes de vencer (el servidor la da por vencida 90 s antes).
  if (tokens.expiraAt && tokens.expiraAt * 1000 - Date.now() < 5 * 60_000) await renovar();
  return tokens?.accessToken ?? null;
}

/**
 * Llama una acción. Con `archivos`, va como multipart: los archivos en el FormData y, en `args`, "$form" donde la
 * acción espera el FormData. Un 401 renueva la sesión una vez y repite; si no se puede, cierra la sesión.
 */
export async function llamar<T = Record<string, unknown>>(accion: string, args: unknown[] = [], archivos?: { campo: string; uri: string; nombre: string; tipo: string }[], campos?: Record<string, string>): Promise<T & { error: string | null }> {
  const armar = (): { cuerpo: BodyInit; json: boolean } => {
    if (!archivos?.length && !campos) return { cuerpo: JSON.stringify({ args }), json: true };
    const form = new FormData();
    form.append("args", JSON.stringify(args));
    for (const [k, v] of Object.entries(campos ?? {})) form.append(k, v);
    for (const a of archivos ?? []) form.append(a.campo, { uri: a.uri, name: a.nombre, type: a.tipo } as unknown as Blob);
    return { cuerpo: form, json: false };
  };
  let token = await tokenVigente();
  let { cuerpo, json } = armar();
  let r = await crudo(accion, cuerpo, json, token);
  if (r.status === 401 && tokens) {
    token = (await renovar())?.accessToken ?? null;
    if (!token) return { error: "Tu sesión se cerró. Vuelve a entrar." } as T & { error: string };
    ({ cuerpo, json } = armar());
    r = await crudo(accion, cuerpo, json, token);
    if (r.status === 401) {
      await guardar(null);
      return { error: "Tu sesión se cerró. Vuelve a entrar." } as T & { error: string };
    }
  }
  try {
    const j = (await r.json()) as T & { error?: string | null };
    return { ...j, error: j.error ?? (r.ok ? null : "Algo falló de nuestro lado. Intenta de nuevo.") } as T & { error: string | null };
  } catch {
    return { error: r.ok ? null : "Algo falló de nuestro lado. Intenta de nuevo." } as T & { error: string | null };
  }
}
