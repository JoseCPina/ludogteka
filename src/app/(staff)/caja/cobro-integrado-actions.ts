"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { negocioActual } from "@/lib/negocio/actual";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import { vigenciaLink } from "@/lib/mercadopago/links";
import { TERMINAL_ESPERA_SEGUNDOS } from "@/lib/mercadopago/config";
import { adaptador } from "@/lib/pagos/adaptadores";
import { conexionDeCobro, resumenDeCobro } from "@/lib/pagos/conexion";
import { leerOrdenLocal, sincronizarTerminal } from "@/lib/pagos/registro";
import { pedirReembolso, sincronizarReembolsos } from "@/lib/pagos/reembolsos";
import { mensajeDeError, type ConexionCobro, type ResultadoSincronizacion, type ResumenCobro } from "@/lib/pagos/tipos";
import { revisarCobroConProveedor } from "@/lib/pagos/no-recibido";

// El cobro integrado desde la cuenta: terminal y link de pago, con el
// proveedor que el negocio haya conectado (src/lib/pagos). Nada de aquí sabe
// si es Mercado Pago o Clip: habla con el adaptador.
//
// Solo admin o recepción. El demo lo ve (en simulación) pero no cobra.

async function exigirCaja(): Promise<{ error: string } | { cx: ConexionCobro }> {
  const sesion = await obtenerSesionConRol();
  if (!sesion || !["admin", "recepcion"].includes(sesion.rol)) return { error: "Solo admin o recepción pueden cobrar." };
  if ((await cargarNegocioLanding()).plan === "demo") return { error: MENSAJE_SOLO_LECTURA };
  const cx = await conexionDeCobro(await negocioActual());
  if (!cx) return { error: "Este negocio no tiene terminal ni links de pago conectados. Cobra a mano, o pide al admin que conecte su cuenta en Administración → Cobro con terminal." };
  return { cx };
}

// La secret key salta la RLS: todo lo de mp_ordenes se filtra por el
// negocio a mano, y la base recibe el negocio en el encabezado.
async function adminDelNegocio() {
  const negocio = await negocioActual();
  return { negocio, admin: createSupabaseAdminClient(negocio.id) };
}

function revalidarCuenta(reservaId: string) {
  revalidatePath(`/reservas/${reservaId}/cobrar`);
  revalidatePath(`/caja/cobrar/${reservaId}`);
  revalidatePath("/caja");
  revalidatePath("/caja/turno");
}

/** Lo que la pantalla de cobro necesita saber (sin credenciales). */
export async function estadoCobroIntegrado(): Promise<ResumenCobro> {
  return resumenDeCobro(await negocioActual());
}

export type ResultadoIniciarTerminal = { error: string | null; ordenId?: string; simulado?: boolean };

/**
 * Mandar el monto a la terminal. Se crea primero la orden nuestra (para
 * tener la referencia), luego la del proveedor; si el proveedor falla, la
 * nuestra queda 'fallida' con el motivo y no hay nada a medias.
 */
