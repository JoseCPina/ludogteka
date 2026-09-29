import { cancelarOrdenPoint, consultarOrdenPoint, crearOrdenPoint, normalizarOrdenPoint, reembolsarOrdenPoint, type OrdenPoint } from "@/lib/mercadopago/point";
import { comisionDePago, consultarPago, crearLinkPago, normalizarPagoLink, reembolsarPago, type PagoMp, type ReembolsoPagoMp } from "@/lib/mercadopago/links";
import { cancelarCobroClip, comisionDeClip, consultarCobroClip, crearCobroClip, normalizarCobroClip, type CobroClip } from "@/lib/clip/terminal";
import { simularTerminal } from "./simulacion";
import type { ConexionCobro, EstadoOrden, EstadoRemoto, OrdenLocal, ProveedorIntegrado, ReembolsoRemoto } from "./tipos";

/**
 * Una sola interfaz para cobrar en terminal y por link, con un adaptador
 * por proveedor. La caja, el registro del cobro, la conciliación por origen
 * y la comisión como gasto hablan con esto, nunca con un proveedor.
 */
export interface AdaptadorCobro {
  proveedor: ProveedorIntegrado;
  nombre: string;
  soportaLink: boolean;
  crearCobroTerminal(cx: ConexionCobro, args: { ordenId: string; monto: number; descripcion: string; plazos: number | null }): Promise<{ idRemoto: string; estado: EstadoOrden; crudo: unknown }>;
  consultarCobroTerminal(cx: ConexionCobro, orden: OrdenLocal): Promise<EstadoRemoto>;
  cancelarCobroTerminal(cx: ConexionCobro, orden: OrdenLocal): Promise<void>;
  crearLinkPago?(cx: ConexionCobro, args: { ordenId: string; monto: number; titulo: string; clienteNombre: string; clienteTelefono: string | null; expiraAt: Date }): Promise<{ idRemoto: string; url: string; crudo: unknown }>;
  /** La comisión que el proveedor le retuvo al negocio por este pago (null si no la da). */
  comision(cx: ConexionCobro, orden: OrdenLocal, remoto: EstadoRemoto): Promise<{ monto: number; detalle: string } | null>;
  /**
   * Reembolsos. Sin `reembolsar`, la devolución se hace en el proveedor y en
   * la app se registra a mano (Clip: su API de Punto de Venta no documenta
   * reembolsos).
   */
  reembolsar?(cx: ConexionCobro, orden: OrdenLocal, args: { reembolsoId: string; monto: number; total: boolean; conocidos: string[] }): Promise<ReembolsoRemoto>;
  /** Los reembolsos que el proveedor tiene de esta orden (incluidos los hechos en su panel). */
  reembolsosRemotos?(cx: ConexionCobro, orden: OrdenLocal, crudo?: unknown): Promise<ReembolsoRemoto[]>;
  /** ¿El proveedor le regresa al negocio la comisión de lo reembolsado? */
  regresaComision: boolean;
}

const ESTADO_REEMBOLSO: Record<string, ReembolsoRemoto["estado"]> = {
  approved: "aprobado",
  processed: "aprobado",
  refunded: "aprobado",
  in_process: "pendiente",
  pending: "pendiente",
  processing: "pendiente",
  created: "pendiente",
  rejected: "rechazado",
  cancelled: "rechazado",
  canceled: "rechazado",
  failed: "rechazado",
};
const estadoReembolso = (s: string | undefined): ReembolsoRemoto["estado"] => ESTADO_REEMBOLSO[String(s ?? "approved").toLowerCase()] ?? "pendiente";
const monto2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

