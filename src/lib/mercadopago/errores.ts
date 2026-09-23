/**
 * Lo que Mercado Pago contesta, traducido a qué revisar. Mismo espíritu
 * que traducirError() de la base: el mensaje que ve recepción o el admin
 * dice qué pasó y qué hacer, no el JSON crudo.
 */
export class ErrorMercadoPago extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly sugerencia: string | null,
    public readonly detalle: string | null
  ) {
    super(message);
    this.name = "ErrorMercadoPago";
  }
}

export function traducirRespuestaMp(status: number, cuerpo: unknown): { mensaje: string; sugerencia: string | null } {
  const c = (typeof cuerpo === "object" && cuerpo !== null ? cuerpo : {}) as {
    message?: string;
    error?: string;
    errors?: { code?: string; message?: string }[];
    cause?: { code?: string | number; description?: string }[];
  };
  const detalle =
    c.errors?.[0]?.message ?? c.cause?.[0]?.description ?? c.message ?? c.error ?? "";
  const codigo = String(c.errors?.[0]?.code ?? c.cause?.[0]?.code ?? "");

  if (status === 401) {
    return {
      mensaje: "Mercado Pago rechazó la credencial.",
      sugerencia:
        "Revisa MERCADOPAGO_ACCESS_TOKEN en Vercel: debe ser el access token de PRODUCCIÓN de la aplicación (empieza con APP_USR-), no la public key ni una credencial de prueba vencida.",
    };
  }
  if (status === 403) {
    return {
      mensaje: "La credencial no tiene permiso para esta operación.",
      sugerencia:
        "En Tus integraciones, la aplicación debe tener activados los productos Point y Checkout Pro, y la terminal debe estar vinculada a la MISMA cuenta de Mercado Pago que emitió el access token.",
    };
  }
  if (status === 404) {
    return {
      mensaje: "Mercado Pago no encontró el recurso.",
      sugerencia:
        /terminal/i.test(detalle)
          ? "El id de la terminal no existe en esta cuenta. Cópialo del diagnóstico (lista de terminales) a MERCADOPAGO_TERMINAL_ID."
          : "El id de la orden o del pago no existe (o tiene más de 3 meses). Si venía de una notificación, ignórala.",
    };
  }
  if (status === 409 || /already|ya existe|in progress|terminal is busy|busy/i.test(detalle)) {
    return {
      mensaje: "La terminal ya tiene una orden en curso.",
      sugerencia: "Cancela en la terminal la orden anterior (o espera a que venza) antes de mandar otra.",
    };
  }
  if (status === 400 && /operating_mode|PDV|standalone/i.test(detalle)) {
    return {
      mensaje: "La terminal no está en modo PDV (integrado).",
      sugerencia: "Cámbiala a PDV desde el diagnóstico de /admin o con la API terminals/v1/setup; en STANDALONE la terminal ignora las órdenes de la app.",
    };
  }
  if (status === 400) {
    return {
      mensaje: `Mercado Pago rechazó la petición${detalle ? `: ${detalle}` : "."}`,
      sugerencia: codigo ? `Código ${codigo}. Revisa el monto (mayor a $0 y con dos decimales) y que la orden no haya vencido.` : null,
    };
  }
  if (status === 429) {
    return { mensaje: "Mercado Pago está limitando las peticiones.", sugerencia: "Espera unos segundos y vuelve a intentar." };
  }
  if (status >= 500) {
    return { mensaje: "Mercado Pago tuvo un error interno.", sugerencia: "Vuelve a intentar en un momento; si sigue, cobra a mano y regístralo manual." };
  }
  return { mensaje: `Mercado Pago respondió ${status}${detalle ? `: ${detalle}` : "."}`, sugerencia: null };
}

// Mensajes cortos para lo que ve recepción en el mostrador cuando el
// pago en la terminal no termina bien.
export function describirEstadoOrden(estado: string, statusDetail?: string | null): string {
  switch (estado) {
    case "canceled":
    case "cancelled":
      return "El pago se canceló en la terminal.";
    case "expired":
      return "La orden venció sin que se pagara.";
    case "failed":
      return `El pago fue rechazado${statusDetail ? ` (${traducirStatusDetail(statusDetail)})` : ""}.`;
    case "refunded":
      return "El pago fue reembolsado.";
    default:
      return estado;
  }
}

export function traducirStatusDetail(detalle: string): string {
  const d = detalle.toLowerCase();
  if (d.includes("insufficient")) return "fondos insuficientes";
  if (d.includes("bad_filled_security") || d.includes("security_code")) return "código de seguridad incorrecto";
  if (d.includes("card_disabled") || d.includes("blacklist")) return "tarjeta bloqueada";
  if (d.includes("high_risk")) return "rechazado por riesgo";
  if (d.includes("max_attempts")) return "demasiados intentos";
  if (d.includes("duplicated")) return "pago duplicado";
  if (d.includes("call_for_authorize")) return "el banco pide autorizar";
  if (d.includes("other_reason") || d.includes("rejected")) return "rechazado por el banco";
  if (d.includes("canceled_by_api")) return "cancelado desde la app";
  if (d.includes("canceled_by_user") || d.includes("terminal")) return "cancelado en la terminal";
  return detalle;
}