export async function iniciarCobroTerminal(
  reservaId: string,
  monto: number,
  plazos: number | null,
  descripcion: string
): Promise<ResultadoIniciarTerminal> {
  const acceso = await exigirCaja();
  if ("error" in acceso) return { error: acceso.error };
  const { cx } = acceso;
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto a cobrar debe ser mayor a cero." };
  if (plazos !== null && ![1, 3, 6, 9, 12].includes(plazos)) return { error: "Plazo no válido." };
  if (plazos && plazos > 1 && cx.proveedor !== "mercadopago") return { error: "Los meses sin intereses desde la app solo están con Mercado Pago." };
  if (!cx.terminalId) return { error: "No hay terminal escogida. El admin la escoge en Administración → Cobro con terminal; mientras, cobra a mano." };

  const supabase = await createSupabaseServerClient();
  const { data: turno } = await supabase.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) return { error: "No hay turno de caja abierto. Ábrelo antes de cobrar." };

  // Una orden viva por cuenta a la vez: dos montos en la terminal al mismo
  // tiempo es justo lo que confunde en el mostrador.
  const { negocio, admin } = await adminDelNegocio();
  const { data: reservaDelNegocio } = await admin.from("reservas").select("id").eq("id", reservaId).eq("negocio_id", negocio.id).maybeSingle();
  if (!reservaDelNegocio) return { error: "Cuenta no encontrada." };
  const { data: viva } = await admin
    .from("mp_ordenes")
    .select("id")
    .eq("negocio_id", negocio.id)
    .eq("reserva_id", reservaId)
    .eq("tipo", "point")
    .in("estado", ["creada", "en_terminal", "por_confirmar"])
    .is("deleted_at", null)
    .maybeSingle();
  if (viva) return { error: "Ya hay un cobro en la terminal (o por confirmar) para esta cuenta. Espéralo, revísalo con Mercado Pago o cancélalo antes de mandar otro.", ordenId: viva.id as string };

  const sesion = await obtenerSesionConRol();
  const { data: orden, error: errorOrden } = await admin
    .from("mp_ordenes")
    .insert({
      negocio_id: negocio.id,
      proveedor: cx.proveedor,
      cuenta_id: cx.cuentaId,
      tipo: "point",
      reserva_id: reservaId,
      monto: Math.round(monto * 100) / 100,
      descripcion: descripcion.slice(0, 120),
      estado: "creada",
      terminal_id: cx.terminalId,
      installments: plazos && plazos > 1 ? plazos : null,
      simulado: cx.simulado,
      conexion_desde: cx.conectadaAt,
      expira_at: new Date(Date.now() + (TERMINAL_ESPERA_SEGUNDOS + 60) * 1000).toISOString(),
      created_by: sesion?.user.id ?? null,
    })
    .select("id")
    .single();
  if (errorOrden || !orden) return { error: "No pudimos registrar la orden. Intenta de nuevo." };

  try {
    const remota = await adaptador(cx.proveedor).crearCobroTerminal(cx, { ordenId: orden.id as string, monto, descripcion, plazos });
    await admin
      .from("mp_ordenes")
      .update({ mp_order_id: remota.idRemoto, estado: remota.estado, ultimo_evento: remota.crudo as object })
      .eq("id", orden.id)
      .eq("negocio_id", negocio.id);
  } catch (e) {
    await admin.from("mp_ordenes").update({ estado: "fallida", detalle_error: mensajeDeError(e) }).eq("id", orden.id).eq("negocio_id", negocio.id);
    return { error: mensajeDeError(e), ordenId: orden.id as string };
  }

  revalidarCuenta(reservaId);
  return { error: null, ordenId: orden.id as string, simulado: cx.simulado };
}

export type ResultadoConsulta = { error: string | null } & Partial<ResultadoSincronizacion>;

// La pantalla llama esto cada pocos segundos mientras el cliente paga.
// Si el webhook ya registró el pago, aquí solo se lee; si no, se consulta
// al proveedor y se registra desde aquí. Nunca dos veces.
export async function consultarCobroTerminal(ordenId: string): Promise<ResultadoConsulta> {
  const acceso = await exigirCaja();
  if ("error" in acceso) return { error: acceso.error };
  const { negocio, admin } = await adminDelNegocio();
  const orden = await leerOrdenLocal(admin, ordenId, negocio.id);
  if (!orden) return { error: "Orden no encontrada." };
  try {
    const r = await sincronizarTerminal(admin, acceso.cx, orden);
    if (r.pagada || ["cancelada", "expirada", "fallida", "por_confirmar"].includes(r.estado)) {
      const { data } = await admin.from("mp_ordenes").select("reserva_id").eq("id", ordenId).eq("negocio_id", negocio.id).single();
      if (data) revalidarCuenta(data.reserva_id as string);
    }
    return { error: null, ...r };
  } catch (e) {
    return { error: mensajeDeError(e) };
  }
}