function reembolsosDeOrdenPoint(o: OrdenPoint): ReembolsoRemoto[] {
  const lista = (o.transactions?.refunds ?? [])
    .filter((r) => r.id)
    .map((r) => ({ id: String(r.id), monto: monto2(r.amount), estado: estadoReembolso(r.status), crudo: r }));
  // Una orden reembolsada sin el detalle: el total, con un id estable.
  if (!lista.length && o.status === "refunded") {
    const pagado = monto2(o.transactions?.payments?.[0]?.paid_amount ?? o.total_paid_amount ?? o.transactions?.payments?.[0]?.amount);
    if (pagado > 0) return [{ id: `${o.id}-refund`, monto: pagado, estado: "aprobado", crudo: { status: o.status } }];
  }
  return lista;
}

function reembolsosDePago(p: PagoMp): ReembolsoRemoto[] {
  const lista = (p.refunds ?? []).map((r: ReembolsoPagoMp) => ({ id: String(r.id), monto: monto2(r.amount), estado: estadoReembolso(r.status), crudo: r }));
  if (!lista.length && p.status === "refunded") {
    const m = monto2(p.transaction_amount_refunded ?? p.transaction_amount);
    if (m > 0) return [{ id: `${p.id}-refund`, monto: m, estado: "aprobado", crudo: { status: p.status } }];
  }
  return lista;
}

const simulada = (orden: OrdenLocal) =>
  simularTerminal({ creadaEn: orden.created_at, monto: orden.monto, plazos: orden.installments, idRemoto: orden.mp_order_id ?? orden.id });

const mercadoPago: AdaptadorCobro = {
  proveedor: "mercadopago",
  nombre: "Mercado Pago",
  soportaLink: true,
  async crearCobroTerminal(cx, args) {
    const r = await crearOrdenPoint(cx, { monto: args.monto, externalReference: args.ordenId, descripcion: args.descripcion, plazos: args.plazos });
    return { idRemoto: r.id, estado: r.status === "at_terminal" ? "en_terminal" : "creada", crudo: r };
  },
  async consultarCobroTerminal(cx, orden) {
    if (cx.simulado || orden.simulado) return simulada(orden);
    return normalizarOrdenPoint(await consultarOrdenPoint(cx, orden.mp_order_id!), orden.estado);
  },
  async cancelarCobroTerminal(cx, orden) {
    if (orden.mp_order_id) await cancelarOrdenPoint(cx, orden.mp_order_id, orden.id);
  },
  async crearLinkPago(cx, args) {
    const p = await crearLinkPago(cx, args);
    return { idRemoto: p.id, url: p.init_point, crudo: p };
  },
  async comision(cx, orden, remoto) {
    if (cx.simulado || orden.simulado) return null;
    // En un link, el pago ya trae fee_details. En la terminal (API de
    // Orders) no: su id es "PAY01…" y el de la API de pagos viene en
    // reference_id (visto con un cobro real el 28 de septiembre de 2026).
    let pago: PagoMp | null = orden.tipo === "link" ? (remoto.crudo as PagoMp) : null;
    const referencia = orden.tipo === "point" ? (remoto.crudo as OrdenPoint | null)?.transactions?.payments?.[0]?.reference_id : null;
    const id = referencia != null ? String(referencia) : remoto.pago?.paymentId;
    if (!pago && id && /^\d+$/.test(id)) {
      try {
        pago = await consultarPago(cx, id);
      } catch {
        pago = null;
      }
    }
    if (!pago) return null;
    const monto = comisionDePago(pago);
    if (!(monto > 0)) return null;
    const tipo = orden.tipo === "point" ? "terminal" : "link de pago";
    return { monto, detalle: `Cobro por ${tipo}, pago ${pago.id}: ${(pago.fee_details ?? []).map((f) => `${f.type ?? "comisión"} ${f.amount}`).join(", ")}` };
  },
  // Mercado Pago regresa la comisión en una devolución total (visto con los
  // cobros reales del 28 de septiembre de 2026); en una parcial, la parte
  // proporcional.
  regresaComision: true,
  async reembolsar(cx, orden, args) {
    if (cx.simulado || orden.simulado) {
      return { id: `SIM-REF-${args.reembolsoId.slice(0, 8)}`, monto: args.monto, estado: "aprobado", crudo: { simulado: true } };
    }
    if (orden.tipo === "link") {
      if (!orden.mp_payment_id) throw new Error("La orden no tiene el pago de Mercado Pago registrado.");
      const r = await reembolsarPago(cx, orden.mp_payment_id, args.total ? null : args.monto, args.reembolsoId);
      return { id: String(r.id), monto: monto2(r.amount ?? args.monto), estado: estadoReembolso(r.status), crudo: r };
    }
    if (!orden.mp_order_id) throw new Error("La orden no llegó a crearse en Mercado Pago.");
    const antes = new Set(args.conocidos);
    const o = await reembolsarOrdenPoint(cx, orden.mp_order_id, { pagoId: orden.mp_payment_id, monto: args.monto, total: args.total, idempotencia: args.reembolsoId });
    const lista = reembolsosDeOrdenPoint(o).filter((r) => !antes.has(r.id));
    // El reembolso nuevo es el último de la lista con ese monto.
    const nuevo = [...lista].reverse().find((r) => Math.abs(r.monto - args.monto) < 0.005) ?? lista.at(-1);
    if (!nuevo) return { id: `${orden.mp_order_id}-refund-${args.reembolsoId.slice(0, 8)}`, monto: args.monto, estado: o.status === "refunded" ? "aprobado" : "pendiente", crudo: o };
    return { ...nuevo, crudo: o };
  },
  async reembolsosRemotos(cx, orden, crudo) {
    if (cx.simulado || orden.simulado) return [];
    if (orden.tipo === "link") {
      const pago = (crudo as PagoMp | undefined)?.id ? (crudo as PagoMp) : orden.mp_payment_id ? await consultarPago(cx, orden.mp_payment_id) : null;
      return pago ? reembolsosDePago(pago) : [];
    }
    const o = (crudo as OrdenPoint | undefined)?.id ? (crudo as OrdenPoint) : orden.mp_order_id ? await consultarOrdenPoint(cx, orden.mp_order_id) : null;
    return o ? reembolsosDeOrdenPoint(o) : [];
  },
};

