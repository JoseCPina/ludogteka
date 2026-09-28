import { clipFetch } from "./api";
import type { ConexionCobro, EstadoOrden, EstadoRemoto } from "@/lib/pagos/tipos";

/**
 * Cobro en la terminal Clip del negocio (PinPad API). La referencia que se
 * manda es nuestro id de orden: es lo que vuelve en el webhook y en la
 * consulta, y lo que ata el pago a la orden (y la orden a su negocio).
 */
export type CobroClip = {
  pinpad_request_id?: string;
  id?: string;
  reference?: string;
  status?: string;
  amount?: number | string;
  payment_id?: string;
  receipt_no?: string;
  transaction_id?: string;
  installments?: number | string;
  payment_method?: string;
  card_type?: string;
  // Comisión, si Clip la devuelve (no está confirmado que la consulta la traiga).
  fee?: number | string;
  commission?: number | string;
  status_description?: string;
};

function creds(cx: ConexionCobro) {
  if (!cx.clip) throw new Error("Clip no está conectado.");
  return cx.clip;
}

export async function crearCobroClip(cx: ConexionCobro, args: { monto: number; referencia: string; descripcion: string }): Promise<CobroClip> {
  if (cx.simulado) return { pinpad_request_id: `SIM-CLIP-${args.referencia.slice(0, 8)}`, reference: args.referencia, status: "PENDING" };
  const c = creds(cx);
  return clipFetch<CobroClip>(c, "/f2f/pinpad/v1/payment", {
    method: "POST",
    body: {
      amount: Math.round(args.monto * 100) / 100,
      assigned_user: c.usuario,
      reference: args.referencia,
      message: args.descripcion.slice(0, 60),
      serial_number_pos: c.serie,
      is_auto_return: false,
      is_tip_enabled: false,
    },
  });
}

export async function consultarCobroClip(cx: ConexionCobro, pinpadRequestId: string): Promise<CobroClip> {
  const r = await clipFetch<CobroClip | { data?: CobroClip }>(creds(cx), `/f2f/pinpad/v1/payment?pinpadRequestId=${encodeURIComponent(pinpadRequestId)}`);
  return (r as { data?: CobroClip }).data ?? (r as CobroClip);
}

export async function cancelarCobroClip(cx: ConexionCobro, pinpadRequestId: string): Promise<void> {
  if (cx.simulado) return;
  await clipFetch<unknown>(creds(cx), `/f2f/pinpad/v1/payment?pinpadRequestId=${encodeURIComponent(pinpadRequestId)}`, { method: "DELETE" });
}

/** Una prueba de credenciales que no cobra: consultar un cobro inexistente. */
export async function probarCredencialesClip(cx: ConexionCobro): Promise<{ ok: boolean; detalle: string }> {
  if (cx.simulado) return { ok: true, detalle: "Credenciales simuladas." };
  try {
    await consultarCobroClip(cx, "peludesk-prueba-de-credenciales");
    return { ok: true, detalle: "Clip aceptó las credenciales." };
  } catch (e) {
    const status = (e as { status?: number }).status ?? 0;
    // 404 = las credenciales sirven y el cobro de prueba no existe (lo esperado).
    if (status === 404) return { ok: true, detalle: "Clip aceptó las credenciales." };
    return { ok: false, detalle: e instanceof Error ? e.message : String(e) };
  }
}

// Clip nombra los estados en mayúsculas; se aceptan las variantes que
// aparecen en su documentación y en integraciones publicadas.
function estadoDeClip(status: string | undefined, previo: string): EstadoOrden {
  const s = (status ?? "").toUpperCase();
  if (["PAID", "COMPLETED", "APPROVED", "SUCCESS", "SUCCEEDED"].includes(s)) return "pagada";
  if (["CANCELED", "CANCELLED", "CANCELED_BY_USER", "ABORTED"].includes(s)) return "cancelada";
  if (["EXPIRED", "TIMEOUT"].includes(s)) return "expirada";
  if (["DECLINED", "REJECTED", "FAILED", "ERROR"].includes(s)) return "fallida";
  if (["REFUNDED", "REVERSED"].includes(s)) return "reembolsada";
  if (["PENDING", "CREATED", "IN_PROGRESS", "PROCESSING", "SENT"].includes(s)) return "en_terminal";
  return previo as EstadoOrden;
}

export function normalizarCobroClip(c: CobroClip, estadoPrevio: string): EstadoRemoto {
  const estado = estadoDeClip(c.status, estadoPrevio);
  const monto = Number(c.amount ?? NaN);
  const inst = Number(c.installments ?? 1);
  return {
    estado,
    pago:
      estado === "pagada"
        ? {
            paymentId: c.payment_id ?? c.receipt_no ?? c.transaction_id ?? null,
            monto: Number.isFinite(monto) && monto > 0 ? Math.round(monto * 100) / 100 : null,
            installments: Number.isFinite(inst) && inst > 0 ? inst : 1,
            tipo: c.card_type ?? c.payment_method ?? null,
          }
        : null,
    detalle:
      estado === "cancelada"
        ? "El cobro se canceló en la terminal Clip."
        : estado === "fallida"
          ? `Clip rechazó el pago${c.status_description ? ` (${c.status_description})` : ""}.`
          : estado === "expirada"
            ? "El cobro venció en la terminal Clip sin pagarse."
            : null,
    referencia: c.reference ?? null,
    crudo: c,
  };
}

export function comisionDeClip(c: CobroClip): number {
  const v = Number(c.fee ?? c.commission ?? 0);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
}
