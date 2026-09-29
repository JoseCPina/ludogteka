import type { SupabaseClient } from "@supabase/supabase-js";
import { adaptador } from "./adaptadores";
import { mensajeDeError, type ConexionCobro, type OrdenLocal, type ReembolsoRemoto } from "./tipos";

/**
 * Reembolsos de un cobro integrado con su proveedor.
 *
 * Desde la app: la base decide si se puede (preparar_reembolso, con la
 * sesión del admin) y deja el renglón 'solicitado'; aquí se le pide al
 * proveedor con la conexión DEL NEGOCIO y, solo si lo aprueba, se registra
 * (registrar_reembolso_proveedor: la devolución en caja, lo reembolsado en
 * la orden y la comisión). Si el proveedor lo rechaza, en la caja no queda
 * nada (rechazar_reembolso).
 *
 * Desde el panel del proveedor: llega por el webhook; sincronizarReembolsos
 * compara lo que dice el proveedor con lo que ya conocemos y registra lo
 * nuevo (sale en «Necesita atención»).
 *
 * `admin` es el cliente con la secret key ATADO AL NEGOCIO de la orden.
 */
export type ResultadoReembolso =
  | { ok: true; registrado: boolean; sinTurno: boolean; pendiente: boolean; comisionDevuelta: number }
  | { ok: false; error: string };

type RespuestaRegistro = { registrado: boolean; sin_turno?: boolean; comision_devuelta?: number; repetido?: boolean };

async function registrar(admin: SupabaseClient, cx: ConexionCobro, orden: OrdenLocal, r: ReembolsoRemoto, reembolsoId: string | null) {
  const { data, error } = await admin.rpc("registrar_reembolso_proveedor", {
    p_orden_id: orden.id,
    p_id_remoto: r.id,
    p_monto: r.monto,
    p_reembolso_id: reembolsoId,
    p_regresa_comision: adaptador(orden.proveedor).regresaComision && !orden.simulado && !cx.simulado,
    p_evento: (r.crudo ?? null) as object | null,
  });
  if (error) throw new Error(error.message);
  return data as RespuestaRegistro;
}

export async function pedirReembolso(
  admin: SupabaseClient,
  cx: ConexionCobro,
  orden: OrdenLocal,
  args: { reembolsoId: string; monto: number; total: boolean }
): Promise<ResultadoReembolso> {
  const ad = adaptador(orden.proveedor);
  const rechazar = async (detalle: string, evento: unknown = null) => {
    await admin.rpc("rechazar_reembolso", { p_reembolso_id: args.reembolsoId, p_detalle: detalle, p_evento: evento as object | null });
    return { ok: false as const, error: detalle };
  };
  if (!ad.reembolsar) return rechazar(`Los reembolsos con ${ad.nombre} se hacen en ${ad.nombre}; aquí se registran a mano.`);
  if (cx.negocio.id !== orden.negocio_id) return rechazar("La conexión no es del negocio de la orden.");
  if (cx.proveedor !== orden.proveedor) return rechazar(`Este cobro se hizo con ${ad.nombre} y el negocio ya no cobra con ${ad.nombre}: el reembolso se hace en su panel y aquí se registra solo.`);
  if (!orden.simulado && cx.simulado) return rechazar("La cuenta conectada es de simulación y este cobro fue real: hazlo en el panel de Mercado Pago.");
  if (orden.cuenta_id && cx.cuentaId && orden.cuenta_id !== cx.cuentaId) {
    return rechazar(`Este cobro entró a otra cuenta de ${ad.nombre} (la que estaba conectada entonces). Hazlo en esa cuenta.`);
  }

  const { data: conocidos } = await admin
    .from("reembolsos_cobro")
    .select("id_remoto")
    .eq("negocio_id", orden.negocio_id)
    .eq("orden_id", orden.id)
    .not("id_remoto", "is", null);

  let remoto: ReembolsoRemoto;
  try {
    remoto = await ad.reembolsar(cx, orden, { ...args, conocidos: (conocidos ?? []).map((c) => c.id_remoto as string) });
  } catch (e) {
    return rechazar(`${ad.nombre} no hizo el reembolso: ${mensajeDeError(e)}`);
  }
  if (remoto.estado === "rechazado") return rechazar(`${ad.nombre} rechazó el reembolso.`, remoto.crudo);

  if (remoto.estado === "pendiente") {
    // Mercado Pago lo está procesando: queda en el aire con su id; el
    // webhook (o «Consultar» en Caja → Reembolsos) lo termina.
    await admin
      .from("reembolsos_cobro")
      .update({ id_remoto: remoto.id, ultimo_evento: remoto.crudo ?? null, detalle_error: `${ad.nombre} lo está procesando.` })
      .eq("id", args.reembolsoId)
      .eq("negocio_id", orden.negocio_id);
    return { ok: true, registrado: false, sinTurno: false, pendiente: true, comisionDevuelta: 0 };
  }

  const r = await registrar(admin, cx, orden, remoto, args.reembolsoId);
  return { ok: true, registrado: r.registrado, sinTurno: Boolean(r.sin_turno), pendiente: false, comisionDevuelta: Number(r.comision_devuelta ?? 0) };
}

/**
 * Lo que el proveedor tiene de esta orden contra lo que conocemos: registra
 * los reembolsos aprobados que no están (hechos en el panel, o pedidos desde
 * la app cuya respuesta se perdió) y cierra los pedidos que el proveedor
 * rechazó. Idempotente.
 */
export async function sincronizarReembolsos(admin: SupabaseClient, cx: ConexionCobro, orden: OrdenLocal, crudo?: unknown): Promise<number> {
  const ad = adaptador(orden.proveedor);
  if (!ad.reembolsosRemotos || orden.estado !== "pagada") return 0;
  const remotos = await ad.reembolsosRemotos(cx, orden, crudo);
  if (!remotos.length) return 0;
  const { data: locales } = await admin
    .from("reembolsos_cobro")
    .select("id, id_remoto, estado, monto")
    .eq("negocio_id", orden.negocio_id)
    .eq("orden_id", orden.id)
    .is("deleted_at", null);
  const porRemoto = new Map((locales ?? []).filter((l) => l.id_remoto).map((l) => [l.id_remoto as string, l]));
  let nuevos = 0;
  for (const r of remotos) {
    const local = porRemoto.get(r.id);
    if (local?.estado === "hecho") continue;
    if (r.estado === "rechazado") {
      if (local?.estado === "solicitado") await admin.rpc("rechazar_reembolso", { p_reembolso_id: local.id, p_detalle: `${ad.nombre} rechazó el reembolso.`, p_evento: r.crudo as object });
      continue;
    }
    if (r.estado !== "aprobado" || !(r.monto > 0)) continue;
    const res = await registrar(admin, cx, orden, r, (local?.id as string | undefined) ?? null);
    if (!res.repetido) nuevos += 1;
  }
  return nuevos;
}
