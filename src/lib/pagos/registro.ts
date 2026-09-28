import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { adaptador } from "./adaptadores";
import type { ConexionCobro, EstadoRemoto, OrdenLocal, ResultadoSincronizacion } from "./tipos";

/**
 * Sincronizar una orden de cobro integrado con lo que dice su proveedor y,
 * si ya se pagó, registrar el cobro (una sola vez: la RPC es idempotente).
 *
 * La llaman caminos que pueden llegar en cualquier orden y repetirse: el
 * webhook del proveedor y la pantalla (recepción espera con el cliente
 * enfrente y consulta cada pocos segundos). Todos terminan en
 * registrar_pago_mercadopago (el nombre es de historia: registra el pago de
 * cualquier proveedor), y la base registra uno.
 *
 * `admin` es el cliente con la secret key ATADO AL NEGOCIO de la orden: es
 * el único que puede llamar a esa RPC y escribir en mp_ordenes, y la base
 * solo ve ese negocio.
 */
const COLUMNAS = "id, proveedor, tipo, estado, monto, mp_order_id, mp_payment_id, installments, simulado, created_at, cobro_id, expira_at, cuenta_id, negocio_id";

const TERMINALES = ["cancelada", "expirada", "fallida", "reembolsada"];

export async function leerOrdenLocal(admin: SupabaseClient, ordenId: string, negocioId: string): Promise<OrdenLocal | null> {
  const { data } = await admin
    .from("mp_ordenes")
    .select(COLUMNAS)
    .eq("id", ordenId)
    .eq("negocio_id", negocioId)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? ({ ...data, monto: Number(data.monto) } as OrdenLocal) : null;
}

// La comisión del proveedor entra sola como gasto del negocio que cobró
// (categoría Comisiones), una vez por orden. Si el proveedor no la da, o
// algo falla aquí, el cobro NO se afecta: queda para captura manual.
async function registrarComision(admin: SupabaseClient, cx: ConexionCobro, orden: OrdenLocal, remoto: EstadoRemoto) {
  try {
    if (orden.simulado || cx.simulado) return;
    const c = await adaptador(orden.proveedor).comision(cx, orden, remoto);
    if (!c || !(c.monto > 0)) return;
    const { error } = await admin.rpc("registrar_comision_mercadopago", { p_orden_id: orden.id, p_monto: c.monto, p_detalle: c.detalle });
    if (error) console.error("[cobro] comisión no registrada", orden.id, error.message);
  } catch (e) {
    console.error("[cobro] comisión no registrada", orden.id, e);
  }
}

async function registrar(admin: SupabaseClient, cx: ConexionCobro, orden: OrdenLocal, remoto: EstadoRemoto): Promise<ResultadoSincronizacion> {
  const pago = remoto.pago!;
  const { data, error } = await admin.rpc("registrar_pago_mercadopago", {
    p_orden_id: orden.id,
    p_mp_payment_id: pago.paymentId,
    p_monto: pago.monto ?? orden.monto,
    p_installments: pago.installments ?? 1,
    p_mp_payment_type: pago.tipo,
    p_evento: (remoto.crudo ?? null) as object | null,
  });
  if (error) throw new Error(error.message);
  const r = data as { registrado: boolean; sin_turno?: boolean; repetido?: boolean };
  if (r.registrado && !r.repetido) await registrarComision(admin, cx, orden, remoto);
  return { estado: "pagada", pagada: true, registrado: Boolean(r.registrado), sinTurno: Boolean(r.sin_turno), detalle: null, installments: pago.installments ?? 1 };
}

async function marcar(admin: SupabaseClient, orden: OrdenLocal, estado: string, detalle: string | null, evento: unknown) {
  await admin
    .from("mp_ordenes")
    .update({ estado, detalle_error: detalle, notificado_at: new Date().toISOString(), ultimo_evento: evento ?? null })
    .eq("id", orden.id)
    .eq("negocio_id", orden.negocio_id);
}

/**
 * Aplicar lo que dice el proveedor. `remoto` viene de consultar al
 * proveedor con la conexión DEL NEGOCIO de la orden (nunca del cuerpo de
 * una notificación). Si el proveedor dice de qué cuenta es el pago y la
 * orden se creó con otra, no se aplica.
 */