// Cancelar desde la app (mientras la orden no se haya pagado). Si la
// terminal ya la tiene en pantalla, el proveedor pide cancelarla ahí; de
// todos modos la orden nuestra queda cancelada para que la cuenta no se
// quede con un cobro "en curso" colgado.
export async function cancelarCobroTerminal(ordenId: string, motivo: string): Promise<{ error: string | null; aviso?: string }> {
  const acceso = await exigirCaja();
  if ("error" in acceso) return { error: acceso.error };
  const { negocio, admin } = await adminDelNegocio();
  const orden = await leerOrdenLocal(admin, ordenId, negocio.id);
  if (!orden) return { error: "Orden no encontrada." };
  if (orden.estado === "pagada" || orden.cobro_id) return { error: "Este cobro ya se pagó; si hay que devolverlo, usa una devolución." };
  if (orden.estado === "por_confirmar") {
    // Por confirmar puede ser dinero real: solo un admin la cancela, y después de volver a preguntarle al proveedor.
    const sesionCancela = await obtenerSesionConRol();
    if (sesionCancela?.rol !== "admin") return { error: "Este cobro está por confirmar: revísalo con Mercado Pago. Solo un admin lo cancela si de verdad no se pagó." };
    if (orden.tipo === "point") {
      try {
        const r = await sincronizarTerminal(admin, acceso.cx, orden);
        if (r.pagada) {
          revalidatePath("/caja");
          return { error: "Mercado Pago ya confirmó este pago: el cobro quedó registrado." };
        }
      } catch {
        // Si no se pudo consultar, el admin decide con lo que sabe.
      }
    }
  }

  let aviso: string | undefined;
  if (orden.mp_order_id && orden.proveedor === acceso.cx.proveedor) {
    try {
      await adaptador(orden.proveedor).cancelarCobroTerminal(acceso.cx, orden);
    } catch (e) {
      aviso = `No se pudo cancelar con el proveedor (${mensajeDeError(e)}). Cancélalo en la terminal si sigue en pantalla.`;
    }
  }
  await admin
    .from("mp_ordenes")
    .update({ estado: "cancelada", detalle_error: motivo || "Cancelado desde la app", notificado_at: new Date().toISOString() })
    .eq("id", ordenId)
    .eq("negocio_id", negocio.id);
  const { data } = await admin.from("mp_ordenes").select("reserva_id").eq("id", ordenId).eq("negocio_id", negocio.id).single();
  if (data) revalidarCuenta(data.reserva_id as string);
  return { error: null, aviso };
}

export type ResultadoLink = { error: string | null; ordenId?: string; url?: string; urlWhatsApp?: string; simulado?: boolean };

// Link de pago por WhatsApp, a nombre del negocio: para anticipos de hotel
// o saldos sin que el cliente venga. Cuando pague, el webhook registra el
// cobro con método 'transferencia' (el dinero cae en la cuenta del negocio).
export async function crearLinkPago(reservaId: string, monto: number, concepto: string): Promise<ResultadoLink> {
  const acceso = await exigirCaja();
  if ("error" in acceso) return { error: acceso.error };
  const { cx } = acceso;
  const ad = adaptador(cx.proveedor);
  if (!ad.soportaLink || !ad.crearLinkPago) return { error: `Los links de pago no están disponibles con ${ad.nombre}.` };
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto del link debe ser mayor a cero." };

  const supabase = await createSupabaseServerClient();
  const { data: reserva } = await supabase.from("reservas").select("id, clientes(nombre, telefono)").eq("id", reservaId).maybeSingle();
  if (!reserva) return { error: "Cuenta no encontrada." };
  const cliente = (Array.isArray(reserva.clientes) ? reserva.clientes[0] : reserva.clientes) as { nombre: string; telefono: string | null } | null;

  const { negocio, admin } = await adminDelNegocio();
  const sesion = await obtenerSesionConRol();
  const expira = vigenciaLink();
  const titulo = concepto.trim() || `Pago a ${negocio.nombre}`;
  const { data: orden, error: errorOrden } = await admin
    .from("mp_ordenes")
    .insert({
      negocio_id: negocio.id,
      proveedor: cx.proveedor,
      cuenta_id: cx.cuentaId,
      tipo: "link",
      reserva_id: reservaId,
      monto: Math.round(monto * 100) / 100,
      descripcion: titulo.slice(0, 120),
      estado: "creada",
      simulado: cx.simulado,
      expira_at: expira.toISOString(),
      created_by: sesion?.user.id ?? null,
    })
    .select("id")
    .single();
  if (errorOrden || !orden) return { error: "No pudimos registrar el link. Intenta de nuevo." };

  try {
    const link = await ad.crearLinkPago(cx, {
      ordenId: orden.id as string,
      monto,
      titulo,
      clienteNombre: cliente?.nombre ?? "Cliente",
      clienteTelefono: cliente?.telefono?.replace(/\D/g, "") ?? null,
      expiraAt: expira,
    });
    await admin
      .from("mp_ordenes")
      .update({ mp_preference_id: link.idRemoto, url_pago: link.url, ultimo_evento: link.crudo as object })
      .eq("id", orden.id)
      .eq("negocio_id", negocio.id);

    const mensaje =
      `Hola ${cliente?.nombre ?? ""}, te mandamos el link para pagar ${titulo.toLowerCase()} en ${negocio.nombre}: $${monto.toFixed(2)}. ` +
      `Puedes pagar con tarjeta o desde tu cuenta de ${ad.nombre} aquí: ${link.url} ` +
      `(vence en 7 días). ¡Gracias!`;
    const telefono = cliente?.telefono?.replace(/\D/g, "") ?? "";
    const urlWhatsApp = telefono ? `https://wa.me/52${telefono}?text=${encodeURIComponent(mensaje)}` : undefined;

    revalidarCuenta(reservaId);
    return { error: null, ordenId: orden.id as string, url: link.url, urlWhatsApp, simulado: cx.simulado };
  } catch (e) {
    await admin.from("mp_ordenes").update({ estado: "fallida", detalle_error: mensajeDeError(e) }).eq("id", orden.id).eq("negocio_id", negocio.id);
    return { error: mensajeDeError(e) };
  }
}

