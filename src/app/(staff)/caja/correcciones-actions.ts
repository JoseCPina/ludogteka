"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MENSAJE_DEMO } from "@/lib/solo-lectura";
import { traducirError } from "../reservas/traducir-error";
import { totalesDeCuenta, type TotalesCuenta } from "@/lib/cobro/totales";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";

// Anular y corregir cobros, corregir el precio de una cuenta y agregar efectivo
// al turno (migración 20261013000000). Los permisos y todas las reglas las
// comprueba la base con la sesión de quien llama: aquí solo se traduce.

// `totales` = la cuenta ya corregida (QA S15, N45): la pantalla la pinta de inmediato.
export type ResultadoCorreccion = { error: string | null; aviso?: string; totales?: TotalesCuenta; registros?: RegistroFinal[] };

async function demo(): Promise<ResultadoCorreccion | null> {
  return (await cargarNegocioLanding()).plan === "demo" ? { error: MENSAJE_DEMO } : null;
}

// QA R23 (N89): anular o corregir un cobro y corregir un precio NO llaman a esta función: un revalidatePath dentro
// de una acción hace que Next vuelva a pintar la pantalla completa ANTES de contestar (3 a 4 s en Caja). Esas
// acciones contestan con los totales nuevos, la pantalla los pinta al instante y se refresca sola; las demás
// pantallas son dinámicas y se leen de nuevo al abrirlas.
function refrescar(reservaId?: string | null, grupoId?: string | null) {
  revalidatePath("/caja");
  revalidatePath("/caja/turno");
  revalidatePath("/caja/conciliacion");
  revalidatePath("/recepcion");
  revalidatePath("/reportes");
  if (reservaId) {
    revalidatePath(`/caja/cobrar/${reservaId}`);
    revalidatePath(`/reservas/${reservaId}/cobrar`);
  }
  if (grupoId) revalidatePath(`/caja/recibo-junto/${grupoId}`);
}

type RespuestaCobro = { turno_del_cobro_cerrado?: boolean; grupo_id?: string | null; reserva_id?: string; saldo?: number; diferencia?: number };

// QA S17 (N81): la corrección de un turno cerrado queda en ESE turno, como ajuste posterior al corte; el turno
// abierto de hoy no cambia. Solo si de verdad sale efectivo del cajón se registra un retiro en el turno abierto.
const AVISO_CERRADO = " El cobro era de un turno ya cerrado: quedó como ajuste posterior al corte de ese turno (su corte no cambia) y el turno abierto de hoy no se movió.";

/** Antes de corregir: si hay que sacar efectivo del cajón, tiene que haber un turno abierto. */
async function exigirTurnoParaCajon(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, cajon?: number): Promise<ResultadoCorreccion | null> {
  if (!cajon || cajon <= 0) return null;
  const { data } = await supabase.from("turnos_caja").select("id").eq("estado", "abierto").limit(1).maybeSingle();
  return data ? null : { error: "No hay turno de caja abierto: para sacar el efectivo del cajón hace falta uno." };
}

/** Después de corregir: el efectivo que salió del cajón hoy, como retiro con motivo en el turno abierto. */
async function retiroDelCajon(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, cajon: number | undefined, motivo: string): Promise<string> {
  if (!cajon || cajon <= 0) return "";
  const { error } = await supabase.rpc("registrar_retiro", { p_monto: cajon, p_motivo: `Devolución en efectivo del cajón por corrección de un cobro: ${motivo.trim()}`.slice(0, 300) });
  return error
    ? ` La corrección quedó, pero el retiro del cajón no: ${traducirError(error)} Regístralo en Caja → Turno.`
    : ` Se registró un retiro de efectivo del cajón en el turno abierto.`;
}

