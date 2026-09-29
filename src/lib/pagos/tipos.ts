/**
 * La capa de cobro integrado de PeluDesk: con qué cobra cada negocio en su
 * terminal y por link, sin que la caja sepa qué proveedor hay detrás.
 *
 *   manual       efectivo, transferencia o tarjeta en una terminal no
 *                integrada: existe siempre, como respaldo.
 *   mercadopago  la cuenta del negocio conectada por OAuth (o, en Ludogteka
 *                mientras no se reconecte, la llave del entorno).
 *   clip         credenciales de la API de Punto de Venta de Clip.
 *
 * Cada proveedor es un adaptador (src/lib/pagos/adaptadores.ts). Las
 * credenciales viven cifradas en Vault y solo se leen en el servidor, para
 * el negocio de la petición (src/lib/pagos/conexion.ts).
 */
export type ProveedorIntegrado = "mercadopago" | "clip";
export type ProveedorElegible = "manual" | ProveedorIntegrado;

export const NOMBRE_PROVEEDOR: Record<ProveedorElegible, string> = {
  manual: "Solo manual",
  mercadopago: "Mercado Pago",
  clip: "Clip",
};

export type CredencialesMp = {
  accessToken: string;
  refreshToken?: string | null;
  publicKey?: string | null;
  userId?: string | null;
  // ISO; el access token de OAuth vive 180 días.
  expiraAt?: string | null;
  liveMode?: boolean | null;
  // Conexión hecha contra la autorización SIMULADA (desarrollo sin la
  // aplicación de PeluDesk en Mercado Pago): todo lo que haga es simulado.
  simulada?: boolean;
};

export type CredencialesClip = {
  apiKey: string;
  secretKey: string;
  // Número de serie de la terminal (viene en la etiqueta y en el menú).
  serie: string;
  // El usuario de Clip (correo) al que se le asigna el cobro en la terminal.
  usuario: string;
  simulada?: boolean;
};

export type OrigenConexion = "oauth" | "llave_entorno" | "credenciales" | "simulacion";

/**
 * Una conexión lista para cobrar. Vive SOLO en el servidor: trae las
 * credenciales en claro y nunca se manda al navegador (para eso está
 * ResumenCobro).
 */
export type ConexionCobro = {
  proveedor: ProveedorIntegrado;
  negocio: { id: string; nombre: string; url: string };
  simulado: boolean;
  origen: OrigenConexion;
  cuentaId: string | null;
  terminalId: string | null;
  mp: CredencialesMp | null;
  clip: CredencialesClip | null;
};

/** Lo que la pantalla de cobro necesita saber, sin credenciales. */
export type ResumenCobro = {
  proveedor: ProveedorElegible;
  nombre: string;
  activo: boolean;
  simulado: boolean;
  terminal: boolean;
  link: boolean;
  // Por qué no está disponible (o qué falta), dicho para recepción.
  motivo: string | null;
  esperaSegundos: number;
};

export type EstadoOrden = "creada" | "en_terminal" | "pagada" | "cancelada" | "expirada" | "fallida" | "reembolsada";

export type PagoConfirmado = {
  paymentId: string | null;
  monto: number | null;
  installments: number | null;
  tipo: string | null;
};

/** Lo que el proveedor dice de una orden, ya normalizado. */
export type EstadoRemoto = {
  estado: EstadoOrden;
  pago: PagoConfirmado | null;
  detalle: string | null;
  // Cuenta que cobró, si el proveedor la dice (se compara con la de la orden).
  cuentaId?: string | null;
  // La referencia que el proveedor tiene de la orden (nuestro id).
  referencia?: string | null;
  crudo: unknown;
};

export type OrdenLocal = {
  id: string;
  proveedor: ProveedorIntegrado;
  tipo: "point" | "link";
  estado: string;
  monto: number;
  mp_order_id: string | null;
  mp_payment_id: string | null;
  installments: number | null;
  simulado: boolean;
  created_at: string;
  cobro_id: string | null;
  expira_at: string | null;
  cuenta_id: string | null;
  negocio_id: string;
};

export type ResultadoSincronizacion = {
  estado: string;
  pagada: boolean;
  registrado: boolean;
  sinTurno: boolean;
  detalle: string | null;
  installments: number | null;
};

/** Un reembolso tal como lo reporta el proveedor. */
export type ReembolsoRemoto = {
  id: string;
  monto: number;
  estado: "aprobado" | "pendiente" | "rechazado";
  crudo: unknown;
};

/** Error de un proveedor, dicho para quien está en el mostrador. */
export class ErrorProveedor extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly sugerencia: string | null,
    public readonly detalle: string | null
  ) {
    super(message);
    this.name = "ErrorProveedor";
  }
}

export function mensajeDeError(e: unknown, respaldo = "No pudimos hablar con el proveedor de cobro."): string {
  if (e instanceof ErrorProveedor) return e.sugerencia ? `${e.message} ${e.sugerencia}` : e.message;
  if (e && typeof e === "object" && "sugerencia" in e && e instanceof Error) {
    const s = (e as Error & { sugerencia?: string | null }).sugerencia;
    return s ? `${e.message} ${s}` : e.message;
  }
  return e instanceof Error ? e.message : respaldo;
}
