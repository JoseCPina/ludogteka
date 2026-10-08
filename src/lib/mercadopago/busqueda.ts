import { mpFetch } from "./api";
import type { ConexionCobro } from "@/lib/pagos/tipos";

/**
 * Pagos de la cuenta del negocio en un rango de fechas
 * (GET /v1/payments/search). Solo lectura. Sirve para conciliar los cobros
 * con terminal contra Mercado Pago y para comprobar que NO hay un pago
 * aprobado antes de marcar un cobro como no recibido.
 */
export type PagoDeBusqueda = {
  id: number | string;
  status: string;
  transaction_amount: number;
  date_created?: string;
  date_approved?: string;
  external_reference?: string | null;
  collector_id?: number | string;
  payment_type_id?: string;
  transaction_amount_refunded?: number;
  // Con qué se cobró, para saber de quién es el pago (origen-pago.ts):
  // la terminal (pos_id / store_id), la orden de Orders (order.id) y la
  // metadata de la preferencia de un link.
  pos_id?: number | string | null;
  store_id?: number | string | null;
  order?: { id?: number | string; type?: string } | null;
  metadata?: Record<string, unknown> | null;
  point_of_interaction?: { type?: string } | null;
};

// Un pago que el dinero sí entró (aunque después se reembolsara).
export const ESTADOS_CON_DINERO = ["approved", "refunded", "partially_refunded", "charged_back", "in_mediation"];

const fechaMp = (d: Date) => d.toISOString().replace("Z", "-00:00");

export async function buscarPagos(cx: ConexionCobro, desde: Date, hasta: Date): Promise<PagoDeBusqueda[]> {
  const todos: PagoDeBusqueda[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const ruta =
      `/v1/payments/search?sort=date_created&criteria=desc&range=date_created` +
      `&begin_date=${encodeURIComponent(fechaMp(desde))}&end_date=${encodeURIComponent(fechaMp(hasta))}&limit=100&offset=${offset}`;
    const r = await mpFetch<{ results?: PagoDeBusqueda[]; paging?: { total?: number } }>(cx.mp?.accessToken ?? "", ruta);
    const pagina = r.results ?? [];
    todos.push(...pagina);
    if (pagina.length < 100) break;
  }
  return todos;
}
