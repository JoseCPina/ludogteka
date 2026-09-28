import { MP_API } from "./config";
import { ErrorMercadoPago, traducirRespuestaMp } from "./errores";

// Toda llamada a Mercado Pago pasa por aquí: el token de LA CONEXIÓN del
// negocio (nunca uno global), tope de tiempo y traducción del error. Un
// fetch sin tope deja a recepción esperando con el cliente enfrente.
const TOPE_MS = 15_000;

export async function mpFetch<T>(
  token: string,
  ruta: string,
  init: { method?: string; body?: unknown; idempotencia?: string; form?: Record<string, string> } = {}
): Promise<T> {
  if (!token) throw new ErrorMercadoPago("Mercado Pago no está conectado.", 0, "Conecta la cuenta en Administración → Cobro con terminal.", null);

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: string | undefined;
  if (init.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.form).toString();
  } else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  if (init.idempotencia) headers["X-Idempotency-Key"] = init.idempotencia;
  return pedir<T>(`${MP_API}${ruta}`, { method: init.method ?? "GET", headers, body });
}

// Sin token (el intercambio de OAuth va con client_id/secret en el cuerpo).
export async function mpFetchSinToken<T>(ruta: string, form: Record<string, string>): Promise<T> {
  return pedir<T>(`${MP_API}${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
}

async function pedir<T>(url: string, init: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(TOPE_MS), cache: "no-store" });
  } catch (e) {
    const esTope = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ErrorMercadoPago(
      esTope ? "Mercado Pago no respondió a tiempo." : "No se pudo conectar con Mercado Pago.",
      0,
      esTope ? "Revisa la conexión a internet del negocio y vuelve a intentar." : "Revisa la conexión a internet y el estado de Mercado Pago.",
      e instanceof Error ? e.message : String(e)
    );
  }
  const texto = await respuesta.text();
  let cuerpo: unknown = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto;
  }
  if (!respuesta.ok) {
    const { mensaje, sugerencia } = traducirRespuestaMp(respuesta.status, cuerpo);
    throw new ErrorMercadoPago(mensaje, respuesta.status, sugerencia, texto.slice(0, 500));
  }
  return cuerpo as T;
}
