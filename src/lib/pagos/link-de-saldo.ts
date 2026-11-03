import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { conexionDeCobro, negocioParaCobro } from "@/lib/pagos/conexion";
import { adaptador } from "@/lib/pagos/adaptadores";
import { vigenciaLink } from "@/lib/mercadopago/links";
import { mensajeDeError } from "@/lib/pagos/tipos";

export type ResultadoLinkSaldo = { error: string | null; datos?: { url: string; monto: number; simulado: boolean }; registros?: RegistroFinal[] };

/**
 * El link de pago del SALDO de una cuenta, para el dueño (app y portal; ux/cobros-parciales, 3 de noviembre de 2026).
 * `supabase` es el cliente con la sesión del dueño y el negocio de la cuenta: la lista sale de `mis_pagos_pendientes`
 * (solo SUS cuentas con saldo), así que el monto es siempre el saldo de la cuenta (la misma fuente que Caja), nunca el
 * total. Un link vivo se reusa SOLO si cobra exactamente ese saldo: después de un abono en mostrador, el link viejo
 * cobraría de más, y se hace uno nuevo por lo que falta.
 */
export async function linkDeSaldo(supabase: SupabaseClient, negocioId: string, reservaId: string, userId: string | null): Promise<ResultadoLinkSaldo> {
  const { data: pendientes } = await supabase.rpc("mis_pagos_pendientes");
  const cuenta = ((pendientes ?? []) as { reserva_id: string; saldo: number; descripcion: string; link: { url: string; monto: number; expira_at: string | null } | null }[]).find((p) => p.reserva_id === reservaId);
  if (!cuenta || Number(cuenta.saldo) <= 0) return { error: "Esa cuenta no tiene saldo pendiente." };
  const monto = Math.round(Number(cuenta.saldo) * 100) / 100;
  // Ya hay un link vivo por ESE monto: no se crea nada (nada que repintar).
  if (cuenta.link?.url && Math.round(Number(cuenta.link.monto) * 100) === Math.round(monto * 100)) return { error: null, datos: { url: cuenta.link.url, monto, simulado: false }, registros: [] };
  const negocio = await negocioParaCobro(negocioId);
  if (!negocio) return { error: "No encontramos el negocio." };
  const cx = await conexionDeCobro(negocio);
  if (!cx) return { error: "Este negocio no cobra con link todavía: paga en el mostrador o pídeselo por WhatsApp." };
  const admin = createSupabaseAdminClient(negocioId);
  const expira = vigenciaLink();
  const titulo = `Pago a ${negocio.nombre}`;
  const { data: orden, error: errorOrden } = await admin
    .from("mp_ordenes")
    .insert({
      negocio_id: negocioId,
      proveedor: cx.proveedor,
      cuenta_id: cx.cuentaId,
      tipo: "link",
      reserva_id: reservaId,
      monto,
      descripcion: `${titulo} · ${cuenta.descripcion}`.slice(0, 120),
      estado: "creada",
      simulado: cx.simulado,
      expira_at: expira.toISOString(),
      created_by: userId,
    })
    .select("id")
    .single();
  if (errorOrden || !orden) return { error: "No pudimos preparar el link. Intenta de nuevo." };
  const ad = adaptador(cx.proveedor);
  if (!ad.crearLinkPago) {
    await admin.from("mp_ordenes").update({ estado: "fallida", detalle_error: "El proveedor de cobro del negocio no hace links." }).eq("id", orden.id).eq("negocio_id", negocioId);
    return { error: "Este negocio no cobra con link todavía: paga en el mostrador o pídeselo por WhatsApp." };
  }
  try {
    const { data: reservaFila } = await admin.from("reservas").select("cliente_id").eq("id", reservaId).eq("negocio_id", negocioId).maybeSingle();
    const { data: dueno } = reservaFila?.cliente_id ? await admin.from("clientes").select("nombre, telefono").eq("id", reservaFila.cliente_id as string).maybeSingle() : { data: null };
    const link = await ad.crearLinkPago(cx, {
      ordenId: orden.id as string,
      monto,
      titulo,
      clienteNombre: (dueno?.nombre as string | null) ?? "Cliente",
      clienteTelefono: ((dueno?.telefono as string | null) ?? "").replace(/\D/g, "") || null,
      expiraAt: expira,
    });
    await admin.from("mp_ordenes").update({ mp_preference_id: link.idRemoto, url_pago: link.url, ultimo_evento: link.crudo as object }).eq("id", orden.id).eq("negocio_id", negocioId);
    return { error: null, datos: { url: link.url, monto, simulado: cx.simulado }, registros: await registrosDe(supabase, [{ t: "mp_ordenes", i: orden.id as string, datos: { id: orden.id, url_pago: link.url, monto, estado: "creada" } }]) };
  } catch (e) {
    await admin.from("mp_ordenes").update({ estado: "fallida", detalle_error: mensajeDeError(e) }).eq("id", orden.id).eq("negocio_id", negocioId);
    return { error: mensajeDeError(e) };
  }
}
