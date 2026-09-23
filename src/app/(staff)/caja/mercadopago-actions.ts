"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { modoSimulacion, terminalIdConfigurada, TERMINAL_ESPERA_SEGUNDOS } from "@/lib/mercadopago/config";
import { crearOrdenPoint, cancelarOrdenPoint } from "@/lib/mercadopago/point";
import { crearLinkPago as crearPreferenciaMp, vigenciaLink } from "@/lib/mercadopago/links";
import { leerOrdenLocal, sincronizarOrdenPoint, type ResultadoSincronizacion } from "@/lib/mercadopago/registro";
import { ErrorMercadoPago } from "@/lib/mercadopago/errores";

// Todas las acciones de Mercado Pago comparten esto: solo admin o
// recepción, y el error se traduce a qué revisar.
async function exigirCaja(): Promise<string | null> {
  const sesion = await obtenerSesionConRol();
  if (!sesion || !["admin", "recepcion"].includes(sesion.rol)) return "Solo admin o recepción pueden cobrar.";
  return null;
}

function mensajeDe(e: unknown): string {
  if (e instanceof ErrorMercadoPago) return e.sugerencia ? `${e.message} ${e.sugerencia}` : e.message;
  return e instanceof Error ? e.message : "No pudimos hablar con Mercado Pago.";
}

function revalidarCuenta(reservaId: string) {
  revalidatePath(`/reservas/${reservaId}/cobrar`);
  revalidatePath(`/caja/cobrar/${reservaId}`);
  revalidatePath("/caja");
  revalidatePath("/caja/turno");
}

export type EstadoMpDisponible = {
  simulado: boolean;
  terminal: boolean;
  esperaSegundos: number;
};

export async function estadoMercadoPago(): Promise<EstadoMpDisponible> {
  return { simulado: modoSimulacion(), terminal: modoSimulacion() || Boolean(terminalIdConfigurada()), esperaSegundos: TERMINAL_ESPERA_SEGUNDOS };
}

export type ResultadoIniciarTerminal = { error: string | null; ordenId?: string; simulado?: boolean };

/**
 * Mandar el monto a la terminal. Se crea primero la orden nuestra (para
 * tener el external_reference), luego la de Mercado Pago; si Mercado Pago
 * falla, la nuestra queda 'fallida' con el motivo y no hay nada a medias.
 */
export async function iniciarCobroTerminal(
  reservaId: string,
  monto: number,
  plazos: number | null,
  descripcion: string
): Promise<ResultadoIniciarTerminal> {
  const rechazo = await exigirCaja();
  if (rechazo) return { error: rechazo };
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto a cobrar debe ser mayor a cero." };
  if (plazos !== null && ![1, 3, 6, 9, 12].includes(plazos)) return { error: "Plazo no válido." };

  const supabase = await createSupabaseServerClient();
  const { data: turno } = await supabase.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) return { error: "No hay turno de caja abierto. Ábrelo antes de cobrar." };

  const terminalId = terminalIdConfigurada() ?? (modoSimulacion() ? "SIMULADA__TERMINAL-01" : null);
  if (!terminalId) {
    return { error: "No hay terminal configurada (MERCADOPAGO_TERMINAL_ID). Revisa el diagnóstico en /admin o cobra a mano." };
  }

  // Una orden viva por cuenta a la vez: dos montos en la terminal al mismo
  // tiempo es justo lo que confunde en el mostrador.
  const admin = createSupabaseAdminClient();
  const { data: viva } = await admin
    .from("mp_ordenes")
    .select("id")
    .eq("reserva_id", reservaId)
    .eq("tipo", "point")
    .in("estado", ["creada", "en_terminal"])
    .is("deleted_at", null)
    .maybeSingle();
  if (viva) return { error: "Ya hay un cobro en la terminal para esta cuenta. Espéralo o cancélalo antes de mandar otro.", ordenId: viva.id as string };

  const sesion = await obtenerSesionConRol();
  const { data: orden, error: errorOrden } = await admin
    .from("mp_ordenes")
    .insert({
      tipo: "point",
      reserva_id: reservaId,
      monto: Math.round(monto * 100) / 100,
      descripcion: descripcion.slice(0, 120),
      estado: "creada",
      terminal_id: terminalId,
      installments: plazos && plazos > 1 ? plazos : null,
      simulado: modoSimulacion(),
      expira_at: new Date(Date.now() + (TERMINAL_ESPERA_SEGUNDOS + 60) * 1000).toISOString(),
      created_by: sesion?.user.id ?? null,
    })
    .select("id")
    .single();
  if (errorOrden || !orden) return { error: "No pudimos registrar la orden. Intenta de nuevo." };

  try {
    const remota = await crearOrdenPoint({
      monto,
      externalReference: orden.id as string,
      descripcion,
      terminalId,
      plazos,
    });
    await admin
      .from("mp_ordenes")
      .update({ mp_order_id: remota.id, estado: remota.status === "at_terminal" ? "en_terminal" : "creada", ultimo_evento: remota })
      .eq("id", orden.id);
  } catch (e) {
    await admin.from("mp_ordenes").update({ estado: "fallida", detalle_error: mensajeDe(e) }).eq("id", orden.id);
    return { error: mensajeDe(e), ordenId: orden.id as string };
  }

  revalidarCuenta(reservaId);
  return { error: null, ordenId: orden.id as string, simulado: modoSimulacion() };
}

