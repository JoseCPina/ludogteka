/** Error de un PAC ya traducido a lo que se le dice a quien factura. */
export class ErrorPac extends Error {
  constructor(
    mensaje: string,
    public readonly estado: number,
    /** true = la conexión se cortó y el PAC quizá sí timbró: hay que consultar antes de reintentar. */
    public readonly incierto: boolean,
    public readonly detalle: string | null = null
  ) {
    super(mensaje);
    this.name = "ErrorPac";
  }
}

export function mensajeDeErrorPac(estado: number, cuerpo: unknown): string {
  const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as { message?: string; error?: string; code?: string };
  const crudo = (c.message ?? c.error ?? (typeof cuerpo === "string" ? cuerpo : "")).toString().trim();
  if (estado === 401 || estado === 403) return "El PAC rechazó la llave. Revisa la llave en Administración → Facturación.";
  if (estado === 429) return "El PAC pide esperar un momento. Intenta de nuevo en un minuto.";
  if (estado >= 500) return "El PAC no pudo responder. Intenta de nuevo en un momento.";
  return crudo ? `El PAC dice: ${crudo}` : `El PAC rechazó la petición (${estado}).`;
}