export async function anularCobro(cobroId: string, motivo: string, reservaId?: string | null, cajon?: number): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  if (motivo.trim().length < 5) return { error: "Escribe el motivo de la anulación (qué pasó)." };
  const supabase = await createSupabaseServerClient();
  const sinTurno = await exigirTurnoParaCajon(supabase, cajon);
  if (sinTurno) return { error: sinTurno.error };
  const { data, error } = await supabase.rpc("anular_cobro", { p_cobro_id: cobroId, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  const d = data as RespuestaCobro | null;
  const totales = await totalesDeCuenta(supabase, reservaId ?? d?.reserva_id);
  const retiro = await retiroDelCajon(supabase, cajon, motivo);
  return {
    error: null,
    totales,
    aviso: `Cobro anulado: la cuenta volvió a quedar por cobrar y el cobro salió de los totales.${d?.turno_del_cobro_cerrado ? AVISO_CERRADO : ""}${retiro}`,
    registros: await registrosDe(supabase, [{ t: "cobros", i: cobroId }, { t: "reservas", i: reservaId ?? d?.reserva_id }]),
  };
}

export async function anularCobroGrupo(grupoId: string, motivo: string, reservaId?: string | null, cajon?: number): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  if (motivo.trim().length < 5) return { error: "Escribe el motivo de la anulación (qué pasó)." };
  const supabase = await createSupabaseServerClient();
  const sinTurno = await exigirTurnoParaCajon(supabase, cajon);
  if (sinTurno) return { error: sinTurno.error };
  const { data, error } = await supabase.rpc("anular_cobro_grupo", { p_grupo_id: grupoId, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  const cobros = ((data as { cobros?: RespuestaCobro[] } | null)?.cobros ?? []) as RespuestaCobro[];
  const totales = await totalesDeCuenta(supabase, reservaId);
  const retiro = await retiroDelCajon(supabase, cajon, motivo);
  return {
    error: null,
    totales,
    aviso: `Cobro junto anulado: ${cobros.length} cuentas volvieron a quedar por cobrar.${cobros.some((c) => c.turno_del_cobro_cerrado) ? AVISO_CERRADO : ""}${retiro}`,
    registros: await registrosDe(supabase, [{ t: "cobros_grupo", i: grupoId }, { t: "reservas", i: reservaId }, ...cobros.map((c) => ({ t: "reservas", i: c.reserva_id }))]),
  };
}

export async function editarMontoCobro(cobroId: string, metodo: string, montoNuevo: number, motivo: string, reservaId?: string | null, cajon?: number): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  if (!Number.isFinite(montoNuevo) || montoNuevo <= 0) return { error: "El monto nuevo debe ser mayor a cero. Para dejar el cobro en cero, anúlalo." };
  if (motivo.trim().length < 5) return { error: "Escribe el motivo de la corrección (qué estaba mal)." };
  const supabase = await createSupabaseServerClient();
  const sinTurno = await exigirTurnoParaCajon(supabase, cajon);
  if (sinTurno) return { error: sinTurno.error };
  const { data, error } = await supabase.rpc("editar_monto_cobro", { p_cobro_id: cobroId, p_metodo: metodo, p_monto_nuevo: montoNuevo, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  const d = data as RespuestaCobro | null;
  const totales = await totalesDeCuenta(supabase, reservaId ?? d?.reserva_id);
  const retiro = await retiroDelCajon(supabase, cajon, motivo);
  return {
    error: null,
    totales,
    aviso: `Monto corregido. Queda en el historial con el valor anterior y tu nombre.${d?.turno_del_cobro_cerrado ? AVISO_CERRADO : ""}${retiro}`,
    registros: await registrosDe(supabase, [{ t: "cobros", i: cobroId }, { t: "reservas", i: reservaId ?? d?.reserva_id }]),
  };
}

export async function corregirPrecioCuenta(reservaId: string, lineaTipo: string, lineaId: string, precioNuevo: number, motivo: string): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  if (!Number.isFinite(precioNuevo) || precioNuevo <= 0) return { error: "El precio nuevo debe ser mayor a cero. Para cobrar menos a propósito, aplica un descuento." };
  if (motivo.trim().length < 5) return { error: "Escribe el motivo de la corrección (qué estaba mal)." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("corregir_precio_cuenta", { p_reserva_id: reservaId, p_linea_tipo: lineaTipo, p_linea_id: lineaId, p_precio_nuevo: precioNuevo, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  const saldo = (data as RespuestaCobro | null)?.saldo ?? 0;
  // QA S17 (N82): el encabezado y el saldo se pintan de inmediato con la cuenta ya corregida.
  const totales = await totalesDeCuenta(supabase, reservaId);
  return {
    error: null,
    totales,
    aviso: saldo < 0 ? "Precio corregido. La cuenta quedó con saldo a favor del cliente: devuélvelo con una devolución." : "Precio corregido (no es un descuento). Queda en el historial.",
    registros: await registrosDe(supabase, [{ t: "reservas", i: reservaId }]),
  };
}

/** QA S17 (N48): anular la corrección vigente de una línea; la línea vuelve a su precio original. */
export async function anularCorreccionPrecio(ajusteId: string, motivo: string, reservaId: string): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  if (motivo.trim().length < 5) return { error: "Escribe el motivo de la anulación (qué pasó)." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("anular_correccion_precio", { p_ajuste_id: ajusteId, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  const totales = await totalesDeCuenta(supabase, reservaId);
  return {
    error: null,
    totales,
    aviso: "Corrección anulada: la línea volvió a su precio original. Queda en el historial.",
    registros: await registrosDe(supabase, [{ t: "cuenta_ajustes_precio", i: ajusteId }, { t: "reservas", i: reservaId }]),
  };
}

export async function agregarEfectivo(monto: number, origen: string, nota: string): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto debe ser mayor a cero." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_efectivo_agregado", { p_monto: monto, p_origen: origen, p_nota: nota.trim() || null });
  if (error) return { error: traducirError(error) };
  refrescar();
  return {
    error: null,
    aviso: "Efectivo agregado al turno. Cuenta en el efectivo esperado del corte; no es una venta.",
    registros: await registrosDe(supabase, [{ t: "movimientos_caja", i: data as string | null }]),
  };
}

export async function cancelarEfectivoAgregado(id: string, motivo: string): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return { error: negado.error };
  if (!motivo.trim()) return { error: "Escribe por qué se cancela el efectivo agregado." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancelar_efectivo_agregado", { p_id: id, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  refrescar();
  return { error: null, aviso: "Cancelado.", registros: await registrosDe(supabase, [{ t: "movimientos_caja", i: id }]) };
}
