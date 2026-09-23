import { MP_API, accessToken } from "./config";
import { ErrorMercadoPago, traducirRespuestaMp } from "./errores";

// Toda llamada a Mercado Pago pasa por aquí: token, tope de tiempo y
// traducción del error. Un fetch sin tope deja a recepción esperando con
// el cliente enfrente; 15 segundos es de sobra para la API (la espera
// larga es la del cliente pagando en la terminal, y esa la lleva la
// pantalla con su propio reloj).
const TOPE_MS = 15_000;

export async function mpFetch<T>(
  ruta: string,
  init: { method?: string; body?: unknown; idempotencia?: string } = {}
): Promise<T> {
  const token = accessToken();
  if (!token) throw new ErrorMercadoPago("Mercado Pago no está configurado.", 0, "Falta MERCADOPAGO_ACCESS_TOKEN.", null);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (init.idempotencia) headers["X-Idempotency-Key"] = init.idempotencia;

  let respuesta: Response;
  try {
    respuesta = await fetch(`${MP_API}${ruta}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TOPE_MS),
      cache: "no-store",
    });
  } catch (e) {
    const esTope = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ErrorMercadoPago(
      esTope ? "Mercado Pago no respondió a tiempo." : "No se pudo conectar con Mercado Pago.",
      0,
      esTope ? "Revisa la conexión a internet del negocio y vuelve a intentar." : "Revisa la conexión a internet; si la app corre en Vercel, revisa el estado de Mercado Pago.",
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