export async function aplicarEstado(admin: SupabaseClient, cx: ConexionCobro, orden: OrdenLocal, remoto: EstadoRemoto): Promise<ResultadoSincronizacion> {
  if (orden.cobro_id || orden.estado === "pagada") {
    return { estado: "pagada", pagada: true, registrado: Boolean(orden.cobro_id), sinTurno: !orden.cobro_id, detalle: null, installments: orden.installments };
  }
  if (cx.negocio.id !== orden.negocio_id) throw new Error("La conexión no es del negocio de la orden.");
  if (remoto.referencia && remoto.referencia !== orden.id) throw new Error("El pago no corresponde a esta orden.");
  if (remoto.cuentaId && orden.cuenta_id && remoto.cuentaId !== orden.cuenta_id) throw new Error("El pago es de otra cuenta.");

  if (remoto.estado === "pagada" && remoto.pago) return registrar(admin, cx, orden, remoto);

  // Un link rechazado no muere: el cliente puede volver a intentar con otra
  // tarjeta desde el mismo link. Se anota, no se cierra.
  if (orden.tipo === "link" && remoto.estado !== "reembolsada") {
    if (remoto.detalle) {
      await admin.from("mp_ordenes").update({ detalle_error: remoto.detalle, ultimo_evento: remoto.crudo ?? null }).eq("id", orden.id).eq("negocio_id", orden.negocio_id);
    }
    return { estado: orden.estado, pagada: false, registrado: false, sinTurno: false, detalle: null, installments: null };
  }
  if (TERMINALES.includes(remoto.estado)) {
    await marcar(admin, orden, remoto.estado, remoto.detalle, remoto.crudo);
    return { estado: remoto.estado, pagada: false, registrado: false, sinTurno: false, detalle: remoto.detalle, installments: null };
  }
  if (remoto.estado !== orden.estado) {
    await admin.from("mp_ordenes").update({ estado: remoto.estado, ultimo_evento: remoto.crudo ?? null }).eq("id", orden.id).eq("negocio_id", orden.negocio_id);
  }
  return { estado: remoto.estado, pagada: false, registrado: false, sinTurno: false, detalle: null, installments: null };
}

/** Terminal: preguntar al proveedor (o a la simulación) y aplicar. */
export async function sincronizarTerminal(admin: SupabaseClient, cx: ConexionCobro, orden: OrdenLocal): Promise<ResultadoSincronizacion> {
  if (orden.cobro_id || orden.estado === "pagada") {
    return { estado: "pagada", pagada: true, registrado: Boolean(orden.cobro_id), sinTurno: !orden.cobro_id, detalle: null, installments: orden.installments };
  }
  if (TERMINALES.includes(orden.estado)) {
    return { estado: orden.estado, pagada: false, registrado: false, sinTurno: false, detalle: null, installments: null };
  }
  if (!orden.mp_order_id) {
    return { estado: orden.estado, pagada: false, registrado: false, sinTurno: false, detalle: "La orden no llegó a crearse con el proveedor.", installments: null };
  }
  if (orden.proveedor !== cx.proveedor) throw new Error("La orden es de otro proveedor que la conexión actual.");
  const remoto = await adaptador(orden.proveedor).consultarCobroTerminal(cx, orden);
  return aplicarEstado(admin, cx, orden, remoto);
}

/**
 * El negocio de una orden se deduce de LA ORDEN (una notificación no trae
 * negocio): esa única lectura va sin encabezado, y todo lo demás corre con
 * un cliente atado al negocio de la orden.
 */
export async function contextoDeOrden(
  filtro: { id: string } | { mp_order_id: string; proveedor: "mercadopago" | "clip" },
  negocioEsperado?: string
): Promise<{ admin: SupabaseClient; orden: OrdenLocal } | null> {
  let consulta = createSupabaseAdminClient().from("mp_ordenes").select("id, negocio_id").is("deleted_at", null);
  if ("id" in filtro) {
    if (!/^[0-9a-f-]{36}$/i.test(filtro.id)) return null;
    consulta = consulta.eq("id", filtro.id);
  } else {
    consulta = consulta.eq("mp_order_id", filtro.mp_order_id).eq("proveedor", filtro.proveedor);
  }
  if (negocioEsperado) consulta = consulta.eq("negocio_id", negocioEsperado);
  const { data: fila } = await consulta.maybeSingle();
  if (!fila) return null;
  const admin = createSupabaseAdminClient(fila.negocio_id as string);
  const orden = await leerOrdenLocal(admin, fila.id as string, fila.negocio_id as string);
  return orden ? { admin, orden } : null;
}