export type ResultadoConsulta = { error: string | null } & Partial<ResultadoSincronizacion>;

// La pantalla llama esto cada pocos segundos mientras el cliente paga.
// Si el webhook ya registró el pago, aquí solo se lee; si no, se consulta
// a Mercado Pago y se registra desde aquí. Nunca dos veces.
export async function consultarCobroTerminal(ordenId: string): Promise<ResultadoConsulta> {
  const rechazo = await exigirCaja();
  if (rechazo) return { error: rechazo };
  const admin = createSupabaseAdminClient();
  const orden = await leerOrdenLocal(admin, ordenId);
  if (!orden) return { error: "Orden no encontrada." };
  try {
    const r = await sincronizarOrdenPoint(admin, orden);
    if (r.pagada || ["cancelada", "expirada", "fallida"].includes(r.estado)) {
      const { data } = await admin.from("mp_ordenes").select("reserva_id").eq("id", ordenId).single();
      if (data) revalidarCuenta(data.reserva_id as string);
    }
    return { error: null, ...r };
  } catch (e) {
    return { error: mensajeDe(e) };
  }
}

// Cancelar desde la app (mientras la orden no se haya pagado). Si la
// terminal ya la tiene en pantalla, Mercado Pago pide cancelarla ahí;
// de todos modos la orden nuestra queda cancelada para que la cuenta no
// se quede con un cobro "en curso" colgado.
export async function cancelarCobroTerminal(ordenId: string, motivo: string): Promise<{ error: string | null; aviso?: string }> {
  const rechazo = await exigirCaja();
  if (rechazo) return { error: rechazo };
  const admin = createSupabaseAdminClient();
  const orden = await leerOrdenLocal(admin, ordenId);
  if (!orden) return { error: "Orden no encontrada." };
  if (orden.estado === "pagada" || orden.cobro_id) return { error: "Este cobro ya se pagó; si hay que devolverlo, usa una devolución." };

  let aviso: string | undefined;
  if (orden.mp_order_id) {
    try {
      await cancelarOrdenPoint(orden.mp_order_id, orden.id);
    } catch (e) {
      // Mercado Pago no deja cancelar por API una orden que ya está en
      // la pantalla de la terminal: hay que cancelarla ahí. La nuestra
      // se cierra igual.
      aviso = `No se pudo cancelar en Mercado Pago (${mensajeDe(e)}). Cancélala en la terminal si sigue en pantalla.`;
    }
  }
  await admin
    .from("mp_ordenes")
    .update({ estado: "cancelada", detalle_error: motivo || "Cancelado desde la app", notificado_at: new Date().toISOString() })
    .eq("id", ordenId);
  const { data } = await admin.from("mp_ordenes").select("reserva_id").eq("id", ordenId).single();
  if (data) revalidarCuenta(data.reserva_id as string);
  return { error: null, aviso };
}

export type ResultadoLink = { error: string | null; ordenId?: string; url?: string; urlWhatsApp?: string; simulado?: boolean };

