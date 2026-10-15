"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { MENSAJE_DEMO } from "@/lib/solo-lectura";
import { traducirError } from "../reservas/traducir-error";
import type { InfoCancelarCuenta } from "./cancelar-cuenta-tipos";

// Cancelar una cuenta que no se va a cobrar (migración 20261024500000). El permiso,
// el motivo, los cobros y la cita ligada los comprueba la base con la sesión de
// quien llama: aquí solo se traduce.

export type ResultadoCancelarCuenta = { error: string | null; aviso?: string };

export async function infoCancelarCuenta(reservaId: string): Promise<{ error: string | null; info: InfoCancelarCuenta | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cuenta_para_cancelar", { p_reserva_id: reservaId });
  if (error) return { error: traducirError(error), info: null };
  return { error: null, info: (data as InfoCancelarCuenta | null) ?? null };
}

export async function cancelarCuenta(
  reservaId: string,
  motivo: string,
  motivoTexto: string,
  cancelarCita: boolean
): Promise<ResultadoCancelarCuenta> {
  if ((await cargarNegocioLanding()).plan === "demo") return { error: MENSAJE_DEMO };
  if (!motivo) return { error: "Escoge el motivo." };
  if (motivo === "otro" && motivoTexto.trim().length < 5) return { error: "Con «Otro», escribe el motivo." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancelar_cuenta", {
    p_reserva_id: reservaId,
    p_motivo: motivo,
    p_motivo_texto: motivoTexto.trim() || null,
    p_cancelar_cita: cancelarCita,
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/caja");
  revalidatePath("/recepcion");
  revalidatePath("/estetica");
  revalidatePath("/guarderia");
  revalidatePath("/hotel");
  revalidatePath("/reservas/calendario");
  revalidatePath(`/caja/cobrar/${reservaId}`);
  revalidatePath(`/reservas/${reservaId}/cobrar`);
  const d = data as { citas_canceladas?: string[]; citas_no_canceladas?: string[]; estancias_canceladas?: string[]; estancias_no_canceladas?: string[] } | null;
  const citas = d?.citas_canceladas?.length ?? 0;
  const sin = (d?.citas_no_canceladas?.length ?? 0) + (d?.estancias_no_canceladas?.length ?? 0);
  const estancias = d?.estancias_canceladas?.length ?? 0;
  return {
    error: null,
    aviso:
      "Cuenta cancelada: salió de las cuentas por cobrar y quedó en el historial del cliente con el motivo y tu nombre." +
      (citas ? ` También se ${citas === 1 ? "canceló la cita" : "cancelaron las citas"}.` : "") +
      (estancias ? ` También se ${estancias === 1 ? "canceló la reserva" : "cancelaron las reservas"} y quedó libre su cupo.` : "") +
      (sin ? " Una cita o estancia ya empezada no se cancela desde aquí." : ""),
  };
}