// Pagos confirmados que se quedaron sin turno (un link pagado de noche):
// se registran en el turno abierto. También los registra solo el trigger
// al abrir turno; esto es para el botón de la caja.
export async function registrarPagosMpPendientes(): Promise<{ error: string | null; registrados: number }> {
  const sesion = await obtenerSesionConRol();
  if (!sesion || !["admin", "recepcion"].includes(sesion.rol)) return { error: "Solo admin o recepción pueden cobrar.", registrados: 0 };
  if ((await cargarNegocioLanding()).plan === "demo") return { error: MENSAJE_SOLO_LECTURA, registrados: 0 };
  const { negocio, admin } = await adminDelNegocio();
  const { data: pendientes } = await admin
    .from("mp_ordenes")
    .select("id, mp_payment_id, monto, installments, mp_payment_type")
    .eq("negocio_id", negocio.id)
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

export type ResultadoDevolucionIntegrada = { error: string | null; aviso?: string };

/**
 * Devolver un cobro que entró por Mercado Pago: el reembolso se hace en
 * Mercado Pago con la cuenta del negocio y, solo si lo acepta, la devolución
 * queda en caja en el mismo paso. Quién puede y cuánto lo decide la base
 * (preparar_reembolso: solo admin, lo que queda del cobro, turno abierto).
 */
export async function devolverConProveedor(reservaId: string, cobroId: string, monto: number, motivo: string): Promise<ResultadoDevolucionIntegrada> {
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto a devolver debe ser mayor a cero." };
  if (!motivo.trim()) return { error: "Escribe el motivo de la devolución." };
  if ((await cargarNegocioLanding()).plan === "demo") return { error: MENSAJE_SOLO_LECTURA };

  const supabase = await createSupabaseServerClient();
  const { data: prep, error } = await supabase.rpc("preparar_reembolso", {
    p_cobro_id: cobroId,
    p_monto: Math.round(monto * 100) / 100,
    p_motivo: motivo.trim(),
  });
  if (error) return { error: traducirErrorCaja(error.message) };
  const p = prep as { reembolso_id: string; orden_id: string; total: boolean };

  const { negocio, admin } = await adminDelNegocio();
  const orden = await leerOrdenLocal(admin, p.orden_id, negocio.id);
  if (!orden) return { error: "Orden no encontrada." };
  const cx = await conexionDeCobro(negocio);
  if (!cx) {
    await admin.rpc("rechazar_reembolso", { p_reembolso_id: p.reembolso_id, p_detalle: "Sin cuenta de Mercado Pago conectada.", p_evento: null });
    return { error: "Mercado Pago no está conectado: no se pudo pedir el reembolso y no se registró nada en caja. Reconecta la cuenta en Administración → Cobro con terminal, o hazlo en el panel de Mercado Pago (se registra solo)." };
  }
  try {
    const r = await pedirReembolso(admin, cx, orden, { reembolsoId: p.reembolso_id, monto, total: p.total });
    revalidarCuenta(reservaId);
    if (!r.ok) return { error: `${r.error} No se registró nada en caja.` };
    if (r.pendiente) return { error: null, aviso: "Mercado Pago lo está procesando. En cuanto lo confirme se registra solo en caja; lo ves en Caja → Reembolsos." };
    const avisos = [
      r.sinTurno ? "Se reembolsó en Mercado Pago; como no hay turno abierto, entra a caja al abrir el siguiente." : null,
      r.comisionDevuelta > 0 ? `Mercado Pago regresó $${r.comisionDevuelta.toFixed(2)} de comisión: se quitó de los gastos.` : null,
    ].filter(Boolean);
    return { error: null, aviso: avisos.join(" ") || undefined };
  } catch (e) {
    // Mercado Pago ya lo hizo pero no se pudo registrar: queda en el aire y
    // lo termina «Consultar» en Caja → Reembolsos (o el webhook).
    console.error("[reembolso] no se pudo registrar", p.reembolso_id, e);
    revalidarCuenta(reservaId);
    return { error: `No pudimos terminar de registrarlo (${mensajeDeError(e)}). Revisa Caja → Reembolsos: ahí se consulta a Mercado Pago y se registra una sola vez.` };
  }
}

function traducirErrorCaja(msg: string): string {
  if (/solo lectura/i.test(msg)) return MENSAJE_SOLO_LECTURA;
  return msg.replace(/^.*?ERROR:\s*/, "");
}

/** Caja → Reembolsos: volver a preguntarle al proveedor por una orden. */
export async function consultarReembolsosDeOrden(ordenId: string): Promise<{ error: string | null; nuevos?: number }> {
  const sesion = await obtenerSesionConRol();
  if (!sesion || !["admin", "recepcion"].includes(sesion.rol)) return { error: "Solo admin o recepción." };
  if ((await cargarNegocioLanding()).plan === "demo") return { error: MENSAJE_SOLO_LECTURA };
  const { negocio, admin } = await adminDelNegocio();
  const orden = await leerOrdenLocal(admin, ordenId, negocio.id);
  if (!orden) return { error: "Orden no encontrada." };
  const cx = await conexionDeCobro(negocio);
  if (!cx || cx.proveedor !== orden.proveedor) return { error: "El negocio ya no está conectado a ese proveedor: revísalo en su panel." };
  try {
    const nuevos = await sincronizarReembolsos(admin, cx, orden);
    revalidatePath("/caja/reembolsos");
    revalidatePath("/caja");
    return { error: null, nuevos };
  } catch (e) {
    return { error: mensajeDeError(e) };
  }
}

export async function marcarReembolsoRevisado(reembolsoId: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("marcar_reembolso_revisado", { p_reembolso_id: reembolsoId });
  if (error) return { error: traducirErrorCaja(error.message) };
  revalidatePath("/caja/reembolsos");
  revalidatePath("/recepcion");
  return { error: null };
}

export type ResultadoNoRecibido = { error: string | null; aviso?: string };

/**
 * «Marcar como no recibido»: corrige un cobro con terminal que quedó como
 * pagado sin que el proveedor tenga un pago aprobado. Solo admin, con motivo.
 * Antes de tocar nada se le pregunta al proveedor (src/lib/pagos/no-recibido.ts);
 * si hay un pago aprobado que pueda corresponder, se niega. La corrección entra
 * como un movimiento en el turno abierto: un turno cerrado nunca cambia.
 */
export async function marcarCobroNoRecibido(reservaId: string, cobroId: string, motivo: string): Promise<ResultadoNoRecibido> {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") return { error: "Solo un admin marca un cobro como no recibido." };
  if ((await cargarNegocioLanding()).plan === "demo") return { error: MENSAJE_SOLO_LECTURA };
  if (motivo.trim().length < 5) return { error: "Escribe el motivo: qué pasó con este cobro." };
  const negocio = await negocioActual();
  const r = await revisarCobroConProveedor(negocio, cobroId, motivo, sesion.user.id);
  revalidarCuenta(reservaId);
  revalidatePath("/caja/conciliacion");
  revalidatePath("/recepcion");
  if (!r.ok) return { error: r.error };
  return { error: null, aviso: r.aviso };
}