// Link de pago por WhatsApp: para anticipos de hotel o saldos pendientes
// sin que el cliente venga. Cuando pague, el webhook registra el cobro
// con método 'transferencia' (el dinero cae en la cuenta de Mercado Pago).
export async function crearLinkPago(reservaId: string, monto: number, concepto: string): Promise<ResultadoLink> {
  const rechazo = await exigirCaja();
  if (rechazo) return { error: rechazo };
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto del link debe ser mayor a cero." };

  const supabase = await createSupabaseServerClient();
  const { data: reserva } = await supabase
    .from("reservas")
    .select("id, clientes(nombre, telefono)")
    .eq("id", reservaId)
    .maybeSingle();
  if (!reserva) return { error: "Cuenta no encontrada." };
  const cliente = (Array.isArray(reserva.clientes) ? reserva.clientes[0] : reserva.clientes) as { nombre: string; telefono: string | null } | null;

  const admin = createSupabaseAdminClient();
  const sesion = await obtenerSesionConRol();
  const expira = vigenciaLink();
  const titulo = concepto.trim() || "Pago a Ludogteka";
  const { data: orden, error: errorOrden } = await admin
    .from("mp_ordenes")
    .insert({
      tipo: "link",
      reserva_id: reservaId,
      monto: Math.round(monto * 100) / 100,
      descripcion: titulo.slice(0, 120),
      estado: "creada",
      simulado: modoSimulacion(),
      expira_at: expira.toISOString(),
      created_by: sesion?.user.id ?? null,
    })
    .select("id")
    .single();
  if (errorOrden || !orden) return { error: "No pudimos registrar el link. Intenta de nuevo." };

  try {
    const pref = await crearPreferenciaMp({
      ordenId: orden.id as string,
      monto,
      titulo,
      clienteNombre: cliente?.nombre ?? "Cliente",
      clienteTelefono: cliente?.telefono?.replace(/\D/g, "") ?? null,
      expiraAt: expira,
    });
    await admin
      .from("mp_ordenes")
      .update({ mp_preference_id: pref.id, url_pago: pref.init_point, ultimo_evento: pref })
      .eq("id", orden.id);

    const mensaje =
      `Hola ${cliente?.nombre ?? ""}, te mandamos el link para pagar ${titulo.toLowerCase()} en Ludogteka: $${monto.toFixed(2)}. ` +
      `Puedes pagar con tarjeta o desde tu cuenta de Mercado Pago aquí: ${pref.init_point} ` +
      `(vence en 7 días). ¡Gracias!`;
    const telefono = cliente?.telefono?.replace(/\D/g, "") ?? "";
    const urlWhatsApp = telefono ? `https://wa.me/52${telefono}?text=${encodeURIComponent(mensaje)}` : undefined;

    revalidarCuenta(reservaId);
    return { error: null, ordenId: orden.id as string, url: pref.init_point, urlWhatsApp, simulado: modoSimulacion() };
  } catch (e) {
    await admin.from("mp_ordenes").update({ estado: "fallida", detalle_error: mensajeDe(e) }).eq("id", orden.id);
    return { error: mensajeDe(e) };
  }
}

// Pagos confirmados que se quedaron sin turno (un link pagado de
// noche): se registran en el turno abierto. También los registra solo
// el trigger al abrir turno; esto es para el caso en que el turno ya
// estaba abierto cuando llegó algo y algo falló, o para el botón de la
// caja.
export async function registrarPagosMpPendientes(): Promise<{ error: string | null; registrados: number }> {
  const rechazo = await exigirCaja();
  if (rechazo) return { error: rechazo, registrados: 0 };
  const admin = createSupabaseAdminClient();
  const { data: pendientes } = await admin
    .from("mp_ordenes")
    .select("id, mp_payment_id, monto, installments, mp_payment_type")
    .eq("estado", "pagada")
    .is("cobro_id", null)
    .is("deleted_at", null);
  let registrados = 0;
  for (const p of pendientes ?? []) {
    const { data } = await admin.rpc("registrar_pago_mercadopago", {
      p_orden_id: p.id,
      p_mp_payment_id: p.mp_payment_id,
      p_monto: Number(p.monto),
      p_installments: p.installments ?? 1,
      p_mp_payment_type: p.mp_payment_type,
      p_evento: null,
    });
    if ((data as { registrado?: boolean } | null)?.registrado) registrados += 1;
  }
  revalidatePath("/caja");
  revalidatePath("/caja/turno");
  return { error: null, registrados };
}
