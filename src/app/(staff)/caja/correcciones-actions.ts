"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import { traducirError } from "../reservas/traducir-error";

// Anular y corregir cobros, corregir el precio de una cuenta y agregar efectivo
// al turno (migración 20261013000000). Los permisos y todas las reglas las
// comprueba la base con la sesión de quien llama: aquí solo se traduce.

export type ResultadoCorreccion = { error: string | null; aviso?: string };

async function demo(): Promise<ResultadoCorreccion | null> {
  return (await cargarNegocioLanding()).plan === "demo" ? { error: MENSAJE_SOLO_LECTURA } : null;
}

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

const AVISO_CERRADO = " El cobro era de un turno ya cerrado: el corte de ese turno no cambia y el ajuste quedó en el turno abierto.";

export async function anularCobro(cobroId: string, motivo: string, reservaId?: string | null): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return negado;
  if (motivo.trim().length < 5) return { error: "Escribe el motivo de la anulación (qué pasó)." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("anular_cobro", { p_cobro_id: cobroId, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  const d = data as RespuestaCobro | null;
  refrescar(reservaId ?? d?.reserva_id, d?.grupo_id);
  return { error: null, aviso: `Cobro anulado: la cuenta volvió a quedar por cobrar y el cobro salió de los totales.${d?.turno_del_cobro_cerrado ? AVISO_CERRADO : ""}` };
}

export async function anularCobroGrupo(grupoId: string, motivo: string): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return negado;
  if (motivo.trim().length < 5) return { error: "Escribe el motivo de la anulación (qué pasó)." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("anular_cobro_grupo", { p_grupo_id: grupoId, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  const cobros = ((data as { cobros?: RespuestaCobro[] } | null)?.cobros ?? []) as RespuestaCobro[];
  for (const c of cobros) refrescar(c.reserva_id, grupoId);
  refrescar(null, grupoId);
  return { error: null, aviso: `Cobro junto anulado: ${cobros.length} cuentas volvieron a quedar por cobrar.${cobros.some((c) => c.turno_del_cobro_cerrado) ? AVISO_CERRADO : ""}` };
}

export async function editarMontoCobro(cobroId: string, metodo: string, montoNuevo: number, motivo: string, reservaId?: string | null): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return negado;
  if (!Number.isFinite(montoNuevo) || montoNuevo <= 0) return { error: "El monto nuevo debe ser mayor a cero. Para dejar el cobro en cero, anúlalo." };
  if (motivo.trim().length < 5) return { error: "Escribe el motivo de la corrección (qué estaba mal)." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("editar_monto_cobro", { p_cobro_id: cobroId, p_metodo: metodo, p_monto_nuevo: montoNuevo, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  const d = data as RespuestaCobro | null;
  refrescar(reservaId ?? d?.reserva_id, d?.grupo_id);
  return { error: null, aviso: `Monto corregido. Queda en el historial con el valor anterior y tu nombre.${d?.turno_del_cobro_cerrado ? AVISO_CERRADO : ""}` };
}

export async function corregirPrecioCuenta(reservaId: string, lineaTipo: string, lineaId: string, precioNuevo: number, motivo: string): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return negado;
  if (!Number.isFinite(precioNuevo) || precioNuevo <= 0) return { error: "El precio nuevo debe ser mayor a cero. Para cobrar menos a propósito, aplica un descuento." };
  if (motivo.trim().length < 5) return { error: "Escribe el motivo de la corrección (qué estaba mal)." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("corregir_precio_cuenta", { p_reserva_id: reservaId, p_linea_tipo: lineaTipo, p_linea_id: lineaId, p_precio_nuevo: precioNuevo, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  const saldo = (data as RespuestaCobro | null)?.saldo ?? 0;
  refrescar(reservaId);
  return { error: null, aviso: saldo < 0 ? "Precio corregido. La cuenta quedó con saldo a favor del cliente: devuélvelo con una devolución." : "Precio corregido (no es un descuento). Queda en el historial." };
}

export async function agregarEfectivo(monto: number, origen: string, nota: string): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return negado;
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto debe ser mayor a cero." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("registrar_efectivo_agregado", { p_monto: monto, p_origen: origen, p_nota: nota.trim() || null });
  if (error) return { error: traducirError(error) };
  refrescar();
  return { error: null, aviso: "Efectivo agregado al turno. Cuenta en el efectivo esperado del corte; no es una venta." };
}

export async function cancelarEfectivoAgregado(id: string, motivo: string): Promise<ResultadoCorreccion> {
  const negado = await demo();
  if (negado) return negado;
  if (!motivo.trim()) return { error: "Escribe por qué se cancela el efectivo agregado." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancelar_efectivo_agregado", { p_id: id, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  refrescar();
  return { error: null, aviso: "Cancelado." };
}
