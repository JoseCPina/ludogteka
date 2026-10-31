import type { PagoDeBusqueda } from "@/lib/mercadopago/busqueda";

/**
 * De quién es un pago de la cuenta de Mercado Pago (12 de octubre de 2026;
 * corregido el 31 de octubre de 2026). Una cuenta recibe pagos de otros
 * orígenes (otras tiendas, transferencias, cobros personales, ventas tecleadas
 * directo en la Point). La conciliación solo alerta por lo que PeluDesk originó:
 *
 *   orden     salió de una orden o link de PeluDesk, y CONSTA: su id está en
 *             mp_ordenes (mp_payment_id / mp_payment_ref), su external_reference
 *             es el id de una orden de ESTE negocio (así crea PeluDesk órdenes de
 *             terminal y links), su order.id o el payment_intent_id de la metadata
 *             («seller-order_<id>») es una orden de terminal nuestra, o la
 *             metadata del link trae peludesk_negocio_id de este negocio /
 *             orden_id de una orden suya. Es el ÚNICO origen que cuenta como
 *             «cobrado desde PeluDesk».
 *   terminal  pasó por la terminal del punto de venta vinculado (pos_id, y
 *             store_id si los dos lados lo traen, iguales a los de la terminal
 *             registrada en /terminals/v1/list) pero NO por PeluDesk: una venta
 *             tecleada directo en la Point (Mercado Pago la manda con
 *             external_reference «Venta presencial» e integration «none») o en
 *             otra Point del mismo punto de venta (todas comparten pos_id).
 *             Solo sirve para respaldar un cobro a mano con «Terminal» del mismo
 *             monto cerca de la hora; nunca genera una alerta.
 *   ajeno     cualquier otro, incluido todo lo que no se pueda clasificar con
 *             certeza.
 *
 * Visto en la cuenta real de Ludogteka (31 de octubre de 2026): los pagos
 * 185452297704, 184408789493 y 185632440124 salían como «cobrado desde
 * PeluDesk» solo porque su pos_id era el de la terminal vinculada, y eran ventas
 * presenciales de la Point (integration «none»); los que sí salen de PeluDesk
 * traen la orden en external_reference e integration «api».
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

/** Solo lo que salió de una orden o link de PeluDesk es «cobrado desde PeluDesk». */
export const esDePeluDesk = (origen: OrigenPago): boolean => origen === "orden";

export function origenDelPago(p: PagoDeBusqueda, cx: ContextoOrigen): OrigenPago {
  const id = texto(p.id);
  if (id && cx.ligados.has(id)) return "orden";
  const ref = texto(p.external_reference);
  if (ref && cx.ordenIds.has(ref)) return "orden";
  const orden = texto(p.order?.id);
  if (orden && cx.ordenesMp.has(orden)) return "orden";
  const meta = p.metadata ?? {};
  // Un pago de la API de Orders trae payment_intent_id = «seller-order_<mp_order_id>».
  const intento = texto(meta.payment_intent_id).replace(/^seller-order_/, "");
  if (intento && cx.ordenesMp.has(intento)) return "orden";
  if (texto(meta.peludesk_negocio_id) === cx.negocioId) return "orden";
  if (texto(meta.orden_id) && cx.ordenIds.has(texto(meta.orden_id))) return "orden";

  const pos = util(cx.terminal?.pos_id);
  if (pos && util(p.pos_id) === pos) {
    const tienda = util(cx.terminal?.store_id);
    if (!tienda || !util(p.store_id) || util(p.store_id) === tienda) return "terminal";
  }
  return "ajeno";
}