const clip: AdaptadorCobro = {
  proveedor: "clip",
  nombre: "Clip",
  soportaLink: false,
  async crearCobroTerminal(cx, args) {
    const r = await crearCobroClip(cx, { monto: args.monto, referencia: args.ordenId, descripcion: args.descripcion });
    const id = r.pinpad_request_id ?? r.id;
    if (!id) throw new Error("Clip no devolvió el id del cobro.");
    return { idRemoto: id, estado: "en_terminal", crudo: r };
  },
  async consultarCobroTerminal(cx, orden) {
    if (cx.simulado || orden.simulado) return simulada(orden);
    return normalizarCobroClip(await consultarCobroClip(cx, orden.mp_order_id!), orden.estado);
  },
  async cancelarCobroTerminal(cx, orden) {
    if (orden.mp_order_id) await cancelarCobroClip(cx, orden.mp_order_id);
  },
  async comision(cx, orden, remoto) {
    if (cx.simulado || orden.simulado) return null;
    const monto = comisionDeClip(remoto.crudo as CobroClip);
    return monto > 0 ? { monto, detalle: `Cobro en terminal Clip, pago ${remoto.pago?.paymentId ?? "?"}` } : null;
  },
  // Sin reembolsos por API: la devolución se hace en Clip y aquí se registra a mano.
  regresaComision: false,
};

const ADAPTADORES: Record<ProveedorIntegrado, AdaptadorCobro> = { mercadopago: mercadoPago, clip };

export function adaptador(proveedor: ProveedorIntegrado): AdaptadorCobro {
  return ADAPTADORES[proveedor];
}

// Un pago de Checkout Pro que llegó por webhook o por el link simulado.
export function remotoDeLink(pago: PagoMp, orden: OrdenLocal): EstadoRemoto {
  return normalizarPagoLink(pago, orden.estado);
}
