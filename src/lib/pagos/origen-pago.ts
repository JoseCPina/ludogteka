import type { PagoDeBusqueda } from "@/lib/mercadopago/busqueda";

/**
 * De quién es un pago de la cuenta de Mercado Pago (12 de octubre de 2026).
 * Una cuenta recibe pagos de otros orígenes (otras tiendas, transferencias,
 * cobros personales, otras terminales). La conciliación solo considera lo que
 * PeluDesk originó:
 *
 *   orden     (a) ligado a una orden o link de PeluDesk: su id está en
 *             mp_ordenes (mp_payment_id / mp_payment_ref), su
 *             external_reference es el id de una orden de ESTE negocio (así
 *             crea PeluDesk órdenes de terminal y links), su order.id es una
 *             orden de terminal nuestra, o la metadata del link trae
 *             peludesk_negocio_id de este negocio / orden_id de una orden suya;
 *   terminal  (b) cobrado en la terminal vinculada: pos_id (y store_id, si los
 *             dos lados lo traen) igual al de la terminal registrada, que se
 *             lee de /terminals/v1/list;
 *   ajeno     cualquier otro, incluido todo lo que no se pueda clasificar con
 *             certeza.
 *
 * (c) «una referencia que coincide con un cobro de PeluDesk» es el mismo
 * criterio de external_reference: toda referencia nuestra es una orden.
 */
export type OrigenPago = "orden" | "terminal" | "ajeno";

export type ContextoOrigen = {
  negocioId: string;
  // Pagos ya ligados a una orden (mp_payment_id y mp_payment_ref).
  ligados: Set<string>;
  // Ids de mp_ordenes de este negocio (lo que viaja como external_reference).
  ordenIds: Set<string>;
  // mp_order_id de las órdenes de terminal de este negocio.
  ordenesMp: Set<string>;
  // La terminal vinculada, tal como la lista Mercado Pago.
  terminal?: { pos_id?: string | null; store_id?: string | null } | null;
};

const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
// Mercado Pago usa 0 / vacío cuando no hay punto de venta.
const util = (v: unknown): string => {
  const t = texto(v);
  return t === "" || t === "0" ? "" : t;
};

export function origenDelPago(p: PagoDeBusqueda, cx: ContextoOrigen): OrigenPago {
  const id = texto(p.id);
  if (id && cx.ligados.has(id)) return "orden";
  const ref = texto(p.external_reference);
  if (ref && cx.ordenIds.has(ref)) return "orden";
  const orden = texto(p.order?.id);
  if (orden && cx.ordenesMp.has(orden)) return "orden";
  const meta = p.metadata ?? {};
  if (texto(meta.peludesk_negocio_id) === cx.negocioId) return "orden";
  if (texto(meta.orden_id) && cx.ordenIds.has(texto(meta.orden_id))) return "orden";

  const pos = util(cx.terminal?.pos_id);
  if (pos && util(p.pos_id) === pos) {
    const tienda = util(cx.terminal?.store_id);
    if (!tienda || !util(p.store_id) || util(p.store_id) === tienda) return "terminal";
  }
  return "ajeno";
}
