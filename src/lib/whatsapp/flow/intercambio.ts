// Qué contesta el endpoint del Flow a cada petición YA descifrada (ping, aviso de error, INIT, BACK y el intercambio
// de datos de cada pantalla). Depende de puertos: la ruta le pasa la base de verdad (la auditoría la prueba por HTTP).
import {
  DATOS_VACIOS,
  type DatosFlow,
  datosPantallaConfirmacion,
  datosPantallaDatos,
  datosPantallaGiro,
  leerDatos,
  validarDatos,
} from "./definicion";

export type EstadoSesion = "enviado" | "abierto" | "completado" | "creando" | "cuenta_creada" | "ya_tenia" | "error";

export interface SesionFlow {
  id: string;
  telefono: string;
  estado: EstadoSesion;
  enviadoAt: string;
  datos: Partial<DatosFlow>;
}

export interface DepsIntercambio {
  sesion(flowToken: string): Promise<SesionFlow | null>;
  /** Giro, nombre del negocio y ciudad si el prospecto ya existe (por su ref o su teléfono). */
  prellenado(s: SesionFlow): Promise<Partial<DatosFlow>>;
  marcarAbierta(s: SesionFlow): Promise<void>;
  guardarDatos(s: SesionFlow, d: DatosFlow): Promise<void>;
  /** Marca la sesión como completada y deja corriendo la apertura del negocio (no la espera: Meta da 10 s). */
  completar(s: SesionFlow, d: DatosFlow): Promise<void>;
  ahora(): Date;
}

export type Respuesta = { status: number; cuerpo: unknown | null };

/** Un Flow que se mandó hace más de esto ya no se puede llenar: se manda otro. */
export const VIGENCIA_SESION_MS = 72 * 3600_000;
const ABIERTAS: EstadoSesion[] = ["enviado", "abierto", "error"];
const YA_ENVIADAS: EstadoSesion[] = ["completado", "creando", "cuenta_creada", "ya_tenia"];

const exito = (flowToken: string): Respuesta => ({
  status: 200,
  cuerpo: { screen: "SUCCESS", data: { extension_message_response: { params: { flow_token: flowToken } } } },
});
const pantalla = (screen: string, data: unknown): Respuesta => ({ status: 200, cuerpo: { screen, data } });
// 427: el flow_token ya no sirve (Meta le dice a la persona que el formulario ya no está disponible).
const tokenInvalido: Respuesta = { status: 427, cuerpo: { error_msg: "Este formulario ya no está disponible. Escríbenos «Probar gratis» y te mandamos uno nuevo." } };

export async function responderIntercambio(peticion: Record<string, unknown>, deps: DepsIntercambio): Promise<Respuesta> {
  const accion = String(peticion.action ?? "");
  if (accion === "ping") return { status: 200, cuerpo: { data: { status: "active" } } };

  const data = (peticion.data ?? {}) as Record<string, unknown>;
  const flowToken = typeof peticion.flow_token === "string" ? peticion.flow_token : "";
  // Aviso de error del cliente de WhatsApp (una pantalla que no pudo pintar lo que mandamos): se acusa de recibido.
  if (typeof data.error === "string" && accion !== "INIT") return { status: 200, cuerpo: { data: { acknowledged: true } } };

  const s = flowToken ? await deps.sesion(flowToken) : null;
  if (!s || deps.ahora().getTime() - Date.parse(s.enviadoAt) > VIGENCIA_SESION_MS) return tokenInvalido;

  if (accion === "INIT" || accion === "BACK") {
    if (!ABIERTAS.includes(s.estado)) return tokenInvalido;
    const previo = { ...DATOS_VACIOS, ...(await deps.prellenado(s).catch(() => ({}))), ...limpio(s.datos) };
    if (s.estado === "enviado") await deps.marcarAbierta(s).catch(() => {});
    return pantalla("GIRO", datosPantallaGiro(previo));
  }

  if (accion !== "data_exchange") return { status: 400, cuerpo: { error_msg: "Acción desconocida." } };
  const d = leerDatos(data);
  if (data.pantalla === "DATOS") {
    if (!ABIERTAS.includes(s.estado)) return tokenInvalido;
    const errores = validarDatos(d);
    await deps.guardarDatos(s, d).catch(() => {});
    if (errores.giro) return pantalla("GIRO", datosPantallaGiro(d));
    if (Object.keys(errores).length) return pantalla("DATOS", datosPantallaDatos(d, errores));
    return pantalla("CONFIRMACION", datosPantallaConfirmacion(d));
  }
  if (data.pantalla === "CONFIRMACION") {
    // Un segundo toque (o un reintento de Meta) a una sesión ya enviada: misma respuesta, nada se abre dos veces.
    if (YA_ENVIADAS.includes(s.estado)) return exito(flowToken);
    const errores = validarDatos(d);
    if (errores.giro) return pantalla("GIRO", datosPantallaGiro(d));
    if (Object.keys(errores).length) return pantalla("DATOS", datosPantallaDatos(d, errores));
    if (data.acepto !== true && data.acepto !== "true") return pantalla("CONFIRMACION", datosPantallaConfirmacion(d));
    await deps.completar(s, d);
    return exito(flowToken);
  }
  return { status: 400, cuerpo: { error_msg: "Pantalla desconocida." } };
}

function limpio(d: Partial<DatosFlow> | null | undefined): Partial<DatosFlow> {
  const r: Partial<DatosFlow> = {};
  for (const [k, v] of Object.entries(d ?? {})) if (typeof v === "string" && v) (r as Record<string, string>)[k] = v;
  return r;
}
