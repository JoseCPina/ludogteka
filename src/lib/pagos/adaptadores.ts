import { cancelarOrdenPoint, consultarOrdenPoint, crearOrdenPoint, normalizarOrdenPoint, type OrdenPoint } from "@/lib/mercadopago/point";
import { comisionDePago, consultarPago, crearLinkPago, normalizarPagoLink, type PagoMp } from "@/lib/mercadopago/links";
import { cancelarCobroClip, comisionDeClip, consultarCobroClip, crearCobroClip, normalizarCobroClip, type CobroClip } from "@/lib/clip/terminal";
import { simularTerminal } from "./simulacion";
import type { ConexionCobro, EstadoOrden, EstadoRemoto, OrdenLocal, ProveedorIntegrado } from "./tipos";

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
};

const ADAPTADORES: Record<ProveedorIntegrado, AdaptadorCobro> = { mercadopago: mercadoPago, clip };

export function adaptador(proveedor: ProveedorIntegrado): AdaptadorCobro {
  return ADAPTADORES[proveedor];
}

// Un pago de Checkout Pro que llegó por webhook o por el link simulado.
export function remotoDeLink(pago: PagoMp, orden: OrdenLocal): EstadoRemoto {
  return normalizarPagoLink(pago, orden.estado);
}
