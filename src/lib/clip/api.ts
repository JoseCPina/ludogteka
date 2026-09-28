import { ErrorProveedor, type CredencialesClip } from "@/lib/pagos/tipos";

/**
 * API de Punto de Venta de Clip (PinPad API): la app manda el monto a la
 * terminal Clip del negocio y Clip avisa por webhook cuando se paga.
 *
 * CONSTRUIDO CONTRA LA DOCUMENTACIÓN, SIN SANDBOX: Clip no tiene ambiente de
 * pruebas. Lo que falta confirmar con un cobro real de monto pequeño está en
 * CLAUDE.md («Clip: qué falta probar»). Todo lo que depende de la forma
 * exacta de la API vive en este archivo y en terminal.ts, para ajustarlo en
 * un solo lugar.
 *
 *   Autenticación  Authorization: Basic base64(api_key:secret_key)
 *                  (las dos se generan en el portal de desarrolladores de Clip).
 *   POST   /f2f/pinpad/v1/payment               crea el cobro en la terminal
 *   GET    /f2f/pinpad/v1/payment?pinpadRequestId=  estado del cobro
 *   DELETE /f2f/pinpad/v1/payment?pinpadRequestId=  lo cancela si no se ha pagado
 */
// CLIP_API_URL (fuera de producción) apunta a un Clip de mentiras para probar.
export const CLIP_API = (process.env.VERCEL_ENV !== "production" && process.env.CLIP_API_URL?.trim()) || "https://api.payclip.com";
const TOPE_MS = 15_000;

export class ErrorClip extends ErrorProveedor {
  constructor(message: string, status: number, sugerencia: string | null, detalle: string | null) {
    super(message, status, sugerencia, detalle);
    this.name = "ErrorClip";
  }
}

function traducir(status: number, cuerpo: unknown): { mensaje: string; sugerencia: string | null } {
  const c = (typeof cuerpo === "object" && cuerpo !== null ? cuerpo : {}) as { message?: string; error?: string; detail?: string };
  const detalle = c.message ?? c.detail ?? c.error ?? "";
  if (status === 401 || status === 403) {
    return {
      mensaje: "Clip rechazó las credenciales.",
      sugerencia: "Revisa la API key y la clave secreta en Administración → Cobro con terminal (se generan en el portal de desarrolladores de Clip).",
    };
  }
  if (status === 404) return { mensaje: "Clip no encontró el cobro o la terminal.", sugerencia: "Revisa el número de serie de la terminal." };
  if (status === 409 || /busy|in progress|ocupad/i.test(detalle)) {
    return { mensaje: "La terminal Clip ya tiene un cobro en curso.", sugerencia: "Termínalo o cancélalo en la terminal antes de mandar otro." };
  }
  if (status === 400 || status === 422) {
    return { mensaje: `Clip rechazó la petición${detalle ? `: ${detalle}` : "."}`, sugerencia: "Revisa el monto, el número de serie y el usuario de Clip asignado a la terminal." };
  }
  if (status >= 500) return { mensaje: "Clip tuvo un error interno.", sugerencia: "Vuelve a intentar en un momento; si sigue, cobra a mano." };
  return { mensaje: `Clip respondió ${status}${detalle ? `: ${detalle}` : "."}`, sugerencia: null };
}

export async function clipFetch<T>(creds: CredencialesClip, ruta: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const auth = Buffer.from(`${creds.apiKey}:${creds.secretKey}`).toString("base64");
  let respuesta: Response;
  try {
    respuesta = await fetch(`${CLIP_API}${ruta}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TOPE_MS),
      cache: "no-store",
    });
  } catch (e) {
    const esTope = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ErrorClip(esTope ? "Clip no respondió a tiempo." : "No se pudo conectar con Clip.", 0, "Revisa la conexión a internet y vuelve a intentar.", e instanceof Error ? e.message : String(e));
  }
  const texto = await respuesta.text();
  let cuerpo: unknown = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto;
  }
  if (!respuesta.ok) {
    const { mensaje, sugerencia } = traducir(respuesta.status, cuerpo);
    throw new ErrorClip(mensaje, respuesta.status, sugerencia, texto.slice(0, 500));
  }
  return cuerpo as T;
}
