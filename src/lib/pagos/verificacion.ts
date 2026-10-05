import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarPago } from "@/lib/mercadopago/links";
import type { OrdenPoint } from "@/lib/mercadopago/point";
import { mensajeDeError, type ConexionCobro, type EstadoRemoto, type OrdenLocal } from "./tipos";

/**
 * Verificar contra el proveedor, por consulta directa, que un cobro con
 * terminal de verdad se pagó (5 de octubre de 2026).
 *
 * El estado de una orden (o lo que diga un webhook) NO basta para dar un
 * cobro por pagado: tiene que existir un pago APROBADO, leído de la API de
 * pagos, con el mismo monto que se pidió, de la cuenta del negocio y con la
 * referencia de ESTA orden. Si algo no cuadra o no se puede comprobar, la
 * orden queda «por confirmar» (visible para el personal, con «Revisar con
 * Mercado Pago») y NUNCA como pagada.
 *
 * Solo aplica a lo real: lo simulado (demo y negocios en prueba) no pasa por
 * aquí y la base ya impide que dé por pagado un cobro de un negocio real.
 */
export type Verificacion = { ok: true; detalle: Record<string, unknown> } | { ok: false; motivo: string };

const igual = (a: number, b: number) => Math.abs(a - b) <= 0.005;
const dinero = (v: number) => `$${v.toFixed(2)}`;

export async function verificarPagoDeOrden(
  admin: SupabaseClient,
  cx: ConexionCobro,
  orden: OrdenLocal,
  remoto: EstadoRemoto
): Promise<Verificacion> {
  if (orden.proveedor === "clip") return verificarMonto(orden, remoto);
  if (orden.tipo === "link") return verificarLink(admin, orden, remoto);
  return verificarPoint(admin, cx, orden, remoto);
}

function verificarMonto(orden: OrdenLocal, remoto: EstadoRemoto): Verificacion {
  const monto = remoto.pago?.monto ?? null;
  if (monto === null) return { ok: false, motivo: "El proveedor no dijo cuánto se cobró: revísalo con el proveedor." };
  if (!igual(monto, orden.monto)) return { ok: false, motivo: `Se cobró ${dinero(monto)} y la orden era de ${dinero(orden.monto)}: revísalo con el proveedor.` };
  return { ok: true, detalle: { monto } };
}

async function verificarLink(admin: SupabaseClient, orden: OrdenLocal, remoto: EstadoRemoto): Promise<Verificacion> {
  const v = verificarMonto(orden, remoto);
  if (!v.ok) return v;
  const id = remoto.pago?.paymentId;
  if (!id) return { ok: false, motivo: "Mercado Pago no dio el id del pago." };
  const dup = await pagoYaRegistrado(admin, orden, id);
  if (dup) return { ok: false, motivo: "Ese pago de Mercado Pago ya está registrado en otro cobro." };
  return { ok: true, detalle: { payment_id: id, monto: remoto.pago?.monto ?? null } };
}

async function pagoYaRegistrado(admin: SupabaseClient, orden: OrdenLocal, id: string): Promise<boolean> {
  const { data } = await admin
    .from("mp_ordenes")
    .select("id")
    .eq("negocio_id", orden.negocio_id)
    .neq("id", orden.id)
    .or(`mp_payment_id.eq.${id},mp_payment_ref.eq.${id}`)
    .is("deleted_at", null)
    .limit(1);
  return (data ?? []).length > 0;
}

async function verificarPoint(admin: SupabaseClient, cx: ConexionCobro, orden: OrdenLocal, remoto: EstadoRemoto): Promise<Verificacion> {
  const crudo = remoto.crudo as OrdenPoint | null;
  const pago = crudo?.transactions?.payments?.[0];
  if (String(crudo?.status) !== "processed") return { ok: false, motivo: "La orden no está procesada en Mercado Pago." };
  const estadoPago = String(pago?.status ?? "");
  if (!["processed", "approved"].includes(estadoPago)) return { ok: false, motivo: `El pago de la orden está «${estadoPago || "sin estado"}» en Mercado Pago, no aprobado.` };
  if (pago?.status_detail && !["accredited"].includes(String(pago.status_detail))) {
    return { ok: false, motivo: `Mercado Pago marca el pago como «${pago.status_detail}», no acreditado.` };
  }
  const cobrado = Number(pago?.paid_amount ?? pago?.amount ?? NaN);
  if (!Number.isFinite(cobrado)) return { ok: false, motivo: "Mercado Pago no dijo cuánto se cobró." };
  if (!igual(cobrado, orden.monto)) return { ok: false, motivo: `Se cobró ${dinero(cobrado)} y la orden era de ${dinero(orden.monto)}.` };

  // Consulta directa del pago en la API de pagos: el estado de la orden no basta.
  const ref = pago?.reference_id != null ? String(pago.reference_id) : null;
  if (!ref || !/^\d+$/.test(ref)) return { ok: false, motivo: "Mercado Pago no dio el id del pago para comprobarlo." };
  let real;
  try {
    real = await consultarPago(cx, ref);
  } catch (e) {
    return { ok: false, motivo: `No pudimos comprobar el pago con Mercado Pago (${mensajeDeError(e)}). Vuelve a intentarlo con «Revisar con Mercado Pago».` };
  }
  if (real.status !== "approved") return { ok: false, motivo: `Mercado Pago dice que el pago está «${real.status ?? "sin estado"}», no aprobado.` };
  const montoReal = Number(real.transaction_amount ?? NaN);
  if (!Number.isFinite(montoReal) || !igual(montoReal, orden.monto)) {
    return { ok: false, motivo: `El pago aprobado es de ${Number.isFinite(montoReal) ? dinero(montoReal) : "un monto desconocido"} y la orden era de ${dinero(orden.monto)}.` };
  }
  if (real.collector_id != null && cx.cuentaId && String(real.collector_id) !== cx.cuentaId) {
    return { ok: false, motivo: "El pago es de otra cuenta de Mercado Pago." };
  }
  if (real.external_reference && real.external_reference !== orden.id) {
    return { ok: false, motivo: "El pago aprobado apunta a otra referencia, no a esta orden." };
  }
  if (await pagoYaRegistrado(admin, orden, ref)) return { ok: false, motivo: "Ese pago aprobado ya está registrado en otro cobro." };
  return { ok: true, detalle: { payment_id: ref, status: real.status, monto: montoReal, consultado_at: new Date().toISOString() } };
}
