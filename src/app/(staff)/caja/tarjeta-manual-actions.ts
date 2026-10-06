"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MENSAJE_SOLO_LECTURA } from "@/lib/solo-lectura";
import { traducirError } from "../reservas/traducir-error";

// Revisión de las tarjetas manuales (migración 20261008000000). Todo es del
// admin y la base lo vuelve a comprobar con su sesión: aquí solo se traduce.
// «No recibida» no pregunta a ningún proveedor: la tarjeta manual no pasó por
// uno; el admin la contrasta con el voucher y el banco.

export type ResultadoTarjeta = { error: string | null; aviso?: string };

async function exigirAdmin(): Promise<ResultadoTarjeta | null> {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") return { error: "Solo un admin revisa las tarjetas manuales." };
  if ((await cargarNegocioLanding()).plan === "demo") return { error: MENSAJE_SOLO_LECTURA };
  return null;
}

function refrescar(reservaId?: string | null) {
  revalidatePath("/caja/conciliacion");
  revalidatePath("/caja/turno");
  revalidatePath("/recepcion");
  revalidatePath("/admin");
  if (reservaId) {
    revalidatePath(`/caja/cobrar/${reservaId}`);
    revalidatePath(`/reservas/${reservaId}/cobrar`);
  }
}

export async function revisarTarjetaManual(tarjetaId: string, nota: string, reservaId?: string | null): Promise<ResultadoTarjeta> {
  const negado = await exigirAdmin();
  if (negado) return negado;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("tarjeta_manual_revisar", { p_tarjeta_id: tarjetaId, p_nota: nota.trim() });
  if (error) return { error: traducirError(error) };
  refrescar(reservaId);
  return { error: null, aviso: "Listo: queda como revisada con el voucher." };
}

export async function marcarTarjetaManualNoRecibida(tarjetaId: string, motivo: string, reservaId?: string | null): Promise<ResultadoTarjeta> {
  const negado = await exigirAdmin();
  if (negado) return negado;
  if (motivo.trim().length < 5) return { error: "Escribe el motivo: qué pasó con este cobro." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("tarjeta_manual_no_recibida", { p_tarjeta_id: tarjetaId, p_motivo: motivo.trim() });
  if (error) return { error: traducirError(error) };
  refrescar(reservaId);
  const d = data as { turno_del_cobro_cerrado?: boolean } | null;
  return {
    error: null,
    aviso: d?.turno_del_cobro_cerrado
      ? "Listo. El cobro era de un turno ya cerrado: el ajuste quedó en el turno abierto y ese corte no cambia. La cuenta volvió a tener saldo."
      : "Listo: la cuenta volvió a tener saldo y el movimiento quedó en el turno abierto.",
  };
}

export async function guardarTopeTarjetaManual(tope: number): Promise<ResultadoTarjeta> {
  const negado = await exigirAdmin();
  if (negado) return negado;
  if (!Number.isFinite(tope) || tope <= 0) return { error: "El tope tiene que ser un monto mayor a cero." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_tope_tarjeta_manual", { p_tope: tope });
  if (error) return { error: traducirError(error) };
  revalidatePath("/admin/pagos");
  return { error: null, aviso: "Tope guardado." };
}
